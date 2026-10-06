# AgriTrace OS — Enterprise Farm Traceability System
**Final-Year Major Project (B.E. Computer Engineering)**

AgriTrace OS is an end-to-end, cryptographically verified agricultural supply chain traceability platform. It combines decentralized smart contracts, an off-chain relational database, machine learning-driven fair price forecasting, role-based access control, and consumer packaging QR codes into a unified enterprise interface.

---

## 1. System Architecture

```text
                ┌────────────────────────────────────────────────────────┐
                │             Vue 3 + Vite Frontend (SPA)                │
                │  (Dashboard · Crop Entry · Traceability · Custody · AI) │
                └───────────────────────────┬────────────────────────────┘
                                            │ HTTP / REST API (JWT)
                                            ▼
                ┌────────────────────────────────────────────────────────┐
                │                  FastAPI Backend                       │
                │    (Auth · Crops · Custody Transactions · ML API)      │
                └──────────────┬─────────────────────────┬───────────────┘
                               │                         │
            Direct SQLAlchemy  │                         │ Scikit-Learn
                               ▼                         ▼
                ┌────────────────────────┐    ┌────────────────────────┐
                │  PostgreSQL / Supabase │    │ Random Forest Regressor│
                │  (Audited Relational)  │    │  (Fair Market Pricing) │
                └────────────────────────┘    └────────────────────────┘
                                            
                               ▲ Ethers.js (Web3)
                               │
                ┌────────────────────────────────────────────────────────┐
                │          Ethereum EVM (Ganache Local Testnet)          │
                │       CropRegistry.sol Smart Contract (Chain ID: 1337) │
                └────────────────────────────────────────────────────────┘
```

---

## 2. Core Modules & Supported Roles

The platform enforces Role-Based Access Control (RBAC) via secure JWT authentication:

| Role | Primary Functions | Key Views |
| :--- | :--- | :--- |
| **FARMER** | Registers new crop batches on Ethereum, specifies harvest dates, inspects AI fair prices | Dashboard, Crop Management, Add Crop, AI Price Forecast |
| **SUPPLIER** | Accepts harvested batches, inspects on-chain provenance, logs wholesale custody transfer | Dashboard, Custody Handover, Traceability |
| **RETAILER** | Receives shipments from suppliers, records shelf receipt, manages distribution batches | Dashboard, Custody Handover, Traceability |
| **CONSUMER** | Scans packaging QR codes or searches crop IDs to verify authentic farm origin & history | Product Verification, Public Provenance Timeline |
| **ADMIN** | Audits cryptographic transaction history, user accounts, and smart contract configuration | System Audit, User Management, Blockchain Parameters |

---

## 3. End-to-End Traceability Flow

```text
FARMER (Harvest Origin)
   ↓ [On-Chain Registration + PostgreSQL Sync]
CROP REGISTRATION (#CropID)
   ↓ [Calculates Expected Harvest Window]
CULTIVATION & HARVEST
   ↓ [Random Forest ML Inference on Market Benchmarks]
AI FAIR PRICE FORECAST
   ↓ [Smart Contract transferOwnership()]
SUPPLIER HANDOVER
   ↓ [Smart Contract transferOwnership()]
RETAILER HANDOVER
   ↓ [Downloadable Packaging QR Code Generated]
CONSUMER VERIFICATION
   ↓
AUTHENTIC TIMELINE & AUDIT RECORD
```

---

## 4. Technology Stack

- **Frontend:** Vue 3 (Composition API, `<script setup>`), TypeScript, Vite, Ethers.js v6, QRCode.
- **Backend:** FastAPI, Pydantic v2, Python 3.11, PyJWT, Cryptographic salted SHA-256.
- **Machine Learning:** Scikit-Learn (Random Forest Regressor), Pandas, NumPy.
- **Database:** PostgreSQL (Supabase cloud pooler) with SQLAlchemy 2.0 ORM.
- **Blockchain / Smart Contract:** Solidity (`CropRegistry.sol`), Hardhat, Ganache EVM testnet (Chain ID `1337`).

---

## 5. Local Setup & Running Instructions

### Prerequisites
- Node.js >= 18
- Python >= 3.11
- Ganache (GUI or CLI) running on port `7545`

### 1. Blockchain (Ganache)
Ensure Ganache is running with RPC URL `http://127.0.0.1:7545` and Chain ID `1337`.  
The deployed `CropRegistry` contract address is:
```text
0xd359Ed83d80A58272Bae78475c80665035942241
```

### 2. Backend (FastAPI)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Or on Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
API Documentation will be available at: `http://127.0.0.1:8000/docs`

### 3. Frontend (Vue 3)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 6. One-Click Viva / Evaluation Accounts

The platform includes demo credentials configured for live viva demonstrations:

| Username | Password | Role | Description |
| :--- | :--- | :--- | :--- |
| `farmer1` | `farmer123` | **FARMER** | Ramesh Patel (Lead Farmer, Palghar) |
| `supplier1` | `supplier123` | **SUPPLIER** | Apex Agro Logistics |
| `retailer1` | `retailer123` | **RETAILER** | FreshBazaar Organic Retail |
| `consumer1` | `consumer123` | **CONSUMER** | Pooja Sharma (Public Consumer) |
| `admin1` | `admin123` | **ADMIN** | System Auditor & Platform Admin |

*Note: Clicking "Browse as Public Consumer" or scanning any packaging QR code allows open verification without requiring a login.*

---

## 7. Testing & Verification

### Backend Pytest Suite
```bash
cd backend
pytest -v
```
*Current test status: 17/17 passing tests covering Auth, RBAC, Crops, Prediction, and Transactions.*

### Frontend Production Build
```bash
cd frontend
npm run build
```
*Compiles with TypeScript type check (`vue-tsc -b`) and Vite production bundler with 0 errors.*

---

## 8. Academic Viva Q&A Guide

### Q1: Why use both Blockchain and PostgreSQL (Hybrid Architecture)?
**Answer:** Blockchain provides immutable, tamper-evident custody verification and non-repudiation between distrusting supply chain stakeholders (Farmer, Supplier, Retailer). However, on-chain storage is computationally expensive and slow for search, filtering, and rich metadata. PostgreSQL provides fast search, inventory filtering, and relational storage, while the blockchain acts as the immutable verification source.

### Q2: Why is the AI Price Prediction model needed in a traceability system?
**Answer:** Price transparency prevents the exploitation of smallholder farmers by middlemen. The ML model (Random Forest Regressor) evaluates regional factors (historical mandi rates, production yield, seasonal cycles, and market demand index) to predict a fair benchmark farm-gate price at the moment of registration.

### Q3: What happens if Ganache or the blockchain goes offline?
**Answer:** The system has dual-mode resilience. When on-chain connectivity is unavailable, the frontend issues a clear warning and falls back to verified PostgreSQL records, distinctly labeling records as `DATABASE VERIFIED (OFF-CHAIN)` rather than falsely claiming on-chain synchronization.

### Q4: What are the project limitations?
- **Blockchain:** Ganache is used for cost-free, deterministic demonstration. Production deployment would target an Ethereum Layer-2 (e.g., Polygon, Arbitrum).
- **Physical Verification:** QR codes bridge the digital-physical boundary; enterprise production would incorporate tamper-evident NFC tags or physical seals.
