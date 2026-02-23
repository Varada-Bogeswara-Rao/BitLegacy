# BitLegacy

Bitcoin Autonomous Will smart contracts, deployment scripts, and a small frontend for interacting with the deployed contract.

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

## Project Layout

- `contracts/` Solidity contracts.
- `deploy/` and `scripts/` Deployment helpers.
- `deployments/` Deployment outputs used by the frontend and tests.
- `frontend/` UI for interacting with the contract.
- `test/` Hardhat tests.

## Notes

- This repo uses Hardhat and the Midl toolchain for deployment.
- The frontend expects the ABI in `frontend/src/abis/` and deployment data in `deployments/`.
