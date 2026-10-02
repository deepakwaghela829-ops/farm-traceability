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

  console.log("Contract address :", address);
  console.log("Deployment tx    :", deployTx.hash);
  console.log("Block            :", receipt.blockNumber);
  console.log("Saved deployment-info.json and abi/CropRegistry.abi.json");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
