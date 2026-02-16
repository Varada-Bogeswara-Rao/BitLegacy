# Smart Contract Audit Report: BitcoinAutonomousWill

**Date:** 2026-02-16
**Subject:** `BitcoinAutonomousWill.sol` (Hackathon Edition)
**Auditor:** AntiGravity Agent

## Executive Summary
The `BitcoinAutonomousWill` contract is **ACTIONABLE** for the hackathon. It implements robust security patterns (Checks-Effects-Interactions, ReentrancyGuard) and safely handles the core logic of inheritance claiming.

There are no critical vulnerabilities that would prevent deployment or result in fund loss under intended usage. However, there are privacy implications inherent to the "hackathon mode" design choices.

## Findings

### 1. Security & Safety (PASSED)
- **Reentrancy**: All state-changing functions (`createVault`, `revive`, `cancelVault`, `claimInheritance`, `withdraw`) successfully use the `nonReentrant` modifier or follow the Checks-Effects-Interactions pattern.
- **Access Control**: Strict checks on `msg.sender` owner ownership and `_isHeir` validation prevent unauthorized access.
- **Fund Safety**:
    - Partial withdrawals are tracked via `pendingWithdrawals`.
    - Remainder "dust" from percentage division is correctly assigned to the last heir to prevent funds getting locked in the contract.
    - `cancelVault` correctly deletes storage before refunding.

### 2. Logic & Edge Cases (PASSED with Notes)
- **Heir Limits**: `MAX_HEIRS` (10) prevents out-of-gas errors during loops.
- **Forced Expiry**: The `MAX_TOTAL_LIFETIME` (50 years) check in `checkIn()` will eventually force the vault to expire (since the owner can no longer check in), allowing heirs to claim. This acts as a logical failsafe.
- **Zero-Percentage Heirs**: The `_validateHeirs` function does not strictly ban 0% heirs, but `claimInheritance` handles 0-value transfers gracefully (`if (amount == 0) continue`).

### 3. Data Privacy (CAUTION)
- **"Encrypted" Message**: The contract stores `bytes encryptedMessage`. The instructions specify storing plaintext for the hackathon.
    - **Risk**: Data on the blockchain is public. Even though the `getVaultStatus` function hides the message until revealed, **anyone running a node or using an explorer can decode the transaction input of `createVault` to read the message immediately.**
    - **Mitigation**: For the live demo, **DO NOT** put real secrets (seed phrases, private keys) in the message. Use a dummy secret like "The treasure is buried under the old oak tree."

### 4. Recommendations
- **Gas Optimization**: The `Heir[]` struct in storage is copied to memory in `claimInheritance`. With max 10 heirs, this is acceptable, but for production, this could be optimized.
- **Event Logging**: events are well-structured for frontend indexing.

## Conclusion
The contract acts as a solid foundation for the "Bitcoin Autonomous Will" demo. Proceed with deployment to Midl Regtest.
