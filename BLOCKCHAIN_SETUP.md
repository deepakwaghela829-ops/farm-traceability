# Blockchain Layer Setup & Fresh Deployment Guide
## Farm Traceability System — Ethereum EVM + Solidity + Ganache

This document provides instructions for compiling, testing, and deploying the **CropRegistry** smart contract on a local Ganache Ethereum testnet or reproducible viva environment.

---

## 1. Architecture Overview

- **Smart Contract:** `blockchain/contracts/CropRegistry.sol` (Solidity `^0.8.24`)
- **Framework:** Hardhat (`@nomicfoundation/hardhat-ethers`, `ethers.js`)
- **Local Testnet:** Ganache GUI or Ganache CLI
- **RPC Endpoint:** `http://127.0.0.1:7545`
- **Chain ID:** `1337` (EVM Standard)
- **Automatic Metadata Propagation:** When deployed via `npm run deploy`, the script automatically regenerates and synchronizes both:
  - `blockchain/deployment-info.json` & `blockchain/abi/CropRegistry.abi.json`
  - `frontend/src/blockchain/deployment-info.json` & `frontend/src/blockchain/CropRegistry.abi.json`

---

## 2. Prerequisites

1. **Node.js** (v18.x or v20.x+)
2. **Ganache** (GUI or CLI):
   - **Ganache GUI**: Download from [trufflesuite.com/ganache](https://archive.trufflesuite.com/ganache/)
   - **Ganache CLI**: Install via `npm install -g ganache`

---

## 3. Fresh Laptop / Clean Machine Setup

When setting up on a fresh laptop or a clean Ganache instance, **do NOT rely on old contract addresses or previous state**. The smart contract must be deployed cleanly to the new chain.

### Step 3.1: Start Ganache
- **Option A (GUI):**
  1. Open Ganache.
  2. Select **New Workspace → Ethereum** (or Quickstart).
  3. In **Settings → Server**:
     - Hostname: `127.0.0.1`
     - Port Number: `7545`
     - Network ID: Default is fine (ensure RPC reports Chain ID `1337`).
  4. Save and Start Workspace.

- **Option B (CLI):**
  ```bash
  ganache --port 7545 --chainId 1337
  ```

### Step 3.2: Install Dependencies & Verify Network
Navigate to the `blockchain/` directory:
```bash
cd blockchain
npm install
```

Verify that Hardhat can communicate with your running Ganache instance:
```bash
npm run check
```
*Expected output:* Confirms connection to `http://127.0.0.1:7545`, Chain ID `1337`, and lists unlocked accounts.

### Step 3.3: Compile the Smart Contract
```bash
npm run compile
```
Compiles `contracts/CropRegistry.sol` using Solidity 0.8.24 and builds artifacts in `blockchain/artifacts/`.

### Step 3.4: Deploy to Fresh Ganache Instance
```bash
npm run deploy
```
*What this does automatically:*
1. Deploys a new `CropRegistry` instance to Ganache.
2. Extracts the contract address and transaction hash.
3. Writes the ABI to `blockchain/abi/CropRegistry.abi.json`.
4. Writes deployment details to `blockchain/deployment-info.json`.
5. **Propagates** the updated ABI and `deployment-info.json` directly to `frontend/src/blockchain/`.

*Sample output:*
```text
Deploying CropRegistry to "ganache" (chainId 1337) from 0x...
Contract address : 0x...
Deployment tx    : 0x...
Block            : 1
Saved deployment-info.json and abi/CropRegistry.abi.json
Synchronized ABI and deployment-info to frontend/src/blockchain/
```

---

## 4. Testing & Verification

Run the test suite against the local Ganache chain:
```bash
npm test
```
*Covers:*
- `registerCrop()`: On-chain registration of crop batch metadata.
- `transferCustody()`: Immutable handover between supply chain stakeholders.
- `getCrop()`: Dual-source on-chain record retrieval.
- `getFarmerCrops()`: Querying all batches registered by a farmer.
- Access control reverts and edge cases.

To run tests without Ganache running (using Hardhat's in-memory mock network):
```bash
npm run test:local
```

To run an end-to-end demo script registering a crop and verifying on-chain state:
```bash
npm run demo
```

---

## 5. MetaMask Configuration (Optional for Manual Browser Testing)

If interacting directly with the contract via MetaMask in a browser:
1. Open MetaMask → **Add Network** → **Add a network manually**:
   - Network Name: `Ganache Local`
   - RPC URL: `http://127.0.0.1:7545`
   - Chain ID: `1337`
   - Currency Symbol: `ETH`
2. **Import Account**:
   - In Ganache, click the key icon next to the first account (`0`).
   - Copy the Private Key.
   - In MetaMask: Account selector → **Add account or hardware wallet** → **Import account** → Paste private key.
3. *Note: Never use real private keys or mainnet funds in development.*

---

## 6. Cloud & Production Notice

In the production cloud deployment (e.g. Vercel + Supabase):
- The public web application queries the PostgreSQL/Supabase database.
- For crops registered before or outside local Ganache, the frontend gracefully displays `DATABASE VERIFIED — OFF-CHAIN`.
- When local Ganache is connected, full on-chain EVM cryptographic verification is executed in real-time.
