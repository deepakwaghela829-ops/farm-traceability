// deploy-remote.js - Deploys CropRegistry contract to Remote Ganache EVM Node
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// Load environment variables
require('dotenv').config();

const REMOTE_URL = process.env.GANACHE_REMOTE_URL || process.argv[2];
const RPC_TOKEN = process.env.GANACHE_RPC_TOKEN || process.argv[3] || '';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.argv[4];
const MNEMONIC = process.env.GANACHE_MNEMONIC || process.argv[5];

async function main() {
  if (!REMOTE_URL) {
    console.error('Usage: node deploy-remote.js <GANACHE_REMOTE_URL> [GANACHE_RPC_TOKEN] [DEPLOYER_PRIVATE_KEY_OR_MNEMONIC]');
    console.error('Example: node deploy-remote.js https://ganache.example.com my-secret-token 0xabcdef...');
    process.exit(1);
  }

  console.log('==================================================================');
  console.log(' AgriTrace OS - Deploying CropRegistry to Remote Ganache EVM');
  console.log('==================================================================');
  console.log(`Connecting to: ${REMOTE_URL}`);

  // 1. Setup Custom Fetch with Authorization Header
  const customFetch = (url, reqOptions = {}) => {
    const headers = {
      ...(reqOptions.headers || {}),
      'Content-Type': 'application/json',
    };
    if (RPC_TOKEN) {
      headers['Authorization'] = `Bearer ${RPC_TOKEN.trim()}`;
    }
    return fetch(url, { ...reqOptions, headers });
  };

  const provider = new ethers.JsonRpcProvider(REMOTE_URL, undefined, {
    staticNetwork: true,
    fetch: customFetch,
  });

  const network = await provider.getNetwork();
  console.log(`Connected to Chain ID: ${network.chainId}`);

  // 2. Resolve Deployer Signer
  let wallet;
  if (DEPLOYER_PRIVATE_KEY && DEPLOYER_PRIVATE_KEY.startsWith('0x')) {
    wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
  } else if (DEPLOYER_PRIVATE_KEY && DEPLOYER_PRIVATE_KEY.split(' ').length >= 12) {
    const hd = ethers.HDNodeWallet.fromPhrase(DEPLOYER_PRIVATE_KEY);
    wallet = new ethers.Wallet(hd.privateKey, provider);
  } else if (MNEMONIC) {
    const hd = ethers.HDNodeWallet.fromPhrase(MNEMONIC);
    wallet = new ethers.Wallet(hd.privateKey, provider);
  } else {
    // If running against an open Ganache RPC with unlocked accounts
    try {
      const accounts = await provider.listAccounts();
      if (accounts && accounts.length > 0) {
        wallet = await provider.getSigner(0);
        console.log(`Using remote unlocked Account 0: ${wallet.address}`);
      } else {
        throw new Error('No unlocked accounts returned');
      }
    } catch {
      throw new Error(
        'Deployer credentials required. Pass DEPLOYER_PRIVATE_KEY or GANACHE_MNEMONIC as argument or environment variable.'
      );
    }
  }

  const balance = await provider.getBalance(wallet.address);
  console.log(`Deployer Account : ${wallet.address}`);
  console.log(`Account Balance  : ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    throw new Error('Deployer account has 0 ETH on remote Ganache. Check mnemonic or network.');
  }

  // 3. Load Compiled Artifact
  const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'CropRegistry.sol', 'CropRegistry.json');
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found at ${artifactPath}. Run "npx hardhat compile" first.`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log('Deploying CropRegistry contract bytecode...');
  const contract = await factory.deploy();
  const deployTx = contract.deploymentTransaction();
  console.log(`Broadcasted Deployment Tx: ${deployTx.hash}`);

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const receipt = await deployTx.wait();

  console.log('\n[SUCCESS] Contract Successfully Deployed On-Chain!');
  console.log(`Contract Address : ${address}`);
  console.log(`Mined in Block   : ${receipt.blockNumber}`);
  console.log(`Gas Used         : ${receipt.gasUsed.toString()}`);

  // 4. Update Deployment Metadata
  const info = {
    contractName: 'CropRegistry',
    contractAddress: address,
    network: 'remote-ganache',
    chainId: Number(network.chainId),
    rpcUrl: REMOTE_URL,
    deployer: wallet.address,
    deploymentTxHash: deployTx.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    deployedAt: new Date().toISOString(),
    abiFile: 'abi/CropRegistry.abi.json',
    fullArtifact: 'artifacts/contracts/CropRegistry.sol/CropRegistry.json',
  };

  const infoPath = path.join(__dirname, '..', 'deployment-info.json');
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));

  // Sync to frontend/blockchain
  const frontendBcDir = path.join(__dirname, '..', '..', 'frontend', 'blockchain');
  if (fs.existsSync(frontendBcDir)) {
    fs.writeFileSync(path.join(frontendBcDir, 'CropRegistry.abi.json'), JSON.stringify(artifact.abi, null, 2));
    fs.writeFileSync(path.join(frontendBcDir, 'deployment-info.json'), JSON.stringify(info, null, 2));
    console.log('Synchronized deployment info to frontend/blockchain/');
  }

  console.log('\n==================================================================');
  console.log(' Action Required on Vercel Backend:');
  console.log(` Set GANACHE_CONTRACT_ADDRESS=${address}`);
  console.log(` Set GANACHE_RPC_URL=${REMOTE_URL}`);
  if (RPC_TOKEN) {
    console.log(` Set GANACHE_RPC_TOKEN=${RPC_TOKEN}`);
  }
  console.log('==================================================================');
}

main().catch((err) => {
  console.error('[DEPLOYMENT FAILED]:', err);
  process.exit(1);
});
