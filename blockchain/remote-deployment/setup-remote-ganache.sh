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
CONFIG_DIR="/etc/ganache"
ENV_FILE="${CONFIG_DIR}/ganache.env"

# Flags
DOMAIN=""
CUSTOM_TOKEN=""
CUSTOM_MNEMONIC=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --token)
      CUSTOM_TOKEN="$2"
      shift 2
      ;;
    --mnemonic)
      CUSTOM_MNEMONIC="$2"
      shift 2
      ;;
    *)
      # Positional fallback: $1 = token, $2 = domain
      if [ -z "${CUSTOM_TOKEN}" ]; then
        CUSTOM_TOKEN="$1"
      elif [ -z "${DOMAIN}" ]; then
        DOMAIN="$1"
      fi
      shift
      ;;
  esac
done

TOKEN="${CUSTOM_TOKEN:-$(openssl rand -hex 24)}"

echo "[*] Assigned Chain ID: ${CHAIN_ID}"
echo "[*] Pinned Ganache CLI Version: ${GANACHE_VERSION}"
echo "[*] Local Bind Port: 127.0.0.1:${RPC_LOCAL_PORT}"

# 2. Update System Packages & Install Dependencies
echo -e "\n[1/7] Updating system packages..."
apt-get update -y
apt-get install -y curl ufw nginx certbot python3-certbot-nginx build-essential

# 3. Install Node.js 20 LTS, Ganache CLI & ethers for wallet derivation
echo -e "\n[2/7] Installing Node.js 20 LTS, Ganache CLI v${GANACHE_VERSION} & ethers..."
if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

npm install -g "ganache@${GANACHE_VERSION}" "ethers@6"
NODE_GLOBAL_PATH="$(npm root -g)"
export NODE_PATH="${NODE_GLOBAL_PATH}:${NODE_PATH:-}"
echo "  [OK] Installed $(ganache --version)"

# 4. Create Dedicated Non-Root System User & Persistent Directory
echo -e "\n[3/7] Setting up dedicated non-root user and persistent disk storage..."
if ! id "${GANACHE_USER}" >/dev/null 2>&1; then
    useradd --system --shell /usr/sbin/nologin --home-dir /var/lib/ganache "${GANACHE_USER}"
fi

mkdir -p "${DATA_DIR}"
mkdir -p "${CONFIG_DIR}"
chown -R "${GANACHE_USER}:${GANACHE_USER}" /var/lib/ganache
chmod 700 /var/lib/ganache
chmod 700 "${DATA_DIR}"

# 5. Generate or Load Unique Demo Mnemonic (Never commited to git)
echo -e "\n[4/7] Configuring secure unique wallet configuration..."
if [ -n "${CUSTOM_MNEMONIC}" ]; then
    MNEMONIC="${CUSTOM_MNEMONIC}"
elif [ -f "${ENV_FILE}" ] && grep -q "GANACHE_MNEMONIC" "${ENV_FILE}"; then
    echo "  [*] Existing configuration found at ${ENV_FILE}. Preserving current chain mnemonic."
    MNEMONIC="$(grep "^GANACHE_MNEMONIC=" "${ENV_FILE}" | cut -d'=' -f2- | tr -d '\"')"
else
    echo "  [*] Generating unique, random 12-word demo mnemonic..."
    MNEMONIC="$(NODE_PATH="${NODE_GLOBAL_PATH}" node -e "const { ethers } = require('ethers'); console.log(ethers.Wallet.createRandom().mnemonic.phrase);")"
fi

cat <<EOF > "${ENV_FILE}"
# AgriTrace OS - Ganache Node Secrets
# DO NOT COMMIT OR EXPOSE THIS FILE
GANACHE_MNEMONIC="${MNEMONIC}"
GANACHE_RPC_TOKEN="${TOKEN}"
EOF

chown "${GANACHE_USER}:${GANACHE_USER}" "${ENV_FILE}"
chmod 600 "${ENV_FILE}"

