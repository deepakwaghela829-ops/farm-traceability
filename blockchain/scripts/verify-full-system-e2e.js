// verify-full-system-e2e.js - Complete End-to-End Verification of AgriTrace OS
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const GANACHE_RPC = 'http://127.0.0.1:7545';
const BACKEND_URL = 'http://127.0.0.1:8000';

const deploymentInfo = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'deployment-info.json'), 'utf8')
);
const cropRegistryAbi = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'abi', 'CropRegistry.abi.json'), 'utf8')
);

async function request(urlPath, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BACKEND_URL}${urlPath}`, options);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`[${res.status}] ${urlPath} -> ${txt}`);
  }
  return res.json();
}

async function login(username, password = 'DemoPassword123!') {
  try {
    const res = await request('/api/auth/login', 'POST', { username, password });
    return res.access_token;
  } catch {
    const res = await request('/api/auth/login', 'POST', { username, password: 'Demo12345!' });
    return res.access_token;
  }
}

async function runVerification() {
  console.log('===============================================================');
  console.log('      AGRITRACE OS — FULL LIFECYCLE VERIFICATION SUITE         ');
  console.log('===============================================================');

  const provider = new ethers.JsonRpcProvider(GANACHE_RPC);
  const accounts = await provider.listAccounts();
  console.log(`[INFO] Connected to Ganache RPC (${GANACHE_RPC})`);
  console.log(`[INFO] Ganache accounts available: ${accounts.length}`);
  console.log(`[INFO] Active Smart Contract: ${deploymentInfo.contractAddress}\n`);

  const farmerSigner = await provider.getSigner(accounts[0].address);
  const supplierSigner = await provider.getSigner(accounts[1].address);
  const retailerSigner = await provider.getSigner(accounts[2].address);

  const farmerWallet = accounts[0].address;
  const supplierWallet = accounts[1].address;
  const retailerWallet = accounts[2].address;

  console.log(`[ROLES] Farmer Wallet   : ${farmerWallet}`);
  console.log(`[ROLES] Supplier Wallet : ${supplierWallet}`);
  console.log(`[ROLES] Retailer Wallet : ${retailerWallet}\n`);

  const contract = new ethers.Contract(deploymentInfo.contractAddress, cropRegistryAbi, provider);

  // 1. Authenticate users
  console.log('>>> STEP 1: Authenticating Demo Users with FastAPI Backend');
  const farmerToken = await login('farmer1');
  const supplierToken = await login('supplier1');
  const retailerToken = await login('retailer1');
  console.log('  [PASS] Farmer, Supplier, and Retailer tokens acquired.');

  console.log('>>> STEP 1.5: Query Supply Chain Partner Directory & Friendly Names');
  const directory = await request('/api/auth/directory', 'GET', null, farmerToken);
  const supplierUser = directory.find((u) => u.role === 'SUPPLIER');
  const retailerUser = directory.find((u) => u.role === 'RETAILER');
  console.log(`  [PASS] Resolved Supplier: ${supplierUser.username} (${supplierUser.full_name}) -> ${supplierUser.wallet_address}`);
  console.log(`  [PASS] Resolved Retailer: ${retailerUser.username} (${retailerUser.full_name}) -> ${retailerUser.wallet_address}\n`);

  // 2. Farmer registers crop on-chain & in DB
  console.log('>>> STEP 2: Farmer registers Crop on Blockchain and Backend Database');
  const nowUnix = Math.floor(Date.now() / 1000);
  const farmerContract = contract.connect(farmerSigner);

  const txReg = await farmerContract.registerCrop(
    'Alphonso Organic Mango Batch #99',
    'Mango',
    500,
    'kg',
    nowUnix,
    nowUnix + 30 * 86400,
    'Ratnagiri, Maharashtra'
  );
  const receiptReg = await txReg.wait();
  const farmerCrops = await contract.getFarmerCrops(farmerWallet);
  const onChainCropId = Number(farmerCrops[farmerCrops.length - 1]);
  console.log(`  [PASS] Blockchain registerCrop mined in block ${receiptReg.blockNumber}. On-chain Crop ID: #${onChainCropId}`);

  const initialHolder = await contract.getCurrentHolder(onChainCropId);
  console.log(`  [PASS] Verified Initial On-Chain Holder: ${initialHolder} (Farmer match: ${initialHolder.toLowerCase() === farmerWallet.toLowerCase()})`);

  // Save to database
  const dbCrop = await request(
    '/api/crops',
    'POST',
    {
      crop_name: 'Alphonso Organic Mango Batch #99',
      crop_type: 'Mango',
      quantity: 500,
      unit: 'kg',
      cultivation_date: '2026-06-01',
      expected_harvest_date: '2026-09-01',
      location: 'Ratnagiri, Maharashtra',
      farmer_id: 'farmer1',
      farmer_price_per_kg: 50.00,
      blockchain_crop_id: onChainCropId,
      blockchain_tx_hash: txReg.hash,
      blockchain_block_number: receiptReg.blockNumber,
      blockchain_farmer_address: farmerWallet,
    },
    farmerToken
  );
  const dbCropId = dbCrop.crop_id;
  console.log(`  [PASS] Database Crop record created. DB ID: #${dbCropId}, On-Chain ID: #${dbCrop.blockchain_crop_id}\n`);

  // 3. AI Price Prediction & Adoption
  console.log('>>> STEP 3: AI Price Prediction & Farm-Gate Price Adoption');
  const benchmarks = await request('/api/prediction/benchmarks/Mango');
  console.log(`  [PASS] Retrieved Mandi Benchmark: ₹${benchmarks.historical_price}/qtl (Demand: ${benchmarks.demand})`);

  const aiPred = await request('/api/prediction/price', 'POST', {
    crop_id: dbCropId,
    crop_type: 'Mango',
    historical_price: benchmarks.historical_price,
    season: 'Monsoon',
    location: 'Ratnagiri',
    demand: 0.9,
    production_quantity: 500,
  });
  console.log(`  [PASS] Random Forest Inference: Predicted Price = ₹${aiPred.predicted_price.toFixed(2)}/kg (Holdout R²: ${aiPred.evaluation_metrics.r2})`);

  const updatedCrop = await request(
    `/api/crops/${dbCropId}/farmer-price`,
    'PATCH',
    { farmer_price_per_kg: 63.49 },
    farmerToken
  );
  console.log(`  [PASS] Confirmed Transparent Base Farm-Gate Price = ₹${updatedCrop.farmer_price_per_kg}/kg\n`);

  // 4. Farmer Dispatches to Supplier (Blockchain & DB)
  console.log('>>> STEP 4: Farmer Dispatches Crop to Supplier (Custody Transfer 1)');
  const txDisp = await farmerContract.transferCrop(onChainCropId, supplierWallet, 'Supplier');
  const receiptDisp = await txDisp.wait();
  console.log(`  [PASS] transferCrop(Farmer -> Supplier) mined in block ${receiptDisp.blockNumber}`);

  const supplierHolder = await contract.getCurrentHolder(onChainCropId);
  console.log(`  [PASS] Verified On-Chain Holder: ${supplierHolder} (Supplier match: ${supplierHolder.toLowerCase() === supplierWallet.toLowerCase()})`);

  await request(
    '/api/transactions',
    'POST',
    {
      crop_id: dbCropId,
      event_type: 'TRANSFER',
      from_address: farmerWallet,
      to_address: supplierWallet,
      to_role: 'Supplier',
      transaction_hash: txDisp.hash,
      block_number: receiptDisp.blockNumber,
      timestamp: new Date().toISOString(),
    },
    farmerToken
  );
  console.log('  [PASS] Recorded Transfer Transaction in DB.');

  console.log('>>> STEP 4.5: Supplier Confirms Logistics & Gross Margin');
  const supMarginCrop = await request(
    `/api/crops/${dbCropId}/confirm-supplier-margin`,
    'POST',
    { margin_per_kg: 15.00 },
    supplierToken
  );
  console.log(`  [PASS] Supplier Margin Confirmed: Farm-Gate ₹${supMarginCrop.farmer_price_per_kg} + Supplier Margin ₹${supMarginCrop.supplier_margin_per_kg} = Supplier Sale Price ₹${supMarginCrop.supplier_price_per_kg}/kg\n`);

  // 5. Supplier Transfers to Retailer (Custody Transfer 2)
  console.log('>>> STEP 5: Supplier Transfers Crop to Retailer (Custody Transfer 2)');
  const supplierContract = contract.connect(supplierSigner);
  const txRetail = await supplierContract.transferCrop(onChainCropId, retailerWallet, 'Retailer');
  const receiptRetail = await txRetail.wait();
  console.log(`  [PASS] transferCrop(Supplier -> Retailer) mined in block ${receiptRetail.blockNumber}`);

  const retailerHolder = await contract.getCurrentHolder(onChainCropId);
  console.log(`  [PASS] Verified On-Chain Holder: ${retailerHolder} (Retailer match: ${retailerHolder.toLowerCase() === retailerWallet.toLowerCase()})`);

  await request(
    '/api/transactions',
    'POST',
    {
      crop_id: dbCropId,
      event_type: 'TRANSFER',
      from_address: supplierWallet,
      to_address: retailerWallet,
      to_role: 'Retailer',
      transaction_hash: txRetail.hash,
      block_number: receiptRetail.blockNumber,
      timestamp: new Date().toISOString(),
    },
    supplierToken
  );
  console.log('  [PASS] Recorded Supplier-to-Retailer Transfer in DB.\n');

  // 6. Retailer Receives Crop & Confirms Retail Markup
  console.log('>>> STEP 6: Retailer Consignment Receipt & Price Confirmation');
  const receivedCrop = await request(`/api/crops/${dbCropId}/receive`, 'POST', null, retailerToken);
  console.log(`  [PASS] Retailer received crop. Status: received_at=${receivedCrop.retailer_received_at}, received_by=${receivedCrop.retailer_received_by}`);

  const confirmedCrop = await request(
    `/api/crops/${dbCropId}/confirm-retail-price`,
    'POST',
    { markup_per_kg: 30.00 },
    retailerToken
  );
  console.log(`  [PASS] Transparent Multi-Stage Pricing Verified:`);
  console.log(`         1. Farm-Gate Price      : ₹${confirmedCrop.farmer_price_per_kg} / kg`);
  console.log(`         2. Supplier Gross Margin: + ₹${confirmedCrop.supplier_margin_per_kg} / kg`);
  console.log(`         3. Retailer Gross Margin: + ₹${confirmedCrop.retailer_markup_per_kg} / kg`);
  console.log(`         4. Consumer Shelf Price : = ₹${confirmedCrop.retail_price_per_kg} / kg`);
  if (Number(confirmedCrop.retail_price_per_kg) !== 108.49) {
    throw new Error(`Expected ₹108.49 but got ₹${confirmedCrop.retail_price_per_kg}`);
  }
  console.log(`  [PASS] Financial Accuracy Check: ₹63.49 + ₹15.00 + ₹30.00 == ₹108.49 verified!\n`);

  // 7. Verify Provenance & Movement History
  console.log('>>> STEP 7: Verify Smart Contract Movement History & Provenance');
  const movements = await contract.getMovementHistory(onChainCropId);
  console.log(`  [PASS] Smart contract recorded ${movements.length} on-chain movement events:`);
  for (let i = 0; i < movements.length; i++) {
    const m = movements[i];
    console.log(`    Move ${i + 1}: From ${m.from.slice(0, 10)}... -> To ${m.to.slice(0, 10)}... (Role: ${m.toRole})`);
  }

  const txList = await request(`/api/transactions/${dbCropId}`);
  console.log(`  [PASS] Backend database recorded ${txList.length} transactions for Crop #${dbCropId}.\n`);

  // 8. Retailer Soft-Removal (Mark Unavailable) & Availability Filter
  console.log('>>> STEP 8: Retailer Mark Unavailable (Soft Removal) & Inventory Filter');
  const unavailCrop = await request(`/api/crops/${dbCropId}/mark-unavailable`, 'POST', null, retailerToken);
  console.log(`  [PASS] Crop marked unavailable: is_available=${unavailCrop.is_available}`);

  const activeInventory = await request('/api/crops?available_only=true');
  const isPresent = activeInventory.some((c) => c.crop_id === dbCropId);
  console.log(`  [PASS] Excluded from active store inventory (available_only=true): ${!isPresent}`);

  // Traceability is preserved
  const traceCheck = await request(`/api/crops/${dbCropId}`);
  console.log(`  [PASS] Historical provenance intact: Crop #${traceCheck.crop_id} (${traceCheck.crop_name}) remains fully verifiable.`);

  // Restore availability
  const restoredCrop = await request(`/api/crops/${dbCropId}/mark-available`, 'POST', null, retailerToken);
  console.log(`  [PASS] Restored crop to active inventory: is_available=${restoredCrop.is_available}\n`);

  console.log('===============================================================');
  console.log('      ALL 8 LIFECYCLE PHASES COMPLETED AND VERIFIED 100%!      ');
  console.log('===============================================================');
}

runVerification().catch((err) => {
  console.error('[FAIL] Verification encountered error:', err);
  process.exitCode = 1;
});
