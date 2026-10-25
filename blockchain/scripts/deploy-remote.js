// deploy-remote.js - Deploys CropRegistry contract to Remote Ganache EVM Node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { ethers } = require('ethers');

// Load environment variables safely
require('dotenv').config();

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

async function main() {
  let remoteUrl = process.env.GANACHE_REMOTE_URL || process.env.GANACHE_RPC_URL || process.argv[2];
  let rpcToken = process.env.GANACHE_RPC_TOKEN || '';
  let deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY || '';

  console.log('==================================================================');
  console.log(' AgriTrace OS - Deploying CropRegistry to Remote Ganache EVM');
  console.log('==================================================================');

  if (!remoteUrl) {
    remoteUrl = await askQuestion('Enter Remote Ganache URL (e.g. https://ganache.yourdomain.com): ');
  }

  if (!remoteUrl) {
    console.error('[ERROR] Remote Ganache URL is required.');
    process.exit(1);
  }

  if (!rpcToken && process.env.GANACHE_RPC_TOKEN === undefined) {
    rpcToken = await askQuestion('Enter RPC Bearer Token (press Enter if none): ');
  }

  if (!deployerPrivateKey && process.env.DEPLOYER_PRIVATE_KEY === undefined) {
    deployerPrivateKey = await askQuestion('Enter Deployer Private Key: ');
  }

  console.log(`\nConnecting to: ${remoteUrl}`);
  if (rpcToken) {
    console.log(`Authentication : Bearer token provided (${rpcToken.length} chars)`);
  } else {
    console.log(`Authentication : None`);
  }

  // 1. Setup Custom Fetch with Authorization Header
  const customFetch = (url, reqOptions = {}) => {
    const headers = {
      ...(reqOptions.headers || {}),
      'Content-Type': 'application/json',
    };
    if (rpcToken) {
      headers['Authorization'] = `Bearer ${rpcToken.trim()}`;
    }
    return fetch(url, { ...reqOptions, headers });
  };

  const provider = new ethers.JsonRpcProvider(remoteUrl, undefined, {
    staticNetwork: true,
    fetch: customFetch,
  });

  const network = await provider.getNetwork();
  console.log(`Connected to Chain ID: ${network.chainId}`);

  // 2. Resolve Deployer Signer
  let wallet;
  if (deployerPrivateKey && deployerPrivateKey.startsWith('0x')) {
    wallet = new ethers.Wallet(deployerPrivateKey, provider);
  } else if (deployerPrivateKey && deployerPrivateKey.split(' ').length >= 12) {
    const hd = ethers.HDNodeWallet.fromPhrase(deployerPrivateKey);
    wallet = new ethers.Wallet(hd.privateKey, provider);
  } else {
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
        'Deployer credentials required. Set DEPLOYER_PRIVATE_KEY environment variable or enter it when prompted.'
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

  console.log('\n==================================================================');
  console.log(' [SUCCESS] CropRegistry Successfully Deployed to Remote Ganache!');
  console.log('==================================================================');
  console.log(`Contract Address : ${address}`);
  console.log(`Chain ID         : ${network.chainId}`);
  console.log(`Block Number     : ${receipt.blockNumber}`);
  console.log(`Gas Used         : ${receipt.gasUsed.toString()}`);
  console.log('==================================================================');

  // 4. Update Deployment Metadata
  const info = {
    contractName: 'CropRegistry',
    contractAddress: address,
    network: 'remote-ganache',
    chainId: Number(network.chainId),
    rpcUrl: remoteUrl,
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

  console.log('\nNext Step: Set this in your Vercel Backend:');
  console.log(`vercel env add GANACHE_CONTRACT_ADDRESS production --value "${address}"`);
}

main().catch((err) => {
  console.error('\n[FATAL ERROR]', err.message || err);
  process.exit(1);
});