# Derive demo role accounts
WALLET_INFO="$(NODE_PATH="${NODE_GLOBAL_PATH}" node -e "
const { ethers } = require('ethers');
const m = process.argv[1];
const hd0 = ethers.HDNodeWallet.fromPhrase(m);
console.log('FARMER_ADDR=' + hd0.address);
console.log('DEPLOYER_PK=' + hd0.privateKey);
for(let i=1; i<5; i++) {
  const w = ethers.HDNodeWallet.fromPhrase(m, '', \"m/44'/60'/0'/0/\" + i);
  const roles = ['FARMER', 'SUPPLIER', 'RETAILER', 'CONSUMER', 'ADMIN'];
  console.log(roles[i] + '_ADDR=' + w.address);
}
" "${MNEMONIC}")"

FARMER_ADDR="$(echo "${WALLET_INFO}" | grep "^FARMER_ADDR=" | cut -d'=' -f2)"
DEPLOYER_PK="$(echo "${WALLET_INFO}" | grep "^DEPLOYER_PK=" | cut -d'=' -f2)"
SUPPLIER_ADDR="$(echo "${WALLET_INFO}" | grep "^SUPPLIER_ADDR=" | cut -d'=' -f2)"
RETAILER_ADDR="$(echo "${WALLET_INFO}" | grep "^RETAILER_ADDR=" | cut -d'=' -f2)"
CONSUMER_ADDR="$(echo "${WALLET_INFO}" | grep "^CONSUMER_ADDR=" | cut -d'=' -f2)"
ADMIN_ADDR="$(echo "${WALLET_INFO}" | grep "^ADMIN_ADDR=" | cut -d'=' -f2)"

# 6. Create Systemd Service for Auto-Restart & Persistence
echo -e "\n[5/7] Configuring systemd service /etc/systemd/system/ganache.service..."
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
EnvironmentFile=${ENV_FILE}
ExecStart=${GANACHE_BIN} \\
  --server.host 127.0.0.1 \\
  --server.port ${RPC_LOCAL_PORT} \\
  --database.dbPath ${DATA_DIR} \\
  --chain.chainId ${CHAIN_ID} \\
  --chain.networkId ${CHAIN_ID} \\
  --wallet.mnemonic "\${GANACHE_MNEMONIC}" \\
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

# 7. Configure Nginx Reverse Proxy with Token Authentication
echo -e "\n[6/7] Configuring Nginx reverse proxy with Bearer token authentication..."

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

# Configure TLS with Certbot if domain was provided
if [ -n "${DOMAIN}" ]; then
    echo "  [*] Configuring SSL certificate for domain: ${DOMAIN}..."
    certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "admin@${DOMAIN}" --redirect || {
        echo "  [!] Notice: Certbot SSL setup did not complete. Ensure DNS points to this server and re-run certbot."
    }
fi

# 8. Configure UFW Firewall (Port 8545 strictly internal)
echo -e "\n[7/7] Hardening firewall with UFW (blocking raw 8545 from public internet)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
echo "  [OK] UFW active. Port 8545 is blocked externally and only accessible via Nginx."

# 9. Verification & Summary
echo -e "\nTesting local authenticated RPC call..."
TEST_CALL=$(curl -s -X POST http://127.0.0.1 \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}')

echo "  RPC Response: ${TEST_CALL}"

PUBLIC_HOST="${DOMAIN:-<YOUR_VPS_PUBLIC_IP>}"
SCHEME="http"
[ -n "${DOMAIN}" ] && SCHEME="https"

echo ""
echo "=================================================================="
echo " [SUCCESS] Remote Ganache EVM Node is Ready!"
echo "=================================================================="
echo "  RPC Endpoint    : ${SCHEME}://${PUBLIC_HOST}"
echo "  Chain ID        : ${CHAIN_ID}"
echo "  RPC Auth Token  : ${TOKEN}"
echo "  Deployer Key    : ${DEPLOYER_PK}"
echo ""
echo "  Mapped Demo Account Addresses:"
echo "    farmer1   (Account 0): ${FARMER_ADDR}"
echo "    supplier1 (Account 1): ${SUPPLIER_ADDR}"
echo "    retailer1 (Account 2): ${RETAILER_ADDR}"
echo "    consumer1 (Account 3): ${CONSUMER_ADDR}"
echo "    admin1    (Account 4): ${ADMIN_ADDR}"
echo ""
echo "=== Required Next Steps ==="
echo "1. Deploy the smart contract from your local machine:"
echo "   cd blockchain"
echo "   node scripts/deploy-remote.js ${SCHEME}://${PUBLIC_HOST} \"${TOKEN}\" \"${DEPLOYER_PK}\""
echo ""
echo "2. Add Environment Variables to your Vercel Backend:"
echo "   cd backend"
echo "   vercel env add GANACHE_RPC_URL production --value \"${SCHEME}://${PUBLIC_HOST}\""
echo "   vercel env add GANACHE_RPC_TOKEN production --value \"${TOKEN}\""
echo "   vercel env add GANACHE_CHAIN_ID production --value \"${CHAIN_ID}\""
echo "   vercel env add GANACHE_CONTRACT_ADDRESS production --value \"<DEPLOYED_CONTRACT_ADDRESS>\""
echo "   vercel env add DEMO_FARMER_WALLET production --value \"${FARMER_ADDR}\""
echo "   vercel env add DEMO_SUPPLIER_WALLET production --value \"${SUPPLIER_ADDR}\""
echo "   vercel env add DEMO_RETAILER_WALLET production --value \"${RETAILER_ADDR}\""
echo "   vercel env add DEMO_CONSUMER_WALLET production --value \"${CONSUMER_ADDR}\""
echo "   vercel env add DEMO_ADMIN_WALLET production --value \"${ADMIN_ADDR}\""
echo "   vercel --prod --yes"
echo "=================================================================="
