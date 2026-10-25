# Remote Ganache EVM Node Deployment Guide for AgriTrace OS

This guide provides instructions to run a 24/7 dedicated remote Ganache CLI testnet on an Ubuntu Linux VPS for your college final demonstration.

---

## Architecture Overview

```
[Vercel Frontend] (HTTPS)
       │
       ▼ (Same-Origin JSON-RPC relay: POST /api/blockchain/rpc)
[Vercel FastAPI Backend] (Backend holds server-side secrets)
       │
       ▼ HTTPS (with Authorization: Bearer <TOKEN>)
[Linux VPS Reverse Proxy] (Nginx on Port 443 with TLS / UFW Firewall)
       │
       ▼ (127.0.0.1:8545 - Internal loopback ONLY)
[Ganache CLI Service] (Systemd user 'ganache', persistent disk at /var/lib/ganache/data)
```

---

## Step 1: Provision an Ubuntu VPS
1. Create a minimal Ubuntu 22.04 LTS or 24.04 LTS instance (e.g. DigitalOcean Basic Droplet \$4-\$6/mo, AWS EC2 t3.micro/t4g.micro, Hetzner, or Linode).
2. Note your server's public IP address (e.g., `203.0.113.10`).
3. (Optional but recommended): Point an `A` record for a domain or subdomain to the VPS IP (e.g., `ganache.yourdomain.com -> 203.0.113.10`).

---

## Step 2: Run the Automated Setup Script on the VPS
SSH into your VPS as `root` (or with `sudo`):

```bash
ssh root@YOUR_SERVER_IP
```

Download and run the automated provisioning script:

```bash
# Upload or curl the setup script
curl -fsSL -o setup-remote-ganache.sh https://raw.githubusercontent.com/deepakwaghela829-ops/farm-traceability/main/blockchain/remote-deployment/setup-remote-ganache.sh

# Make executable
chmod +x setup-remote-ganache.sh

# Run provisioning (optionally pass a domain name or custom token):
# ./setup-remote-ganache.sh --domain ganache.yourdomain.com
./setup-remote-ganache.sh
```

The script automatically:
* Installs Node.js 20 LTS, Nginx, UFW, Certbot, and pins `ganache@7.9.2`.
* Generates a **unique, fresh demo mnemonic** on the fly (or accepts an existing one via `--mnemonic`), storing it securely in `/etc/ganache/ganache.env` (`chmod 600`, owned by `ganache`).
* Creates a dedicated non-root `ganache` system user.
* Configures persistent disk storage at `/var/lib/ganache/data`.
* Creates and starts `ganache.service` with automatic restart on boot.
* Sets up Nginx reverse proxy with Bearer token authentication.
* Hardens the UFW firewall: blocks port 8545 externally, only allowing ports 22, 80, 443.
* Derives the 5 demo role wallet addresses and outputs the deployer private key for contract deployment.

---

## Step 3: Secure with HTTPS (Let's Encrypt SSL)
If you pointed a domain (e.g., `ganache.yourdomain.com`):

```bash
certbot --nginx -d ganache.yourdomain.com
```

Certbot will automatically install the TLS certificate and configure HTTPS redirection.

---

## Step 4: Deploy the Smart Contract to the Remote Ganache
From your local project machine, deploy `CropRegistry.sol` to the remote Ganache using the deployer private key output from Step 2:

```bash
cd blockchain
node scripts/deploy-remote.js https://ganache.yourdomain.com YOUR_RPC_BEARER_TOKEN YOUR_DEPLOYER_PRIVATE_KEY
```

The script will:
1. Connect to your remote Ganache node.
2. Verify Chain ID 1337.
3. Deploy the `CropRegistry` smart contract from the newly generated Account 0.
4. Save the deployment metadata and sync contract addresses to `deployment-info.json` and `frontend/blockchain/`.
5. Output the new contract address (e.g. `0x...`).

---

## Step 5: Configure Vercel Backend Environment Variables
Go to your Vercel Dashboard for `farm-traceability-backend` (**Settings > Environment Variables**) or use Vercel CLI:

```bash
cd backend
vercel env add GANACHE_RPC_URL production --value "https://ganache.yourdomain.com"
vercel env add GANACHE_RPC_TOKEN production --value "YOUR_RPC_BEARER_TOKEN"
vercel env add GANACHE_CHAIN_ID production --value "1337"
vercel env add GANACHE_CONTRACT_ADDRESS production --value "0x..."
vercel env add DEMO_FARMER_WALLET production --value "0x..."
vercel env add DEMO_SUPPLIER_WALLET production --value "0x..."
vercel env add DEMO_RETAILER_WALLET production --value "0x..."
vercel env add DEMO_CONSUMER_WALLET production --value "0x..."
vercel env add DEMO_ADMIN_WALLET production --value "0x..."
vercel --prod --yes
```

*Note: None of these variables use `VITE_`, keeping your RPC secret and contract deployment details securely on the server.*

---

## Step 6: Verify the Live Demonstration
1. Open the public Admin Console at `https://frontend-tau-three-20.vercel.app/#/admin` (login with `admin1` / `Demo12345!`).
2. Verify that **Ganache EVM Testnet** displays `Active (Chain ID 1337)`.
3. Log in as `farmer1` (`Demo12345!`) and register a crop. Verify that a real on-chain transaction receipt is generated with a valid transaction hash and block number.
4. Scan the generated QR code or open Consumer Traceability (`#/consumer`) to verify that the batch status shows **Blockchain Verified**.
