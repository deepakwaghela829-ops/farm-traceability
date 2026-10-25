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

DOMAIN="${GANACHE_DOMAIN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    *)
      if [ -z "${DOMAIN}" ]; then
        DOMAIN="$1"
      fi
      shift
      ;;
  esac
done

# Enforce FQDN requirement (No raw IPs or empty domain allowed for production HTTPS)
if [ -z "${DOMAIN}" ]; then
    echo "[ERROR] A fully-qualified domain name (FQDN) is strictly required for production deployment (e.g. --domain ganache.yourdomain.com)."
    echo "        Plain HTTP access is blocked for security. Please provide a domain name with working DNS."
    exit 1
fi

if [[ "${DOMAIN}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "[ERROR] '${DOMAIN}' is an IP address. Public Certificate Authorities (Let's Encrypt) require a valid domain name."
    echo "        Please point an A record (e.g. ganache.yourdomain.com) to this VPS IP before running setup."
    exit 1
fi

echo "[*] Target Production Domain: ${DOMAIN}"
echo "[*] Assigned Chain ID       : ${CHAIN_ID}"
echo "[*] Pinned Ganache Version  : ${GANACHE_VERSION}"
echo "[*] Local Bind Port         : 127.0.0.1:${RPC_LOCAL_PORT}"

# 2. Update System Packages & Install Dependencies
echo -e "\n[1/7] Updating system packages and installing prerequisites..."
apt-get update -y
apt-get install -y curl ufw nginx certbot python3-certbot-nginx build-essential dnsutils

# 3. DNS Verification: Validate that Domain resolves to this server
echo -e "\n[2/7] Verifying DNS resolution for '${DOMAIN}'..."
VPS_IP="$(curl -s4 --max-time 5 https://api.ipify.org || curl -s4 --max-time 5 https://ifconfig.me || hostname -I | awk '{print $1}')"
RESOLVED_IP="$(dig +short "${DOMAIN}" | tail -n 1 || true)"

if [ -z "${RESOLVED_IP}" ]; then
    RESOLVED_IP="$(getent ahosts "${DOMAIN}" | head -n 1 | awk '{print $1}' || true)"
fi

echo "  [*] Server Public IP : ${VPS_IP}"
echo "  [*] DNS Resolved IP  : ${RESOLVED_IP:-NOT_RESOLVED}"

if [ -z "${RESOLVED_IP}" ]; then
    echo "[ERROR] DNS lookup failed for '${DOMAIN}'. The domain does not resolve to any IP address."
    echo "        Please configure your DNS A record and wait for DNS propagation before running this script."
    exit 1
fi

if [ "${RESOLVED_IP}" != "${VPS_IP}" ]; then
    echo "[ERROR] DNS Mismatch: '${DOMAIN}' points to '${RESOLVED_IP}', but this server is '${VPS_IP}'."
    echo "        Certbot TLS verification will fail. Update your DNS A record to point to '${VPS_IP}'."
    exit 1
fi
echo "  [OK] DNS record successfully verified!"

# 4. Install Node.js 20 LTS, Ganache CLI & ethers for local key derivation
echo -e "\n[3/7] Installing Node.js 20 LTS, Ganache CLI v${GANACHE_VERSION} & ethers..."
if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

npm install -g "ganache@${GANACHE_VERSION}" "ethers@6"
NODE_GLOBAL_PATH="$(npm root -g)"
export NODE_PATH="${NODE_GLOBAL_PATH}:${NODE_PATH:-}"
echo "  [OK] Installed Node $(node -v) and Ganache $(ganache --version)"

# 5. Create Dedicated Non-Root System User & Persistent Directory
echo -e "\n[4/7] Setting up dedicated non-root user and persistent disk storage..."
if ! id "${GANACHE_USER}" >/dev/null 2>&1; then
    useradd --system --shell /usr/sbin/nologin --home-dir /var/lib/ganache "${GANACHE_USER}"
fi

mkdir -p "${DATA_DIR}"
mkdir -p "${CONFIG_DIR}"
chown -R "${GANACHE_USER}:${GANACHE_USER}" /var/lib/ganache
chmod 700 /var/lib/ganache
chmod 700 "${DATA_DIR}"

# 6. Generate or Load Unique Demo Mnemonic (Secure Storage in restricted file)
echo -e "\n[5/7] Configuring secure wallet credentials..."
if [ -f "${ENV_FILE}" ] && grep -q "GANACHE_MNEMONIC" "${ENV_FILE}"; then
    echo "  [*] Existing configuration found at ${ENV_FILE}. Preserving current chain mnemonic."
    MNEMONIC="$(grep "^GANACHE_MNEMONIC=" "${ENV_FILE}" | cut -d'=' -f2- | tr -d '\"')"
    TOKEN="$(grep "^GANACHE_RPC_TOKEN=" "${ENV_FILE}" | cut -d'=' -f2- | tr -d '\"')"
else
    echo "  [*] Generating unique 12-word demo mnemonic and random 256-bit RPC auth token..."
    MNEMONIC="$(NODE_PATH="${NODE_GLOBAL_PATH}" node -e "const { ethers } = require('ethers'); console.log(ethers.Wallet.createRandom().mnemonic.phrase);")"
    TOKEN="$(openssl rand -hex 32)"
fi

# Derive public addresses for roles
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

# Write restricted secrets file (DO NOT PRINT SECRETS TO LOGS)
cat <<EOF > "${ENV_FILE}"
# AgriTrace OS - Production Ganache EVM Node Configuration
# RESTRICTED: chmod 600 - DO NOT COMMIT OR EXPOSE
GANACHE_MNEMONIC="${MNEMONIC}"
GANACHE_RPC_TOKEN="${TOKEN}"
DEPLOYER_PRIVATE_KEY="${DEPLOYER_PK}"
EOF

chown "${GANACHE_USER}:${GANACHE_USER}" "${ENV_FILE}"
chmod 600 "${ENV_FILE}"
echo "  [OK] Generated credentials stored safely in ${ENV_FILE} (permissions 600)."

# Create systemd service for Ganache
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

if ! systemctl is-active --quiet ganache.service; then
    echo "[ERROR] ganache.service failed to start. Run 'journalctl -u ganache.service -n 50' to inspect."
    exit 1
fi
echo "  [OK] ganache.service is active and bound to 127.0.0.1:${RPC_LOCAL_PORT}."

# 7. Configure Nginx Reverse Proxy & Obtain Real Let's Encrypt TLS Certificate
echo -e "\n[6/7] Configuring Nginx reverse proxy and acquiring TLS certificate..."

# Initial Nginx config for Certbot validation (Port 80 HTTP with redirect)
cat <<EOF > /etc/nginx/sites-available/ganache
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF

mkdir -p /var/www/html
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/ganache /etc/nginx/sites-enabled/ganache
nginx -t
systemctl restart nginx

# Obtain TLS Certificate via Certbot
echo "  [*] Executing Certbot TLS certificate generation for ${DOMAIN}..."
if ! certbot certonly --webroot -w /var/www/html -d "${DOMAIN}" --non-interactive --agree-tos -m "admin@${DOMAIN}"; then
    echo "[ERROR] Certbot failed to obtain a valid TLS certificate for '${DOMAIN}'."
    echo "        HTTPS deployment failed. Public unencrypted HTTP access is blocked."
    exit 1
fi

CERT_FILE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
KEY_FILE="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

if [ ! -f "${CERT_FILE}" ] || [ ! -f "${KEY_FILE}" ]; then
    echo "[ERROR] Certificate verification failed: ${CERT_FILE} not found."
    exit 1
fi
echo "  [OK] TLS certificate successfully provisioned and verified!"

# Configure Hardened HTTPS Nginx site (Port 443 ONLY for RPC, Port 80 strictly redirects)
cat <<EOF > /etc/nginx/sites-available/ganache
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate ${CERT_FILE};
    ssl_certificate_key ${KEY_FILE};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    client_max_body_size 10M;

    # CORS Headers
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization' always;

    location / {
        if (\$request_method = 'OPTIONS') {
            return 204;
        }

        # Enforce Bearer Token Authentication
        if (\$http_authorization != "Bearer ${TOKEN}") {
            return 401 '{"jsonrpc":"2.0","error":{"code":-32000,"message":"Unauthorized: Invalid or missing RPC Bearer Token"},"id":null}\n';
        }

        proxy_pass http://127.0.0.1:${RPC_LOCAL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF

nginx -t
systemctl restart nginx
echo "  [OK] Nginx HTTPS reverse proxy is fully operational."

# 8. Configure UFW Firewall (Strict Isolation: Port 8545 blocked from internet)
echo -e "\n[7/7] Hardening firewall with UFW (Port 8545 internal only)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP-Redirect'
ufw allow 443/tcp comment 'HTTPS-RPC'
ufw --force enable
echo "  [OK] UFW firewall active: Port 8545 is strictly isolated to loopback."

# 9. Verify Live HTTPS RPC Endpoint
echo -e "\nVerifying authenticated HTTPS RPC endpoint..."
TEST_CALL="$(curl -s -X POST "https://${DOMAIN}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}')"

if [[ "${TEST_CALL}" != *"0x539"* && "${TEST_CALL}" != *"1337"* ]]; then
    echo "[ERROR] Local verification check failed. Output: ${TEST_CALL}"
    exit 1
fi

echo "  [OK] Verified RPC response: ${TEST_CALL}"

echo ""
echo "=================================================================="
echo " [SUCCESS] Remote Ganache EVM Node is Live and Secure with HTTPS!"
echo "=================================================================="
echo "  Endpoint URL   : https://${DOMAIN}"
echo "  Chain ID       : ${CHAIN_ID}"
echo "  RPC Security   : TLS 1.3 + Bearer Token Authentication"
echo "  Port 8545      : Strictly blocked from public internet"
echo ""
echo "  Mapped Public Demo Role Accounts:"
echo "    farmer1   (Account 0): ${FARMER_ADDR}"
echo "    supplier1 (Account 1): ${SUPPLIER_ADDR}"
echo "    retailer1 (Account 2): ${RETAILER_ADDR}"
echo "    consumer1 (Account 3): ${CONSUMER_ADDR}"
echo "    admin1    (Account 4): ${ADMIN_ADDR}"
echo ""
echo "  [CONFIDENTIAL SECRETS NOTICE]"
echo "  RPC Bearer Token & Deployer Private Key were saved to:"
echo "    ${ENV_FILE} (permissions: 600, owned by ${GANACHE_USER})"
echo "  To view them securely on this server, run:"
echo "    sudo cat ${ENV_FILE}"
echo "  NEVER commit or share secrets publicly."
echo ""
echo "=== Steps to Deploy Smart Contract & Wire Vercel ==="
echo "1. On your development machine, set environment variables (avoid CLI argument logging):"
echo "   export GANACHE_REMOTE_URL=\"https://${DOMAIN}\""
echo "   export GANACHE_RPC_TOKEN=\"<TOKEN_FROM_ENV_FILE>\""
echo "   export DEPLOYER_PRIVATE_KEY=\"<DEPLOYER_PK_FROM_ENV_FILE>\""
echo "   cd blockchain"
echo "   node scripts/deploy-remote.js"
echo ""
echo "2. Add Environment Variables to your Vercel Backend:"
echo "   cd backend"
echo "   vercel env add GANACHE_RPC_URL production --value \"https://${DOMAIN}\""
echo "   vercel env add GANACHE_RPC_TOKEN production --value \"<TOKEN_FROM_ENV_FILE>\""
echo "   vercel env add GANACHE_CHAIN_ID production --value \"${CHAIN_ID}\""
echo "   vercel env add GANACHE_CONTRACT_ADDRESS production --value \"<DEPLOYED_CONTRACT_ADDRESS>\""
echo "   vercel env add DEMO_FARMER_WALLET production --value \"${FARMER_ADDR}\""
echo "   vercel env add DEMO_SUPPLIER_WALLET production --value \"${SUPPLIER_ADDR}\""
echo "   vercel env add DEMO_RETAILER_WALLET production --value \"${RETAILER_ADDR}\""
echo "   vercel env add DEMO_CONSUMER_WALLET production --value \"${CONSUMER_ADDR}\""
echo "   vercel env add DEMO_ADMIN_WALLET production --value \"${ADMIN_ADDR}\""
echo "   vercel --prod --yes"
echo "=================================================================="
