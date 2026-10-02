# Blockchain Layer Setup (Ethereum + Solidity + Ganache)

Scope: everything lives in `blockchain/`. Frontend, backend and Supabase are untouched.

## 1. Ganache
1. Install Ganache (GUI from archive.trufflesuite.com/ganache, or CLI: `npm i -g ganache`).
2. GUI: **New Workspace → Ethereum**, RPC server `http://127.0.0.1:7545`.
   CLI: `ganache` (RPC `http://127.0.0.1:8545`; then set `GANACHE_URL` in `.env`).
3. **Chain ID is normally `1337`** (GUI "Network ID 5777" is a different number). Verify: `npm run check`.

## 2. MetaMask
1. MetaMask → Networks → **Add network manually**:
   - Name: `Ganache Local`
   - RPC URL: `http://127.0.0.1:7545`
   - Chain ID: `1337` (use the value printed by `npm run check`)
   - Symbol: `ETH`
2. Import an account: Ganache key icon → copy private key → MetaMask → *Import account*.
   Local test keys only, never real funds.

## 3. Install and configure
```bash
cd blockchain
npm install
cp .env.example .env     # adjust GANACHE_URL / GANACHE_CHAIN_ID if needed
npm run compile
```

## 4. Deploy
```bash
npm run deploy           # = npx hardhat run scripts/deploy.js --network ganache
```
Writes:
- `deployment-info.json`: contract address, tx hash, chain ID, block, deployer
- `abi/CropRegistry.abi.json`: ABI only (for the future Vue integration)
- `artifacts/contracts/CropRegistry.sol/CropRegistry.json`: full Hardhat artifact

## 5. Test
```bash
npm test                 # runs against Ganache
npm run test:local       # runs on Hardhat's in-memory network (no Ganache needed)
npm run demo             # registerCrop -> prints tx hash -> reads back via getCrop/getFarmerCrops
```
Tests cover `registerCrop()`, `getCrop()`, `getFarmerCrops()` and the revert cases.

## 6. Proof checklist
- Contract address + tx hash: `deployment-info.json`; demo tx hash: `npm run demo` output
- Ganache screenshot: **Transactions** tab (contract creation + registerCrop) and **Contracts** tab
- MetaMask screenshot: network `Ganache Local` selected with an imported account balance
- Git: `git checkout -b feature/blockchain-ganache`, commit only `blockchain/`, then `git rev-parse --short HEAD`
