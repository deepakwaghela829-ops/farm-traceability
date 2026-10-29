import urllib.request, json

demo_users = ["farmer1", "supplier1", "retailer1", "consumer1", "admin1"]
password = "Demo12345!"

for u in demo_users:
    data = json.dumps({"username": u, "password": password}).encode("utf-8")
    req = urllib.request.Request("http://127.0.0.1:8000/api/auth/login", data=data, headers={"Content-Type": "application/json"})
    try:
        res = urllib.request.urlopen(req, timeout=3)
        res_data = json.loads(res.read().decode("utf-8"))
        print(f"Login for '{u}': PASS (Role: {res_data.get('user', {}).get('role')}, Token acquired: {bool(res_data.get('access_token'))})")
    except Exception as e:
        print(f"Login for '{u}': FAIL ({e})")
