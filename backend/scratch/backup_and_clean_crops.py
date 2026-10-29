import os
import shutil
import sqlite3
from datetime import datetime

# 1. Paths
backend_dir = r"C:\Projects\farm-traceability\backend"
db_path = os.path.join(backend_dir, "farm_traceability.db")
backup_dir = os.path.join(backend_dir, "backups")
os.makedirs(backup_dir, exist_ok=True)

timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup_filename = f"farm_traceability_backup_{timestamp}.db"
backup_path = os.path.join(backup_dir, backup_filename)

# 2. Perform file backup using SQLite backup API for 100% transactionally consistent copy
print(f"Creating timestamped database backup at:\n  {backup_path}")
src_conn = sqlite3.connect(db_path)
dst_conn = sqlite3.connect(backup_path)
src_conn.backup(dst_conn)
dst_conn.close()
src_conn.close()

# 3. Verify backup file exists and is readable
if not os.path.exists(backup_path):
    raise RuntimeError(f"Backup file was not created: {backup_path}")

b_size = os.path.getsize(backup_path)
print(f"Backup file created successfully. Size: {b_size} bytes ({b_size / 1024:.2f} KB)")

test_conn = sqlite3.connect(backup_path)
tc = test_conn.cursor()
tc.execute("SELECT count(*) FROM crops")
crops_in_backup = tc.fetchone()[0]
tc.execute("SELECT count(*) FROM users")
users_in_backup = tc.fetchone()[0]
test_conn.close()

print(f"Verified readable backup! Contained {crops_in_backup} crops and {users_in_backup} users.")

# 4. Clean crop-related data from live database
live_conn = sqlite3.connect(db_path)
lc = live_conn.cursor()

# Check foreign key enforcement
lc.execute("PRAGMA foreign_keys = ON")

print("\nExecuting transactional cleanup of crop test records...")
# Delete in correct dependent order
lc.execute("DELETE FROM consumer_acknowledgements")
ack_deleted = lc.rowcount
print(f"Deleted {ack_deleted} rows from consumer_acknowledgements")

lc.execute("DELETE FROM crop_predictions")
pred_deleted = lc.rowcount
print(f"Deleted {pred_deleted} rows from crop_predictions")

lc.execute("DELETE FROM transactions")
tx_deleted = lc.rowcount
print(f"Deleted {tx_deleted} rows from transactions")

lc.execute("DELETE FROM crops")
crops_deleted = lc.rowcount
print(f"Deleted {crops_deleted} rows from crops")

# Reset sqlite_sequence for crop tables if autoincrement exists
try:
    lc.execute("DELETE FROM sqlite_sequence WHERE name IN ('crops', 'transactions', 'crop_predictions', 'consumer_acknowledgements')")
except sqlite3.OperationalError:
    pass

live_conn.commit()

# 5. Verify cleanup
lc.execute("SELECT count(*) FROM crops")
final_crop_count = lc.fetchone()[0]

lc.execute("SELECT count(*) FROM transactions")
final_tx_count = lc.fetchone()[0]

lc.execute("SELECT count(*) FROM crop_predictions")
final_pred_count = lc.fetchone()[0]

lc.execute("SELECT count(*) FROM consumer_acknowledgements")
final_ack_count = lc.fetchone()[0]

lc.execute("SELECT count(*) FROM users")
final_user_count = lc.fetchone()[0]

lc.execute("SELECT id, username, role, wallet_address FROM users ORDER BY id")
users_remaining = lc.fetchall()

live_conn.close()

print("\n--- Final Database Status After Cleanup ---")
print(f"Crops count: {final_crop_count} (Expected: 0)")
print(f"Transactions count: {final_tx_count} (Expected: 0)")
print(f"Crop predictions count: {final_pred_count} (Expected: 0)")
print(f"Consumer acknowledgements count: {final_ack_count} (Expected: 0)")
print(f"Users count: {final_user_count} (Expected: 5)")
print("Users verified intact:")
for u in users_remaining:
    print(f"  User #{u[0]}: {u[1]} ({u[2]}) -> {u[3]}")

if final_crop_count == 0 and final_user_count == 5:
    print("\nSUCCESS: All crop demo records removed; all user accounts preserved intact!")
else:
    raise RuntimeError("Verification failed: Counts did not match expected values!")
