// Deploys CropRegistry and records address + tx hash + ABI.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers, artifacts, network } = hre;
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  console.log(`Deploying CropRegistry to "${network.name}" (chainId ${net.chainId}) from ${deployer.address}`);

  const factory = await ethers.getContractFactory("CropRegistry");
  const contract = await factory.deploy();
  const deployTx = contract.deploymentTransaction();
  await contract.waitForDeployment();
  const receipt = await deployTx.wait();
  const address = await contract.getAddress();

  const artifact = await artifacts.readArtifact("CropRegistry");

  // 1) ABI on its own, easy for the frontend to import later
  const abiPath = path.join(__dirname, "..", "abi", "CropRegistry.abi.json");
  fs.mkdirSync(path.dirname(abiPath), { recursive: true });
  fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));

  // 2) Deployment info
  const info = {
    contractName: "CropRegistry",
    contractAddress: address,
    network: network.name,
    chainId: Number(net.chainId),
    rpcUrl: network.config.url || null,
    deployer: deployer.address,
    deploymentTxHash: deployTx.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    deployedAt: new Date().toISOString(),
    abiFile: "abi/CropRegistry.abi.json",
    fullArtifact: "artifacts/contracts/CropRegistry.sol/CropRegistry.json",
  };
  fs.writeFileSync(path.join(__dirname, "..", "deployment-info.json"), JSON.stringify(info, null, 2));

  // 3) Sync directly to frontend if present
  const frontendBcDir = path.join(__dirname, "..", "..", "frontend", "blockchain");
  if (fs.existsSync(frontendBcDir)) {
    fs.writeFileSync(path.join(frontendBcDir, "CropRegistry.abi.json"), JSON.stringify(artifact.abi, null, 2));
    fs.writeFileSync(path.join(frontendBcDir, "deployment-info.json"), JSON.stringify(info, null, 2));
    console.log("Synchronized ABI and deployment-info to frontend/blockchain/");
  }

  // 4) Sync directly to backend/.env if present
  const backendEnvPath = path.join(__dirname, "..", "..", "backend", ".env");
  if (fs.existsSync(backendEnvPath)) {
    let envContent = fs.readFileSync(backendEnvPath, "utf8");
    if (/GANACHE_CONTRACT_ADDRESS=.*/.test(envContent)) {
      envContent = envContent.replace(/GANACHE_CONTRACT_ADDRESS=.*/, `GANACHE_CONTRACT_ADDRESS=${address}`);
    } else {
      envContent += `\nGANACHE_CONTRACT_ADDRESS=${address}\n`;
    }
    fs.writeFileSync(backendEnvPath, envContent);
    console.log("Synchronized contract address to backend/.env");
  }

  console.log("Contract address :", address);
  console.log("Deployment tx    :", deployTx.hash);
  console.log("Block            :", receipt.blockNumber);
  console.log("Saved deployment-info.json and abi/CropRegistry.abi.json");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
