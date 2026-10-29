# scripts/export_public_batches.py
import sqlite3
import json
import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
DB_PATH = ROOT_DIR / "backend" / "farm_traceability.db"
OUTPUT_DIR = ROOT_DIR / "frontend" / "public" / "data"
OUTPUT_FILE = OUTPUT_DIR / "verified-crops.json"

os.makedirs(OUTPUT_DIR, exist_ok=True)

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

# Query crops
c.execute("""
    SELECT 
        crop_id, batch_number, crop_name, crop_type, quantity, unit,
        cultivation_date, expected_harvest_date, location, farmer_id,
        farmer_price_per_kg, supplier_margin_per_kg, supplier_price_per_kg,
        retail_price_per_kg, retailer_markup_per_kg, retail_confirmed_by,
        retail_confirmed_at, retailer_received_at, retailer_received_by,
        is_available, blockchain_crop_id, blockchain_tx_hash,
        blockchain_block_number, blockchain_farmer_address, created_at
    FROM crops
    ORDER BY crop_id ASC
""")
cols = [col[0] for col in c.description]
crops = [dict(zip(cols, row)) for row in c.fetchall()]

# Query transactions
c.execute("""
    SELECT 
        id, crop_id, event_type, from_address, to_address, to_role,
        transaction_hash, block_number, timestamp
    FROM transactions
    ORDER BY id ASC
""")
tx_cols = [col[0] for col in c.description]
transactions = [dict(zip(tx_cols, row)) for row in c.fetchall()]

# Trusted participants directory
directory = [
    {
        "username": "farmer1",
        "full_name": "Ramesh Patel (Farmer)",
        "role": "FARMER",
        "wallet_address": "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1",
    },
    {
        "username": "supplier1",
        "full_name": "Wasi Mumbai",
        "role": "SUPPLIER",
        "wallet_address": "0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0",
    },
    {
        "username": "retailer1",
        "full_name": "Apex Organic Mart (Retailer)",
        "role": "RETAILER",
        "wallet_address": "0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b",
    },
    {
        "username": "retailer2",
        "full_name": "GreenField Supermarket (Retailer)",
        "role": "RETAILER",
        "wallet_address": "0x95cED938F7991cd0dFcb48f0a06a40FA1aF46EBC",
    },
    {
        "username": "consumer1",
        "full_name": "Ananya Sharma (Consumer)",
        "role": "CONSUMER",
        "wallet_address": "0xE11BA2b4D45Eaed5996Cd0823791E0C93114882d",
    },
    {
        "username": "admin1",
        "full_name": "System Auditor (Admin)",
        "role": "ADMIN",
        "wallet_address": "0xd03ea8624C8C5987235048901fB614fDcA89b117",
    },
]

export_data = {
    "version": "1.0.0",
    "exported_at": "2026-10-29T22:25:00Z",
    "network": "local-ganache-chain-1337",
    "contract_address": "0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab",
    "crops": crops,
    "transactions": transactions,
    "directory": directory,
}

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(export_data, f, indent=2, ensure_ascii=False)

print(f"Exported {len(crops)} crops and {len(transactions)} transactions to {OUTPUT_FILE}")
