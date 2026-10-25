from datetime import date
import os
from pathlib import Path
import sys

# Ensure backend directory is in sys.path when executed directly
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select
from app.db import Base, SessionLocal, engine
from app.models.crop import Crop
from app.models.user import User
from app.services.auth_service import hash_password

DEFAULT_DEMO_USERS = [
    {
        "username": "farmer1",
        "email": "farmer1@agritrace.local",
        "role": "FARMER",
        "full_name": "Ramesh Patel (Farmer)",
        "wallet_address": "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73",
    },
    {
        "username": "supplier1",
        "email": "supplier1@agritrace.local",
        "role": "SUPPLIER",
        "full_name": "Gujarat Agro Logistics (Supplier)",
        "wallet_address": "0xf17f52151EbEF6C7334FAD080c5704D77216b732",
    },
    {
        "username": "retailer1",
        "email": "retailer1@agritrace.local",
        "role": "RETAILER",
        "full_name": "Apex Organic Mart (Retailer)",
        "wallet_address": "0xC5fdf4076b8F3A5357c5E395ab970B5B54098Fef",
    },
    {
        "username": "consumer1",
        "email": "consumer1@agritrace.local",
        "role": "CONSUMER",
        "full_name": "Ananya Sharma (Consumer)",
        "wallet_address": "0x821aEa9a577a9b44299B9c15c88cf3087F3b5544",
    },
    {
        "username": "admin1",
        "email": "admin1@agritrace.local",
        "role": "ADMIN",
        "full_name": "System Auditor (Admin)",
        "wallet_address": "0x0d1d4e623D10F9FBA5Db95830F7d3839406C6AF2",
    },
]

DEFAULT_DEMO_CROPS = [
    {
        "farmer_id": "DEMO-FARMER-001",
        "crop_name": "Organic Robusta Banana",
        "crop_type": "Fruit",
        "quantity": 1200,
        "unit": "kg",
        "cultivation_date": date(2026, 6, 15),
        "expected_harvest_date": date(2026, 11, 20),
        "location": "Jalgaon, Maharashtra",
        "blockchain_crop_id": 1,
        "blockchain_chain_id": 1337,
    },
    {
        "farmer_id": "DEMO-FARMER-001",
        "crop_name": "Sharbati Golden Wheat",
        "crop_type": "Grain",
        "quantity": 3500,
        "unit": "kg",
        "cultivation_date": date(2026, 5, 10),
        "expected_harvest_date": date(2026, 10, 30),
        "location": "Sehore, Madhya Pradesh",
        "blockchain_crop_id": 2,
        "blockchain_chain_id": 1337,
    },
    {
        "farmer_id": "DEMO-FARMER-001",
        "crop_name": "Hybrid Roma Tomato",
        "crop_type": "Vegetable",
        "quantity": 850,
        "unit": "kg",
        "cultivation_date": date(2026, 7, 1),
        "expected_harvest_date": date(2026, 11, 5),
        "location": "Nashik, Maharashtra",
        "blockchain_crop_id": 3,
        "blockchain_chain_id": 1337,
    },
    {
        "farmer_id": "DEMO-FARMER-001",
        "crop_name": "Dehradun Basmati Rice",
        "crop_type": "Grain",
        "quantity": 2200,
        "unit": "kg",
        "cultivation_date": date(2026, 6, 1),
        "expected_harvest_date": date(2026, 11, 15),
        "location": "Dehradun, Uttarakhand",
        "blockchain_crop_id": 4,
        "blockchain_chain_id": 1337,
    },
    {
        "farmer_id": "DEMO-FARMER-001",
        "crop_name": "Ratnagiri Alphonso Mango",
        "crop_type": "Fruit",
        "quantity": 500,
        "unit": "kg",
        "cultivation_date": date(2026, 4, 1),
        "expected_harvest_date": date(2026, 10, 15),
        "location": "Ratnagiri, Maharashtra",
        "blockchain_crop_id": 5,
        "blockchain_chain_id": 1337,
    },
]


def seed_users(target_engine=None, target_sessionmaker=None):
    """Seeds default demo accounts and benchmark crops for viva & evaluation."""
    demo_password = os.getenv("DEMO_PASSWORD", "Demo12345!")
    active_engine = target_engine or engine
    active_sm = target_sessionmaker or SessionLocal

    try:
        # Ensure tables exist
        Base.metadata.create_all(bind=active_engine, checkfirst=True)
    except Exception as exc:
        print(f"[*] Notice on table creation check: {exc}")

    try:
        session = active_sm()
        created_count = 0
        existing_count = 0

        # Seed Users
        for user_data in DEFAULT_DEMO_USERS:
            existing = session.scalars(
                select(User).where(User.username == user_data["username"])
            ).first()

            if not existing:
                new_user = User(
                    username=user_data["username"],
                    email=user_data["email"],
                    hashed_password=hash_password(demo_password),
                    role=user_data["role"],
                    full_name=user_data["full_name"],
                    wallet_address=user_data["wallet_address"],
                )
                session.add(new_user)
                created_count += 1
                print(f"[+] Created demo user: {user_data['username']} (Role: {user_data['role']})")
            else:
                existing_count += 1
                print(f"[-] Existing demo user: {user_data['username']} (Role: {existing.role})")

        # Seed Crops if empty
        crop_count = session.query(Crop).count()
        crops_seeded = 0
        if crop_count == 0:
            for crop_data in DEFAULT_DEMO_CROPS:
                crop = Crop(**crop_data)
                session.add(crop)
                crops_seeded += 1
            print(f"[+] Seeded {crops_seeded} default demo crops into registry.")

        session.commit()
        session.close()
        print(f"\nSeeding complete: {created_count} users created, {existing_count} verified, {crops_seeded} crops added.")
    except Exception as exc:
        print(f"[!] User seeding skipped or failed: {exc}")


if __name__ == "__main__":
    seed_users()
