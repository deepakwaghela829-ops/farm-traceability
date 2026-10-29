import sqlite3

db_path = r"C:\Projects\farm-traceability\backend\farm_traceability.db"
conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute("UPDATE users SET full_name = ? WHERE username = ?", ("Wasi Mumbai", "supplier1"))
conn.commit()
rows = c.execute("SELECT id, username, full_name, role, wallet_address FROM users").fetchall()
for r in rows:
    print(r)
conn.close()
