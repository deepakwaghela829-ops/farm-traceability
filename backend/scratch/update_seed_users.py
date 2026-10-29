path = r"C:\Projects\farm-traceability\backend\app\seed_demo_users.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read().replace("\r\n", "\n")

old_code = """            # Seed Crops if empty
            crop_count = session.query(Crop).count()
            crops_seeded = 0
            if crop_count == 0:
                for crop_data in DEFAULT_DEMO_CROPS:
                    crop = Crop(**crop_data)
                    session.add(crop)
                    crops_seeded += 1

            session.commit()
        session.close()
    except Exception as exc:
        logger.warning("User seeding skipped or notice: %s", exc)


if __name__ == "__main__":
    seed_users()"""

new_code = '''            session.commit()
        session.close()
        logger.info("User accounts verified: created=%d, existing=%d", created_count, existing_count)
    except Exception as exc:
        logger.warning("User seeding skipped or notice: %s", exc)


def seed_demo_crops(target_engine=None, target_sessionmaker=None) -> int:
    """
    Explicitly seeds a small, clearly documented sample crop dataset for optional demonstration.
    This must ONLY be invoked explicitly by command, NEVER automatically on normal application startup.
    """
    active_engine = target_engine or engine
    active_sm = target_sessionmaker or SessionLocal
    crops_seeded = 0

    try:
        session = active_sm()
        for crop_data in DEFAULT_DEMO_CROPS:
            existing = session.scalars(
                select(Crop).where(Crop.crop_name == crop_data["crop_name"])
            ).first()
            if not existing:
                crop = Crop(**crop_data)
                session.add(crop)
                crops_seeded += 1
        session.commit()
        session.close()
        logger.info("Explicit demo crop seeding complete: %d sample crops added", crops_seeded)
    except Exception as exc:
        logger.error("Failed to seed demo crops: %s", exc)

    return crops_seeded


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Seed AgriTrace OS users and optional demo crops.")
    parser.add_argument("--with-crops", action="store_true", help="Explicitly seed sample demo crops (default: False)")
    parser.add_argument("--sync-passwords", action="store_true", help="Synchronize designated demo account passwords")
    args = parser.parse_args()

    seed_users(sync_passwords=args.sync_passwords)
    if args.with_crops:
        seed_demo_crops()'''

if old_code in content:
    content = content.replace(old_code, new_code)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print("Successfully updated seed_demo_users.py!")
else:
    print("Target not found in seed_demo_users.py!")
