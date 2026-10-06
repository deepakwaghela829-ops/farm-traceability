# AgriTrace OS — Enterprise Farm Traceability System
**Final-Year Major Project (B.E. Computer Engineering)**

AgriTrace OS is an end-to-end, cryptographically verified agricultural supply chain traceability platform. It combines decentralized smart contracts, an off-chain relational database, machine learning-driven fair price forecasting, role-based access control, and consumer packaging QR codes into a unified enterprise interface.

---

## 1. System Architecture (Role-Separated Portals & Layered Service Engine)

```text
                                  AGRITRACE OS
                                       │
                              ┌────────┴────────┐
                              │  Authentication │
                              │   JWT + RBAC    │
                              └────────┬────────┘
                                       │
        ┌───────────────┬──────────────┼──────────────┬───────────────┐
        │               │              │              │               │
        ▼               ▼              ▼              ▼               ▼
   FARMER PORTAL  SUPPLIER PORTAL RETAILER PORTAL CONSUMER PORTAL ADMIN PORTAL
  (Crop Register, (Wholesale In,  (Inventory,     (Public Scan,   (Audit Logs,
   AI Pricing)     Custody Trans)  Shelf Proven)   No Login Req)   User Mgmt)
        │               │              │              │               │
        └───────────────┴───────┬──────┴──────────────┘               │
                                ▼                                     │
                    ┌───────────────────────┐                         │
                    │ FastAPI Service Layer │◄────────────────────────┘
                    │   (/api/auth, /crops, │
                    │   /txs, /prediction)  │
                    └───────────┬───────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
 ┌──────────────┐       ┌──────────────┐       ┌─────────────────┐
 │ Crop Service │       │ Custody/Tx   │       │ AI Price Engine │
 │  Management  │       │ Traceability │       │  Random Forest  │
 └──────┬───────┘       └──────┬───────┘       └────────┬────────┘
        │                      │                        │
        └──────────────────────┼────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
   ┌────────────────────────┐    ┌────────────────────────┐
   │ PostgreSQL / Supabase  │    │  Ganache EVM (1337)    │
   │ Users, Crops, Audits   │    │  CropRegistry.sol      │
   └────────────────────────┘    └────────────────────────┘
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

## 5. Quick Start: Local Viva Demonstration

For evaluators and fresh installations on a local Windows machine, automated PowerShell scripts handle the entire setup and runtime:

### Automated Setup (One-Time)
```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-viva.ps1
```
*Verifies Node.js & Python runtimes, creates the Python virtualenv, and installs frontend, backend, and blockchain dependencies.*

### Start Local Viva Environment
```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-viva.ps1
```
*Checks/starts Ganache on `http://127.0.0.1:7545`, deploys a fresh `CropRegistry` instance, auto-syncs deployment metadata, seeds demo users, and launches FastAPI (`http://127.0.0.1:8000`) and Vite (`http://localhost:5173`).*

### Stop Local Viva Environment
```powershell
powershell -ExecutionPolicy Bypass -File scripts\stop-viva.ps1
```
*Safely terminates only the background processes launched by `start-viva.ps1`.*

---

## 6. Manual Setup & Running Instructions

### Prerequisites
- Node.js >= 18
- Python >= 3.11
- Ganache (GUI or CLI) running on port `7545` (Chain ID `1337`)

### 1. Blockchain (Ganache & Hardhat)
```bash
cd blockchain
npm install
npm run check    # Verify connection to http://127.0.0.1:7545 (Chain ID 1337)
npm run deploy   # Compiles and deploys CropRegistry.sol to local Ganache
```
*Note: Deploying automatically regenerates and propagates `deployment-info.json` and `CropRegistry.abi.json` to both `blockchain/` and `frontend/src/blockchain/`.*

### 2. Backend (FastAPI)
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows (or: source .venv/bin/activate on Unix)
pip install -r requirements.txt
python app/seed_demo_users.py
uvicorn app.main:app --reload --port 8000
```
API Documentation will be available at: `http://127.0.0.1:8000/docs`

### 3. Frontend (Vue 3 + Vite)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 7. Key API Reference

The backend exposes fully typed REST endpoints:

- **Authentication & RBAC (`/api/auth`):**
  - `POST /api/auth/register` — Registers a new user account with specified role.
  - `POST /api/auth/login` — Authenticates credentials and returns signed JWT bearer token.
  - `GET /api/auth/me` — Returns current authenticated user profile.
  - `GET /api/auth/users` — Admin-only endpoint returning all registered system accounts.
