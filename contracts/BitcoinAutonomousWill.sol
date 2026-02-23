// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/*
BitcoinAutonomousWill (Bitcoin-Native Hackathon Edition)

Design principles:
- Heirs identified by Bitcoin address (tb1q..., bc1q..., etc.)
- Each vault owns isolated escrow
- Pull-payment pattern — heirs withdraw individually
- Claim race impossible
- Revival allowed but bounded
*/

contract BitcoinAutonomousWill is ReentrancyGuard {

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 public constant MAX_HEIRS = 10;
    uint256 public constant PERCENT_BASE = 100;
    uint256 public constant EXPIRY_GRACE_PERIOD = 5 minutes;
    uint256 public constant MIN_CHECKIN_COOLDOWN = 1 hours;
    uint256 public constant MAX_INTERVAL_DAYS = 36500; // 100 years
    uint256 public constant MAX_TOTAL_LIFETIME = 50 * 365 days;

    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/

    struct Heir {
        string btcAddress;  // Bitcoin address (tb1q..., bc1q..., etc.)
        uint256 percentage;
    }

    struct Vault {
        uint256 createdAt;
        uint256 lastCheckIn;
        uint256 checkInInterval;

        bool isActive;
        bool isClaimed;
        bool claimInitiated;
    }

    struct VaultStatus {
        bool exists;
        bool active;
        bool expired;
        bool claimed;
        uint256 balance;
        uint256 timeRemaining;
        uint256 interval;
    }

    /*//////////////////////////////////////////////////////////////
                               STORAGE
    //////////////////////////////////////////////////////////////*/

    mapping(address => Vault) public vaults;
    mapping(address => Heir[]) private vaultHeirs;
    mapping(address => uint256) public escrowed;
    // Keyed by keccak256(btcAddress) so heirs withdraw by BTC address
    mapping(bytes32 => uint256) public pendingWithdrawals;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event VaultCreated(address indexed owner, uint256 amount, uint256 interval);
    event CheckIn(address indexed owner, uint256 time);
    event VaultRevived(address indexed owner, uint256 addedAmount);
    event VaultCanceled(address indexed owner, uint256 refund);
    event ClaimStarted(address indexed owner, address indexed executor);
    event InheritanceScheduled(address indexed owner, uint256 totalAmount);
    event WithdrawalClaimed(string btcAddress, address indexed recipient, uint256 amount);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error InvalidInterval();
    error NotActive();
    error AlreadyClaimed();
    error NotExpired();
    error VaultExpired();
    error Cooldown();
    error Unauthorized();
    error NothingToWithdraw();
    error LifetimeExceeded();

    /*//////////////////////////////////////////////////////////////
                              CORE LOGIC
    //////////////////////////////////////////////////////////////*/

    function createVault(
        Heir[] calldata heirs_,
        uint256 intervalMinutes
    ) external payable {

        if (escrowed[msg.sender] != 0) revert NotActive();
        if (msg.value == 0) revert NotActive();
        if (intervalMinutes == 0 || intervalMinutes > MAX_INTERVAL_DAYS * 1440) revert InvalidInterval();

        delete vaultHeirs[msg.sender];
        _validateHeirs(msg.sender, heirs_);

        Vault storage v = vaults[msg.sender];

        v.createdAt = block.timestamp;
        v.lastCheckIn = block.timestamp;
        v.checkInInterval = intervalMinutes * 1 minutes;
        v.isActive = true;
        v.isClaimed = false;
        v.claimInitiated = false;

        escrowed[msg.sender] = msg.value;

        emit VaultCreated(msg.sender, msg.value, v.checkInInterval);
    }

    function checkIn() external {

        Vault storage v = vaults[msg.sender];
        if (!v.isActive) revert NotActive();
        if (v.isClaimed) revert AlreadyClaimed();

        if (block.timestamp > v.createdAt + MAX_TOTAL_LIFETIME)
            revert LifetimeExceeded();

        if (!_expired(v)) {
            uint256 cooldown = MIN_CHECKIN_COOLDOWN;
            if (v.checkInInterval < cooldown) cooldown = v.checkInInterval;
            if (block.timestamp < v.lastCheckIn + cooldown) revert Cooldown();
        }

        v.lastCheckIn = block.timestamp;
        emit CheckIn(msg.sender, block.timestamp);
    }

    function revive() external payable {

        Vault storage v = vaults[msg.sender];

        if (!v.isActive) revert NotActive();
        if (v.claimInitiated) revert AlreadyClaimed();
        if (!_expired(v)) revert NotExpired();
        if (block.timestamp > v.createdAt + MAX_TOTAL_LIFETIME)
            revert LifetimeExceeded();

        v.lastCheckIn = block.timestamp;
        escrowed[msg.sender] += msg.value;

        emit VaultRevived(msg.sender, msg.value);
    }

    function cancelVault() external nonReentrant {

        Vault storage v = vaults[msg.sender];
        if (!v.isActive) revert NotActive();
        if (_expired(v)) revert VaultExpired();

        uint256 amount = escrowed[msg.sender];

        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok);

        delete vaults[msg.sender];
        delete vaultHeirs[msg.sender];
        delete escrowed[msg.sender];

        emit VaultCanceled(msg.sender, amount);
    }

    /*//////////////////////////////////////////////////////////////
                         INHERITANCE EXECUTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Any heir can trigger the claim. Pass your BTC address to prove you're a beneficiary.
    function claimInheritance(address owner, string calldata btcAddress) external nonReentrant {

        Vault storage v = vaults[owner];
        if (!v.isActive) revert NotActive();
        if (!_expired(v)) revert NotExpired();
        if (!_isHeir(owner, btcAddress)) revert Unauthorized();

        uint256 total = escrowed[owner];

        v.claimInitiated = true;
        v.isActive = false;
        v.isClaimed = true;
        escrowed[owner] = 0;

        emit ClaimStarted(owner, msg.sender);

        Heir[] storage heirs = vaultHeirs[owner];
        uint256 distributed;

        for (uint256 i; i < heirs.length; ++i) {
            uint256 share = (total * heirs[i].percentage) / PERCENT_BASE;
            if (i == heirs.length - 1) share = total - distributed;

            bytes32 key = keccak256(bytes(heirs[i].btcAddress));
            pendingWithdrawals[key] += share;
            distributed += share;
        }

        emit InheritanceScheduled(owner, total);
    }

    /// @notice Heir withdraws by providing their BTC address. Funds go to msg.sender (their Midl EVM address).
    function withdraw(string calldata btcAddress) external nonReentrant {

        bytes32 key = keccak256(bytes(btcAddress));
        uint256 amount = pendingWithdrawals[key];
        if (amount == 0) revert NothingToWithdraw();

        pendingWithdrawals[key] = 0;

        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok);

        emit WithdrawalClaimed(btcAddress, msg.sender, amount);
    }

    /*//////////////////////////////////////////////////////////////
                               VIEW
    //////////////////////////////////////////////////////////////*/

    function getStatus(address owner) external view returns (VaultStatus memory s) {

        Vault storage v = vaults[owner];

        if (v.createdAt == 0)
            return VaultStatus(false,false,false,false,0,0,0);

        bool exp = _expired(v);

        uint256 end = v.lastCheckIn + v.checkInInterval;
        uint256 remaining = block.timestamp >= end ? 0 : end - block.timestamp;

        return VaultStatus(
            true,
            v.isActive,
            exp,
            v.isClaimed,
            escrowed[owner],
            remaining,
            v.checkInInterval
        );
    }

    function getHeirs(address owner) external view returns (Heir[] memory) {
        return vaultHeirs[owner];
    }

    function getPendingWithdrawal(string calldata btcAddress) external view returns (uint256) {
        bytes32 key = keccak256(bytes(btcAddress));
        return pendingWithdrawals[key];
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _expired(Vault storage v) private view returns(bool) {
        return block.timestamp >= v.lastCheckIn + v.checkInInterval + EXPIRY_GRACE_PERIOD;
    }

    function _isHeir(address owner, string memory btcAddr) private view returns(bool) {
        bytes32 target = keccak256(bytes(btcAddr));
        Heir[] storage heirs = vaultHeirs[owner];
        for (uint256 i; i < heirs.length; ++i)
            if (keccak256(bytes(heirs[i].btcAddress)) == target) return true;
        return false;
    }

    function _validateHeirs(address owner, Heir[] calldata heirs_) private {

        require(heirs_.length > 0 && heirs_.length <= MAX_HEIRS);

        uint256 total;

        for (uint256 i; i < heirs_.length; ++i) {
            require(bytes(heirs_[i].btcAddress).length > 0);
            Heir memory h = heirs_[i];
            total += h.percentage;
            vaultHeirs[owner].push(h);
        }

        require(total == PERCENT_BASE);
    }
}
