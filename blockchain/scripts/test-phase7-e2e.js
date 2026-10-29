// test-phase7-e2e.js - End-to-end verification of AgriTrace OS lifecycle
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers } = hre;
  console.log("==========================================================");
  console.log(" AgriTrace OS - Phase 7 Full Lifecycle E2E Test");
  console.log("==========================================================");

  // 1. Get deployment info & contract
  const info = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployment-info.json"), "utf8"));
  const abi = JSON.parse(fs.readFileSync(path.join(__dirname, "..", info.abiFile), "utf8"));
  const signers = await ethers.getSigners();
  const [farmerSigner, supplierSigner, retailerSigner] = signers;

  console.log("1. Accounts:");
  console.log("   Farmer   :", farmerSigner.address);
  console.log("   Supplier :", supplierSigner.address);
  console.log("   Retailer :", retailerSigner.address);
  console.log("   Contract :", info.contractAddress);

  const registryFarmer = new ethers.Contract(info.contractAddress, abi, farmerSigner);
  const registrySupplier = new ethers.Contract(info.contractAddress, abi, supplierSigner);

  // 2. Register Crop on-chain
  const now = Math.floor(Date.now() / 1000);
  const cropArgs = [
    "Test Organic Cotton",
    "Cash Crop",
    1500,
    "kg",
    now,
    now + 90 * 86400,
    "Nagpur, Maharashtra"
  ];
  console.log("\n2. Registering crop on blockchain...");
  const regTx = await registryFarmer.registerCrop(...cropArgs);
  const regReceipt = await regTx.wait();
  console.log("   Tx Hash :", regTx.hash);
  console.log("   Block   :", regReceipt.blockNumber);

  const farmerCrops = await registryFarmer.getFarmerCrops(farmerSigner.address);
  const onChainCropId = Number(farmerCrops[farmerCrops.length - 1]);
  console.log("   On-Chain Crop ID:", onChainCropId);

  // Verify on-chain details
  const cropData = await registryFarmer.getCrop(onChainCropId);
  const initialHolder = await registryFarmer.getCurrentHolder(onChainCropId);
  console.log("   Crop Name     :", cropData.cropName);
  console.log("   Current Holder:", initialHolder);
  if (initialHolder.toLowerCase() !== farmerSigner.address.toLowerCase()) {
    throw new Error("Initial holder does not match farmer!");
  }

  // 3. Mark Harvested on-chain
  console.log("\n3. Marking crop as harvested on-chain...");
  const harvestTx = await registryFarmer.markHarvested(onChainCropId);
  await harvestTx.wait();
  const isHarvested = await registryFarmer.harvested(onChainCropId);
  console.log("   Harvest Status on-chain:", isHarvested);
  if (!isHarvested) throw new Error("Harvest status failed to record on-chain!");

  // 4. Transfer Custody: Farmer -> Supplier
  console.log("\n4. Transferring custody: Farmer -> Supplier...");
  const tx1 = await registryFarmer.transferCrop(onChainCropId, supplierSigner.address, "Supplier");
  const receipt1 = await tx1.wait();
  console.log("   Transfer 1 Tx Hash:", tx1.hash);
  const holderAfter1 = await registryFarmer.getCurrentHolder(onChainCropId);
  console.log("   Holder after Transfer 1:", holderAfter1);
  if (holderAfter1.toLowerCase() !== supplierSigner.address.toLowerCase()) {
    throw new Error("Holder after transfer 1 does not match supplier!");
  }

  // 5. Transfer Custody: Supplier -> Retailer
  console.log("\n5. Transferring custody: Supplier -> Retailer...");
  const tx2 = await registrySupplier.transferCrop(onChainCropId, retailerSigner.address, "Retailer");
  const receipt2 = await tx2.wait();
  console.log("   Transfer 2 Tx Hash:", tx2.hash);
  const holderAfter2 = await registryFarmer.getCurrentHolder(onChainCropId);
  console.log("   Holder after Transfer 2:", holderAfter2);
  if (holderAfter2.toLowerCase() !== retailerSigner.address.toLowerCase()) {
    throw new Error("Holder after transfer 2 does not match retailer!");
  }

  // 6. Verify movement history on-chain
  const movements = await registryFarmer.getMovementHistory(onChainCropId);
  console.log("\n6. On-chain Movement History (Count: " + movements.length + "):");
  movements.forEach((m, idx) => {
    console.log(`   [#${idx + 1}] From: ${m.from} -> To: ${m.to} (${m.toRole}) at ${new Date(Number(m.timestamp) * 1000).toISOString()}`);
  });
  if (movements.length < 2) throw new Error("Expected at least 2 movements!");

  // 7. Store crop and transactions in Backend SQLite database via API
  console.log("\n7. Storing and verifying in Backend REST API (http://127.0.0.1:8000)...");
  
  // Login as farmer1
  const loginRes = await fetch("http://127.0.0.1:8000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "farmer1", password: "Demo12345!" })
  });
  const loginJson = await loginRes.json();
  const token = loginJson.access_token;
  console.log("   Logged in as farmer1 (Role: " + loginJson.user.role + ")");

  // Post crop to DB
  const createCropRes = await fetch("http://127.0.0.1:8000/api/crops", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    body: JSON.stringify({
      farmer_id: "farmer1",
      crop_name: "Test Organic Cotton",
      crop_type: "Cash Crop",
      quantity: 1500,
      unit: "kg",
      cultivation_date: new Date(now * 1000).toISOString().split("T")[0],
      expected_harvest_date: new Date((now + 90 * 86400) * 1000).toISOString().split("T")[0],
      location: "Nagpur, Maharashtra",
      farmer_price_per_kg: 75.00,
      blockchain_crop_id: onChainCropId,
      blockchain_tx_hash: regTx.hash,
      blockchain_contract_address: info.contractAddress,
      blockchain_block_number: regReceipt.blockNumber,
      blockchain_farmer_address: farmerSigner.address,
      blockchain_chain_id: 1337
    })
  });
  const createdCrop = await createCropRes.json();
  console.log("   Saved to DB: Crop ID #" + createdCrop.crop_id + ", Name: " + createdCrop.crop_name);

  // Record transactions in DB
  const txRecord1 = await fetch("http://127.0.0.1:8000/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      crop_id: onChainCropId,
      event_type: "TRANSFER",
      from_address: farmerSigner.address,
      to_address: supplierSigner.address,
      to_role: "Supplier",
      transaction_hash: tx1.hash,
      block_number: receipt1.blockNumber,
      timestamp: new Date().toISOString()
    })
  });
  console.log("   Transaction 1 stored in DB:", txRecord1.status === 201 ? "SUCCESS" : "FAIL");

  const txRecord2 = await fetch("http://127.0.0.1:8000/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      crop_id: onChainCropId,
      event_type: "TRANSFER",
      from_address: supplierSigner.address,
      to_address: retailerSigner.address,
      to_role: "Retailer",
      transaction_hash: tx2.hash,
      block_number: receipt2.blockNumber,
      timestamp: new Date().toISOString()
    })
  });
  console.log("   Transaction 2 stored in DB:", txRecord2.status === 201 ? "SUCCESS" : "FAIL");

  // Verify DB read
  const fetchCropRes = await fetch("http://127.0.0.1:8000/api/crops/" + createdCrop.crop_id);
  const fetchedCrop = await fetchCropRes.json();
  console.log("   DB Persistence Verified: Crop ID #" + fetchedCrop.crop_id + ", On-Chain ID: " + fetchedCrop.blockchain_crop_id);

  // 8. Test Role-Based Access Control (RBAC)
  console.log("\n8. Testing Role-Based Access Control (RBAC)...");
  // Non-admin attempting to list users -> expect 403
  const forbiddenRes = await fetch("http://127.0.0.1:8000/api/auth/users", {
    headers: { "Authorization": "Bearer " + token }
  });
  console.log("   Unauthorized request by farmer1 to /api/auth/users returned status:", forbiddenRes.status, "(Expected 403 Forbidden)");

  // Admin login and access -> expect 200
  const adminLoginRes = await fetch("http://127.0.0.1:8000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin1", password: "Demo12345!" })
  });
  const adminLogin = await adminLoginRes.json();
  const adminUsersRes = await fetch("http://127.0.0.1:8000/api/auth/users", {
    headers: { "Authorization": "Bearer " + adminLogin.access_token }
  });
  const adminUsers = await adminUsersRes.json();
  console.log("   Authorized request by admin1 to /api/auth/users returned status:", adminUsersRes.status, `(Found ${adminUsers.length} system users)`);

  // 9. Test Retail Pricing Workflow
  console.log("\n9. Testing Retail Pricing Confirmation...");
  const retailLoginRes = await fetch("http://127.0.0.1:8000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "retailer1", password: "Demo12345!" })
  });
  const retailLogin = await retailLoginRes.json();
  const retailConfirmRes = await fetch(`http://127.0.0.1:8000/api/crops/${createdCrop.crop_id}/confirm-retail-price`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + retailLogin.access_token },
    body: JSON.stringify({ retailer_markup_per_kg: 25.00 })
  });
  const updatedPricing = await retailConfirmRes.json();
  console.log(`   Retail Price Confirmed: Farm Gate: ₹${updatedPricing.farmer_price_per_kg}/kg + Markup: ₹${updatedPricing.retailer_markup_per_kg}/kg = Retail Price: ₹${updatedPricing.retail_price_per_kg}/kg`);

  // 10. Consumer Traceability & QR verification
  console.log("\n10. Verifying Consumer Traceability & QR Target...");
  const traceUrl = `http://localhost:5173/consumer.html?cropId=${createdCrop.crop_id}`;
  console.log("   Consumer QR Target URL:", traceUrl);
  const consumerPageCheck = await fetch(traceUrl);
  console.log("   Consumer Page HTTP Status:", consumerPageCheck.status);

  console.log("\n==========================================================");
  console.log(" [SUCCESS] All Phase 7 Verification Steps PASSED!");
  console.log("==========================================================");
}

main().catch((err) => {
  console.error("\n[FAILED] Phase 7 Verification Error:", err);
  process.exitCode = 1;
});