- **Crop Registry & Lifecycle (`/api/crops`):**
  - `GET /api/crops` — Lists all registered crops (supports category and search filtering).
  - `POST /api/crops` — Registers a new crop batch (Farmer role required; synchronizes on-chain and database state).
  - `GET /api/crops/{crop_id}` — Retrieves comprehensive provenance record for a specific crop ID.
- **Custody Handover & Traceability (`/api/transactions`):**
  - `POST /api/transactions` — Logs a custody handover transaction (Farmer → Supplier → Retailer).
  - `GET /api/transactions/crop/{crop_id}` — Retrieves full timeline audit trail for a crop batch.
- **AI Price Prediction Engine (`/api/prediction`):**
  - `POST /api/prediction/predict` — Runs trained Random Forest ML regression on regional agricultural indicators.
  - `GET /api/prediction/benchmarks` — Retrieves regional mandi benchmark figures.

---

## 8. Demonstration / Viva Accounts

The platform includes seeded accounts for role-based evaluation and viva demonstrations:

| Username | Default Password | Role | Description |
| :--- | :--- | :--- | :--- |
| `farmer1` | `Demo12345!` | **FARMER** | Ramesh Patel (Lead Farmer, Palghar) |
| `supplier1` | `Demo12345!` | **SUPPLIER** | Gujarat Agro Logistics (Wholesale Custody) |
| `retailer1` | `Demo12345!` | **RETAILER** | Apex Organic Mart (Retail Shelf Receipt) |
| `consumer1` | `Demo12345!` | **CONSUMER** | Ananya Sharma (Consumer Provenance) |
| `admin1` | `Demo12345!` | **ADMIN** | System Auditor & Platform Admin |

*Note: Credentials are initialized locally via `python backend/app/seed_demo_users.py`. Clicking "Browse as Public Consumer" or scanning any packaging QR code allows immediate open verification without requiring a login.*

---

## 9. Testing & Quality Verification

### Backend Pytest Suite
```bash
cd backend
pytest -v
```
*Current test status: 21/21 passing tests covering Authentication, RBAC, Crop Management, ML Regression, and Custody Handover.*

### Frontend Production Build
```bash
cd frontend
npm run build
```
*Compiles with TypeScript type check (`vue-tsc -b`) and Vite production bundler with 0 errors.*

---

## 10. Local Blockchain vs Cloud Production Deployment

### Local Development / Viva Mode
- **Ganache EVM** runs locally at `http://127.0.0.1:7545` with Chain ID `1337`.
- Provides instant, zero-cost, deterministic smart contract execution for local demonstration and viva evaluation.
- Contract addresses are auto-synchronized to the frontend via `scripts/deploy.js`.

### Cloud Production Deployment (Vercel + Supabase)
- **Frontend URL:** `https://frontend-tau-three-20.vercel.app`
- **Backend API URL:** `https://farm-traceability-backend.vercel.app`
- **Database:** Supabase PostgreSQL with connection pooler.
- **Blockchain Resiliency:** The public cloud deployment queries verified relational provenance from Supabase. When Ganache is not running locally, off-chain crops are explicitly badged as `DATABASE VERIFIED — OFF-CHAIN`, ensuring complete transparency without claiming false on-chain synchronization.

---

## 11. Academic Viva Q&A Guide

### Q1: Why use both Blockchain and PostgreSQL (Hybrid Architecture)?
**Answer:** Blockchain provides immutable, tamper-evident custody verification and non-repudiation between distrusting supply chain stakeholders (Farmer, Supplier, Retailer). However, on-chain storage is computationally expensive and slow for search, filtering, and rich metadata. PostgreSQL provides fast search, inventory filtering, and relational storage, while the blockchain acts as the immutable verification source.

### Q2: Why is the AI Price Prediction model needed in a traceability system?
**Answer:** Price transparency prevents the exploitation of smallholder farmers by middlemen. The ML model (Random Forest Regressor) evaluates regional factors (historical mandi rates, production yield, seasonal cycles, and market demand index) to predict a fair benchmark farm-gate price at the moment of registration.

### Q3: What happens if Ganache or the blockchain goes offline?
**Answer:** The system has dual-mode resilience. When on-chain connectivity is unavailable, the frontend issues a clear warning and falls back to verified PostgreSQL records, distinctly labeling records as `DATABASE VERIFIED — OFF-CHAIN` rather than falsely claiming on-chain synchronization.

### Q4: What are the project limitations?
- **Blockchain:** Ganache is used for cost-free, deterministic demonstration. Production deployment would target an Ethereum Layer-2 (e.g., Polygon, Arbitrum).
- **Physical Verification:** QR codes bridge the digital-physical boundary; enterprise production would incorporate tamper-evident NFC tags or physical seals.
