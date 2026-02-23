# BitLegacy

Bitcoin Autonomous Will smart contracts, deployment scripts, and a small frontend for interacting with a deployed vault on the Midl EVM.

## Problem

Crypto assets are often lost when an owner can no longer access their keys. Traditional estate processes are slow and custodial services require trust. On Bitcoin, it is also hard to express flexible inheritance rules without intermediaries.

## Solution

BitLegacy provides a self-custody vault that releases funds to a set of heirs if the owner stops checking in for a configurable period. Heirs are identified by Bitcoin address strings, and each heir can independently withdraw their share after the vault expires.

## How It Works

1. Owner calls `createVault` with heirs (BTC address + percentage, total 100) and a check-in interval in minutes, funding the vault with native value on the Midl EVM.
2. Owner calls `checkIn` periodically to reset the timer. If the interval plus a grace period elapses, the vault expires.
3. If expired, any listed heir can call `claimInheritance` to schedule distribution.
4. Each heir calls `withdraw` with their BTC address to receive funds to their Midl EVM address.
5. The owner can `cancelVault` before expiry for a full refund, or `revive` after expiry (but before a claim) to continue the vault and add funds.

## Contract Limits

- Max heirs: 10
- Percent total: 100
- Max interval: 100 years
- Minimum check-in cooldown: 1 hour (or the interval if shorter)
- Grace period: 5 minutes
- Max total lifetime: 50 years

## Security And Limitations

- Hackathon edition. Not audited.
- Heir identity is based only on the BTC address string stored on-chain. The contract does not verify ownership of that BTC address. Anyone who knows an heir's BTC address can call `withdraw` and receive the funds to their own Midl EVM address.
- Funds are held in the contract until claimed or canceled. Use for demos and testing unless you complete a formal audit and add stronger proofs.

## Quick Start

```bash
npm install
npm run compile
npm test
```

## Common Commands

```bash
npm run compile
npm test
npm run deploy:regtest
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend reads the ABI from `frontend/src/abis/BitcoinAutonomousWill.json` and deployment data from `deployments/`.

## Project Layout

- `contracts/` Solidity contracts.
- `deploy/` and `scripts/` Deployment helpers.
- `deployments/` Deployment outputs used by the frontend and tests.
- `frontend/` UI for interacting with the contract.
- `test/` Hardhat tests.

## Notes

- This repo uses Hardhat and the Midl toolchain for deployment.
- Update `deployments/BitcoinAutonomousWill.json` and `frontend/src/abis/BitcoinAutonomousWill.json` after redeploying the contract.
