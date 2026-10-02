// Proof run: registerCrop -> tx hash -> read back with getCrop / getFarmerCrops.
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

async function main() {
  const info = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployment-info.json"), "utf8"));
  const abi = JSON.parse(fs.readFileSync(path.join(__dirname, "..", info.abiFile), "utf8"));
  const [farmer] = await ethers.getSigners();
  const registry = new ethers.Contract(info.contractAddress, abi, farmer);

  const now = Math.floor(Date.now() / 1000);
  const tx = await registry.registerCrop("Wheat", "Cereal", 500, "kg", now, now + 120 * 86400, "Nashik, Maharashtra");
  const receipt = await tx.wait();
  console.log("registerCrop tx hash :", tx.hash);
  console.log("Block                :", receipt.blockNumber);

  const ids = await registry.getFarmerCrops(farmer.address);
  const cropId = ids[ids.length - 1];
  const c = await registry.getCrop(cropId);

  console.log("Farmer               :", farmer.address);
  console.log("Crop IDs for farmer  :", ids.map(String).join(", "));
  console.log("getCrop(" + cropId + ")          :", {
    cropId: c.cropId.toString(), farmer: c.farmer, cropName: c.cropName, cropType: c.cropType,
    quantity: c.quantity.toString(), unit: c.unit, location: c.location,
    cultivationDate: c.cultivationDate.toString(), expectedHarvestDate: c.expectedHarvestDate.toString(),
    createdAt: c.createdAt.toString(),
  });
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
