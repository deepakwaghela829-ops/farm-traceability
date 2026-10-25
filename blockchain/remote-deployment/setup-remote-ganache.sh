#!/usr/bin/env bash
# ==============================================================================
# AgriTrace OS - Production Remote Ganache EVM Node Provisioning Script
# Target OS: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS
# Requirements: Run as root or with sudo
# ==============================================================================

set -euo pipefail

echo "=================================================================="
echo " AgriTrace OS - Provisioning Dedicated Remote Ganache Testnet"
echo "=================================================================="

# 1. Configuration & Parameters
GANACHE_VERSION="7.9.2"
CHAIN_ID="1337"
RPC_LOCAL_PORT="8545"
DATA_DIR="/var/lib/ganache/data"
GANACHE_USER="ganache"
MNEMONIC="myth like bonus scare over problem client lizard pioneer submit female collect"

# Generate or accept custom bearer token
TOKEN="${1:-$(openssl rand -hex 24)}"
DOMAIN="${2:-}"

echo "[*] Assigned Chain ID: ${CHAIN_ID}"
echo "[*] Pinned Ganache CLI Version: ${GANACHE_VERSION}"
echo "[*] Local Bind Port: 127.0.0.1:${RPC_LOCAL_PORT}"
echo "[*] Generated RPC Bearer Token: ${TOKEN}"

# 2. Update System Packages & Install Dependencies
echo "`n[1/7] Updating system packages..."
apt-get update -y
apt-get install -y curl ufw nginx certbot python3-certbot-nginx build-essential

# 3. Install Node.js 20 LTS & Ganache CLI
echo "`n[2/7] Installing Node.js 20 LTS & Ganache CLI v${GANACHE_VERSION}..."
if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

npm install -g "ganache@${GANACHE_VERSION}"
echo "  [OK] Installed $(ganache --version)"

# 4. Create Dedicated Non-Root System User & Persistent Directory
echo "`n[3/7] Setting up dedicated non-root user and persistent disk storage..."
if ! id "${GANACHE_USER}" >/dev/null 2>&1; then
    useradd --system --shell /usr/sbin/nologin --home-dir /var/lib/ganache "${GANACHE_USER}"
fi

mkdir -p "${DATA_DIR}"
chown -R "${GANACHE_USER}:${GANACHE_USER}" /var/lib/ganache
chmod 700 /var/lib/ganache
chmod 700 "${DATA_DIR}"

# 5. Create Systemd Service for Auto-Restart & Persistence
echo "`n[4/7] Configuring systemd service /etc/systemd/system/ganache.service..."
GANACHE_BIN="$(which ganache)"

cat <<EOF > /etc/systemd/system/ganache.service
[Unit]
Description=Ganache CLI Ethereum EVM Testnet for AgriTrace OS
After=network.target

[Service]
Type=simple
User=${GANACHE_USER}
Group=${GANACHE_USER}
WorkingDirectory=/var/lib/ganache
ExecStart=${GANACHE_BIN} \\
  --server.host 127.0.0.1 \\
  --server.port ${RPC_LOCAL_PORT} \\
  --database.dbPath ${DATA_DIR} \\
  --chain.chainId ${CHAIN_ID} \\
  --chain.networkId ${CHAIN_ID} \\
  --wallet.mnemonic "${MNEMONIC}" \\
  --wallet.totalAccounts 10 \\
  --wallet.defaultBalance 100 \\
  --miner.blockTime 0
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ganache.service
systemctl restart ganache.service
sleep 3

if systemctl is-active --quiet ganache.service; then
    echo "  [OK] ganache.service is active and running!"
else
    echo "  [ERROR] ganache.service failed to start. Run 'journalctl -u ganache.service -e' for details."
    exit 1
fi

# 6. Configure Nginx Reverse Proxy with Token Authentication
echo "`n[5/7] Configuring Nginx reverse proxy with Bearer token authentication..."

cat <<'EOF' > /etc/nginx/sites-available/ganache
server {
    listen 80;
    server_name _;

    client_max_body_size 10M;

    # CORS Headers for API verification
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization' always;

    location / {
        if ($request_method = 'OPTIONS') {
            return 204;
        }

        # Enforce Bearer Token Authentication
        if ($http_authorization != "Bearer __TOKEN__") {
            return 401 '{"jsonrpc":"2.0","error":{"code":-32000,"message":"Unauthorized: Invalid or missing RPC Bearer Token"},"id":null}\n';
        }

        proxy_pass http://127.0.0.1:8545;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
EOF

sed -i "s/__TOKEN__/${TOKEN}/g" /etc/nginx/sites-available/ganache
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/ganache /etc/nginx/sites-enabled/ganache

nginx -t
systemctl restart nginx
echo "  [OK] Nginx configured and restarted."

# 7. Configure UFW Firewall (Port 8545 strictly internal)
echo "`n[6/7] Hardening firewall with UFW (blocking raw 8545 from public internet)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
echo "  [OK] UFW active. Port 8545 is blocked externally and only accessible via Nginx."

# 8. Verification & Summary
echo "`n[7/7] Testing local authenticated RPC call..."
TEST_CALL=$(curl -s -X POST http://127.0.0.1 \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}')

echo "  RPC Response: ${TEST_CALL}"

echo "`n=================================================================="
echo " [SUCCESS] Remote Ganache EVM Node is Ready!"
echo "=================================================================="
echo "  RPC Port (local): 127.0.0.1:${RPC_LOCAL_PORT}"
echo "  Chain ID        : ${CHAIN_ID}"
echo "  Authentication  : Bearer Token"
echo "  RPC Token       : ${TOKEN}"
echo ""
echo "Next Steps for HTTPS Domain & Vercel Connection:"
echo "1. Point your domain or subdomain (e.g. ganache.yourdomain.com) to this VPS IP."
echo "2. Run Certbot for automatic SSL certificate:"
echo "   certbot --nginx -d ganache.yourdomain.com"
echo "3. Add these Environment Variables to your Vercel Backend project:"
echo "   GANACHE_RPC_URL=https://ganache.yourdomain.com"
echo "   GANACHE_RPC_TOKEN=${TOKEN}"
echo "   GANACHE_CHAIN_ID=${CHAIN_ID}"
echo "4. Deploy the CropRegistry contract using 'node blockchain/scripts/deploy-remote.js'"
echo "=================================================================="
