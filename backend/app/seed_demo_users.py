import os
from pathlib import Path
import sys

# Ensure backend directory is in sys.path when executed directly
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select
from app.db import Base, SessionLocal, engine
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


def seed_users():
    """Seeds default demo accounts into the database for viva & evaluation."""
    demo_password = os.getenv("DEMO_PASSWORD", "Demo12345!")

    try:
        # Ensure tables exist
        Base.metadata.create_all(bind=engine, checkfirst=True)
    except Exception as exc:
        print(f"[*] Notice on table creation check: {exc}")

    try:
        session = SessionLocal()
        created_count = 0
        existing_count = 0

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

        session.commit()
        session.close()
        print(f"\nSeeding complete: {created_count} created, {existing_count} verified.")
    except Exception as exc:
        print(f"[!] User seeding skipped or failed (check DB connectivity): {exc}")


if __name__ == "__main__":
    seed_users()
