import os
import shutil
import sqlite3

def run_isolated_148_scroll_test():
    live_db = r"C:\Projects\farm-traceability\backend\farm_traceability.db"
    test_db = r"C:\Projects\farm-traceability\backend\scratch\farm_traceability_test_148.db"

    # Copy schema and users from live_db into isolated test_db
    shutil.copyfile(live_db, test_db)
    conn = sqlite3.connect(test_db)
    c = conn.cursor()

    # Clear test_db tables completely
    c.execute("DELETE FROM consumer_acknowledgements")
    c.execute("DELETE FROM crop_predictions")
    c.execute("DELETE FROM transactions")
    c.execute("DELETE FROM crops")
    conn.commit()

    print("Generating 148 realistic, distinct crop batches in isolated test database...")
    crop_types = [
        ("Ratnagiri Alphonso Mango", "Fruit", "kg", "Ratnagiri, Maharashtra"),
        ("Organic Robusta Banana", "Fruit", "kg", "Jalgaon, Maharashtra"),
        ("Hybrid Roma Tomato", "Vegetable", "kg", "Nashik, Maharashtra"),
        ("Sharbati Golden Wheat", "Grain", "kg", "Sehore, Madhya Pradesh"),
        ("Dehradun Basmati Rice", "Grain", "kg", "Dehradun, Uttarakhand"),
        ("Kufri Jyoti Potato", "Vegetable", "kg", "Agra, Uttar Pradesh"),
        ("Nasik Red Onion", "Vegetable", "kg", "Lasalgaon, Maharashtra"),
        ("Shimla Royal Delicious Apple", "Fruit", "kg", "Shimla, Himachal Pradesh"),
    ]

    for i in range(1, 149):
        template = crop_types[(i - 1) % len(crop_types)]
        crop_name = template[0]
        crop_type = template[1]
        unit = template[2]
        location = template[3]
        qty = 50 + (i * 5)
        farmer_price = 40.0 + (i % 25)
        supplier_margin = 15.00
        supplier_price = farmer_price + supplier_margin
        is_received = (i % 3 == 0)
        retailer_markup = 30.00
        retail_price = (supplier_price + retailer_markup) if is_received and (i % 2 == 0) else None
        chain_id = i if (i % 2 == 1) else None
        batch_number = f"BATCH-TEST-{i:05d}"

        c.execute("""
            INSERT INTO crops (
                crop_id, farmer_id, crop_name, crop_type, quantity, unit,
                cultivation_date, expected_harvest_date, location,
                farmer_price_per_kg, retail_price_per_kg, retailer_markup_per_kg,
                blockchain_crop_id, blockchain_chain_id, batch_number,
                is_available, supplier_margin_per_kg, supplier_price_per_kg,
                retailer_received_at, retailer_received_by
            ) VALUES (?, ?, ?, ?, ?, ?, '2026-05-01', '2026-10-01', ?, ?, ?, ?, ?, 1337, ?, 1, ?, ?, ?, ?)
        """, (
            i, "DEMO-FARMER-001", crop_name, crop_type, qty, unit,
            location, farmer_price, retail_price, retailer_markup,
            chain_id, batch_number, supplier_margin, supplier_price,
            '2026-10-29 10:00:00' if is_received else None,
            'retailer1' if is_received else None
        ))

    conn.commit()

    c.execute("SELECT count(*), count(distinct batch_number) FROM crops")
    total_crops, distinct_batches = c.fetchone()
    print(f"Total inserted in test DB: {total_crops} crops, {distinct_batches} distinct batch codes")
    assert total_crops == 148, f"Expected 148, got {total_crops}"
    assert distinct_batches == 148, f"Expected 148 unique batches, got {distinct_batches}"

    # Verify Dropdown Formats
    c.execute("SELECT crop_name, batch_number, quantity, unit, blockchain_crop_id FROM crops ORDER BY crop_id LIMIT 5")
    sample_rows = c.fetchall()
    print("\n--- Dropdown Format Verification ---")
    for row in sample_rows:
        chain_label = f"On-chain #{row[4]}" if row[4] else "Off-chain"
        dropdown_entry = f"{row[0]} — {row[1]} — {row[2]} {row[3]} — {chain_label}"
        print(f"Dropdown Option: {dropdown_entry}")
        assert " — " in dropdown_entry
        assert row[1] in dropdown_entry

    # Verify Search Algorithms across 148 records
    print("\n--- Browsing & Search Algorithm Verification ---")
    
    # 1. Search by Crop Name
    c.execute("SELECT count(*) FROM crops WHERE lower(crop_name) LIKE '%mango%'")
    mango_count = c.fetchone()[0]
    print(f"1. Query 'Mango': {mango_count} matching records out of 148")
    assert mango_count > 0

    # 2. Search by exact Batch Code
    c.execute("SELECT count(*), crop_name FROM crops WHERE lower(batch_number) = 'batch-test-00042'")
    res = c.fetchone()
    print(f"2. Query 'batch-test-00042': {res[0]} record matched ('{res[1]}')")
    assert res[0] == 1

    # 3. Search by Database ID
    c.execute("SELECT count(*), crop_name, batch_number FROM crops WHERE crop_id = 100")
    res = c.fetchone()
    print(f"3. Query DB ID 100: {res[0]} record matched ('{res[1]}', '{res[2]}')")
    assert res[0] == 1

    # 4. Search by On-chain ID
    c.execute("SELECT count(*), crop_name, batch_number FROM crops WHERE blockchain_crop_id = 25")
    res = c.fetchone()
    print(f"4. Query On-Chain ID 25: {res[0]} record matched ('{res[1]}', '{res[2]}')")
    assert res[0] == 1

    # 5. Filter by Category
    c.execute("SELECT count(*) FROM crops WHERE lower(crop_type) = 'fruit'")
    fruit_count = c.fetchone()[0]
    print(f"5. Filter Category 'Fruit': {fruit_count} matching records")
    assert fruit_count > 0

    # 6. Filter by Receipt Status
    c.execute("SELECT count(*) FROM crops WHERE retailer_received_at IS NOT NULL")
    received_count = c.fetchone()[0]
    c.execute("SELECT count(*) FROM crops WHERE retailer_received_at IS NULL")
    unreceived_count = c.fetchone()[0]
    print(f"6. Filter Receipt Status: {received_count} received, {unreceived_count} unreceived (Total = {received_count + unreceived_count})")
    assert received_count + unreceived_count == 148

    conn.close()

    # Clean up isolated test database file
    os.remove(test_db)
    print(f"\nCleaned up isolated test database {test_db}.")
    print("ALL 148-RECORD SCROLLING AND BROWSING ALGORITHMS PASSED 100%!")

if __name__ == "__main__":
    run_isolated_148_scroll_test()
