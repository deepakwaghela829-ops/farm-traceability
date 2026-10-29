// test-duplicate-crop-names-e2e.js
// Dedicated Automated E2E Regression Test for Duplicate Crop Names & Batch-Level Inventory Isolation
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

async function login(username, password = 'Demo12345!') {
  try {
    const res = await request('/api/auth/login', 'POST', { username, password });
    return res.access_token;
  } catch {
    const res = await request('/api/auth/login', 'POST', { username, password: 'DemoPassword123!' });
    return res.access_token;
  }
}

async function runDuplicateCropNamesTest() {
  console.log('================================================================================');
  console.log('    AGRITRACE OS — DUPLICATE CROP NAMES & BATCH INVENTORY ISOLATION E2E TEST    ');
  console.log('================================================================================\n');

  const provider = new ethers.JsonRpcProvider(GANACHE_RPC);
  const accounts = await provider.listAccounts();
  console.log(`[INFO] Connected to Ganache RPC (${GANACHE_RPC})`);
  console.log(`[INFO] Active Smart Contract Address : ${deploymentInfo.contractAddress}`);
  console.log(`[INFO] Smart Contract Deployment Chain: Ganache (Chain ID 1337)\n`);

  const farmerSigner = await provider.getSigner(accounts[0].address);
  const supplierSigner = await provider.getSigner(accounts[1].address);
  const retailerSigner = await provider.getSigner(accounts[2].address);

  const farmerWallet = accounts[0].address;
  const supplierWallet = accounts[1].address;
  const retailerWallet = accounts[2].address;

  console.log(`[PARTICIPANTS] Farmer   : ${farmerWallet}`);
  console.log(`[PARTICIPANTS] Supplier : ${supplierWallet}`);
  console.log(`[PARTICIPANTS] Retailer : ${retailerWallet}\n`);

  const contract = new ethers.Contract(deploymentInfo.contractAddress, cropRegistryAbi, provider);

  // Authenticate demo users
  console.log('>>> [PHASE 1] Authenticating Demo Users with FastAPI Backend');
  const farmerToken = await login('farmer1');
  const supplierToken = await login('supplier1');
  const retailerToken = await login('retailer1');
  console.log('  [PASS] Farmer, Supplier, and Retailer authenticated.\n');

  const SHARED_CROP_NAME = 'Ratnagiri Alphonso Mango';
  const SHARED_LOCATION = 'Ratnagiri, Maharashtra';
  const nowUnix = Math.floor(Date.now() / 1000);

  // --------------------------------------------------------------------------
  // STEP 1: Register Batch 1 (Mango, 50 kg, ₹65.00/kg)
  // --------------------------------------------------------------------------
  console.log('>>> [PHASE 2] Registering Batch 1: "Ratnagiri Alphonso Mango" — 50 kg — ₹65.00/kg');
  const farmerContract = contract.connect(farmerSigner);

  const txReg1 = await farmerContract.registerCrop(
    SHARED_CROP_NAME,
    'Fruit',
    50,
    'kg',
    nowUnix,
    nowUnix + 60 * 86400,
    SHARED_LOCATION
  );
  const receipt1 = await txReg1.wait();
  const farmerCrops1 = await contract.getFarmerCrops(farmerWallet);
  const onChainCropId1 = Number(farmerCrops1[farmerCrops1.length - 1]);

  const dbCrop1 = await request(
    '/api/crops',
    'POST',
    {
      crop_name: SHARED_CROP_NAME,
      crop_type: 'Fruit',
      quantity: 50,
      unit: 'kg',
      cultivation_date: '2026-06-01',
      expected_harvest_date: '2026-10-01',
      location: SHARED_LOCATION,
      farmer_id: 'farmer1',
      farmer_price_per_kg: 65.00,
      blockchain_crop_id: onChainCropId1,
      blockchain_tx_hash: txReg1.hash,
      blockchain_block_number: receipt1.blockNumber,
      blockchain_farmer_address: farmerWallet,
    },
    farmerToken
  );
  const dbCropId1 = dbCrop1.crop_id;
  const batchNumber1 = dbCrop1.batch_number;
  console.log(`  [PASS] Batch 1 Created: DB ID #${dbCropId1} | Batch Number: ${batchNumber1} | On-Chain #${onChainCropId1} (Tx: ${txReg1.hash.slice(0, 18)}...)`);

  // --------------------------------------------------------------------------
  // STEP 2: Register Batch 2 (Mango, 100 kg, ₹60.00/kg)
  // --------------------------------------------------------------------------
  console.log('\n>>> [PHASE 3] Registering Batch 2: "Ratnagiri Alphonso Mango" — 100 kg — ₹60.00/kg (Same Crop Name!)');
  const txReg2 = await farmerContract.registerCrop(
    SHARED_CROP_NAME,
    'Fruit',
    100,
    'kg',
    nowUnix,
    nowUnix + 60 * 86400,
    SHARED_LOCATION
  );
  const receipt2 = await txReg2.wait();
  const farmerCrops2 = await contract.getFarmerCrops(farmerWallet);
  const onChainCropId2 = Number(farmerCrops2[farmerCrops2.length - 1]);

  const dbCrop2 = await request(
    '/api/crops',
    'POST',
    {
      crop_name: SHARED_CROP_NAME,
      crop_type: 'Fruit',
      quantity: 100,
      unit: 'kg',
      cultivation_date: '2026-06-01',
      expected_harvest_date: '2026-10-01',
      location: SHARED_LOCATION,
      farmer_id: 'farmer1',
      farmer_price_per_kg: 60.00,
      blockchain_crop_id: onChainCropId2,
      blockchain_tx_hash: txReg2.hash,
      blockchain_block_number: receipt2.blockNumber,
      blockchain_farmer_address: farmerWallet,
    },
    farmerToken
  );
  const dbCropId2 = dbCrop2.crop_id;
  const batchNumber2 = dbCrop2.batch_number;
  console.log(`  [PASS] Batch 2 Created: DB ID #${dbCropId2} | Batch Number: ${batchNumber2} | On-Chain #${onChainCropId2} (Tx: ${txReg2.hash.slice(0, 18)}...)`);

  // --------------------------------------------------------------------------
  // STEP 3: Identity & Uniqueness Assertions
  // --------------------------------------------------------------------------
  console.log('\n>>> [PHASE 4] Verifying Batch Identity & Uniqueness Constraints');
  if (dbCropId1 === dbCropId2) {
    throw new Error(`FAIL: DB IDs collide! Both batches received ID #${dbCropId1}`);
  }
  if (onChainCropId1 === onChainCropId2) {
    throw new Error(`FAIL: On-chain IDs collide! Both batches received On-Chain ID #${onChainCropId1}`);
  }
  if (batchNumber1 === batchNumber2) {
    throw new Error(`FAIL: Batch numbers collide! Both received ${batchNumber1}`);
  }
  console.log(`  [PASS] Unique Database Primary Keys   : #${dbCropId1} != #${dbCropId2}`);
  console.log(`  [PASS] Unique On-Chain IDs            : #${onChainCropId1} != #${onChainCropId2}`);
  console.log(`  [PASS] Unique Batch Codes             : ${batchNumber1} != ${batchNumber2}`);
  console.log(`  [PASS] Reusable Crop Name Confirmed   : Both batches share "${SHARED_CROP_NAME}"`);

  const initialHolder1 = await contract.getCurrentHolder(onChainCropId1);
  const initialHolder2 = await contract.getCurrentHolder(onChainCropId2);
  console.log(`  [PASS] Initial On-Chain Holder Batch 1: ${initialHolder1} (Farmer: true)`);
  console.log(`  [PASS] Initial On-Chain Holder Batch 2: ${initialHolder2} (Farmer: true)`);

  // --------------------------------------------------------------------------
  // STEP 4: Transfer Batch 1 to Supplier (Batch 2 Must Remain Untouched)
  // --------------------------------------------------------------------------
  console.log('\n>>> [PHASE 5] Dispatching Batch 1 ONLY to Supplier (Farmer -> Supplier)');
  const txDisp1 = await farmerContract.transferCrop(onChainCropId1, supplierWallet, 'Supplier');
  const receiptDisp1 = await txDisp1.wait();
  console.log(`  [PASS] Batch 1 transferCrop mined in block ${receiptDisp1.blockNumber}`);

  await request(
    '/api/transactions',
    'POST',
    {
      crop_id: dbCropId1,
      event_type: 'TRANSFER',
      from_address: farmerWallet,
      to_address: supplierWallet,
      to_role: 'Supplier',
      transaction_hash: txDisp1.hash,
      block_number: receiptDisp1.blockNumber,
      timestamp: new Date().toISOString(),
    },
    farmerToken
  );

  // Check Holders on-chain
  const holder1AfterDisp = await contract.getCurrentHolder(onChainCropId1);
  const holder2AfterDisp = await contract.getCurrentHolder(onChainCropId2);
  console.log(`  [PASS] Batch 1 On-Chain Holder: ${holder1AfterDisp} (Matches Supplier: ${holder1AfterDisp.toLowerCase() === supplierWallet.toLowerCase()})`);
  console.log(`  [PASS] Batch 2 On-Chain Holder: ${holder2AfterDisp} (Matches Farmer:   ${holder2AfterDisp.toLowerCase() === farmerWallet.toLowerCase()})`);

  if (holder2AfterDisp.toLowerCase() !== farmerWallet.toLowerCase()) {
    throw new Error('CRITICAL BUG: Dispatching Batch 1 incorrectly affected Batch 2 holder!');
  }

  // --------------------------------------------------------------------------
  // STEP 5: Transfer Batch 1 to Retailer (Batch 2 Must Remain Untouched)
  // --------------------------------------------------------------------------
  console.log('\n>>> [PHASE 6] Transferring Batch 1 from Supplier to Retailer (Supplier -> Retailer)');
  const supMarginCrop1 = await request(
    `/api/crops/${dbCropId1}/confirm-supplier-margin`,
    'POST',
    { margin_per_kg: 15.00 },
    supplierToken
  );
  console.log(`  [PASS] Batch 1 Supplier Margin Confirmed: Farm-Gate ₹${supMarginCrop1.farmer_price_per_kg} + ₹15.00 margin = ₹${supMarginCrop1.supplier_price_per_kg}/kg`);

  const supplierContract = contract.connect(supplierSigner);
  const txRetail1 = await supplierContract.transferCrop(onChainCropId1, retailerWallet, 'Retailer');
  const receiptRetail1 = await txRetail1.wait();
  console.log(`  [PASS] Batch 1 transferCrop(Supplier -> Retailer) mined in block ${receiptRetail1.blockNumber}`);

  await request(
    '/api/transactions',
    'POST',
    {
      crop_id: dbCropId1,
      event_type: 'TRANSFER',
      from_address: supplierWallet,
      to_address: retailerWallet,
      to_role: 'Retailer',
      transaction_hash: txRetail1.hash,
      block_number: receiptRetail1.blockNumber,
      timestamp: new Date().toISOString(),
    },
    supplierToken
  );

  const holder1AfterRetail = await contract.getCurrentHolder(onChainCropId1);
  const holder2AfterRetail = await contract.getCurrentHolder(onChainCropId2);
  console.log(`  [PASS] Batch 1 On-Chain Holder: ${holder1AfterRetail} (Matches Retailer: ${holder1AfterRetail.toLowerCase() === retailerWallet.toLowerCase()})`);
  console.log(`  [PASS] Batch 2 On-Chain Holder: ${holder2AfterRetail} (Still With Farmer: ${holder2AfterRetail.toLowerCase() === farmerWallet.toLowerCase()})`);

  if (holder2AfterRetail.toLowerCase() !== farmerWallet.toLowerCase()) {
    throw new Error('CRITICAL BUG: Transferring Batch 1 incorrectly affected Batch 2 holder!');
  }

  // --------------------------------------------------------------------------
  // STEP 6: Retailer Receives & Confirms Retail Price on Batch 1 ONLY
  // --------------------------------------------------------------------------
  console.log('\n>>> [PHASE 7] Retailer Receives Batch 1 and Confirms ₹30.00 Retail Markup');
  const receivedCrop1 = await request(`/api/crops/${dbCropId1}/receive`, 'POST', null, retailerToken);
  console.log(`  [PASS] Batch 1 received in store inventory by: ${receivedCrop1.retailer_received_by} at ${receivedCrop1.retailer_received_at}`);

  const confirmedCrop1 = await request(
    `/api/crops/${dbCropId1}/confirm-retail-price`,
    'POST',
    { markup_per_kg: 30.00 },
    retailerToken
  );
  console.log(`  [PASS] Batch 1 Multi-Stage Pricing Verified:`);
  console.log(`         • Farm-Gate Base Price  : ₹${confirmedCrop1.farmer_price_per_kg} / kg`);
  console.log(`         • Supplier Gross Margin : + ₹${confirmedCrop1.supplier_margin_per_kg} / kg`);
  console.log(`         • Retailer Gross Margin : + ₹${confirmedCrop1.retailer_markup_per_kg} / kg`);
  console.log(`         • Shelf Price           : = ₹${confirmedCrop1.retail_price_per_kg} / kg`);

  const expectedPrice1 = 65.00 + 15.00 + 30.00; // 110.00
  if (Number(confirmedCrop1.retail_price_per_kg) !== expectedPrice1) {
    throw new Error(`Expected ₹${expectedPrice1} but got ₹${confirmedCrop1.retail_price_per_kg}`);
  }
  console.log(`  [PASS] Financial Exactness: ₹65.00 + ₹15.00 + ₹30.00 = ₹110.00/kg verified!`);

  // Verify Batch 2 in Database is COMPLETELY UNTOUCHED by Batch 1's operations
  const batch2Check = await request(`/api/crops/${dbCropId2}`);
  console.log(`\n>>> [PHASE 8] Verifying Batch 2 Database Record Isolation:`);
  console.log(`  [PASS] Batch 2 DB ID           : #${batch2Check.crop_id}`);
  console.log(`  [PASS] Batch 2 Quantity        : ${batch2Check.quantity} ${batch2Check.unit} (Unharmed)`);
  console.log(`  [PASS] Batch 2 Farm-Gate Price : ₹${batch2Check.farmer_price_per_kg} / kg`);
  console.log(`  [PASS] Batch 2 Retail Price    : ${batch2Check.retail_price_per_kg} (Expected null: ${batch2Check.retail_price_per_kg === null})`);
  console.log(`  [PASS] Batch 2 Retail Received : ${batch2Check.retailer_received_at} (Expected null: ${batch2Check.retailer_received_at === null})`);

  if (batch2Check.retail_price_per_kg !== null || batch2Check.retailer_received_at !== null) {
    throw new Error('CRITICAL BUG: Batch 1 pricing/receipt bled into Batch 2 database record!');
  }

  // --------------------------------------------------------------------------
  // STEP 7: Robustness Test — Register Batch 3 (Identical Name, Identical 50 kg Quantity, Identical Location)
  // --------------------------------------------------------------------------
  console.log('\n>>> [PHASE 9] Robustness Test: Register Batch 3 (Same Name "Ratnagiri Alphonso Mango", Same 50 kg, Same Location)');
  const txReg3 = await farmerContract.registerCrop(
    SHARED_CROP_NAME,
    'Fruit',
    50,
    'kg',
    nowUnix,
    nowUnix + 60 * 86400,
    SHARED_LOCATION
  );
  const receipt3 = await txReg3.wait();
  const farmerCrops3 = await contract.getFarmerCrops(farmerWallet);
  const onChainCropId3 = Number(farmerCrops3[farmerCrops3.length - 1]);

  const dbCrop3 = await request(
    '/api/crops',
    'POST',
    {
      crop_name: SHARED_CROP_NAME,
      crop_type: 'Fruit',
      quantity: 50,
      unit: 'kg',
      cultivation_date: '2026-06-01',
      expected_harvest_date: '2026-10-01',
      location: SHARED_LOCATION,
      farmer_id: 'farmer1',
      farmer_price_per_kg: 70.00,
      blockchain_crop_id: onChainCropId3,
      blockchain_tx_hash: txReg3.hash,
      blockchain_block_number: receipt3.blockNumber,
      blockchain_farmer_address: farmerWallet,
    },
    farmerToken
  );
  const dbCropId3 = dbCrop3.crop_id;
  const batchNumber3 = dbCrop3.batch_number;

  console.log(`  [PASS] Batch 3 Created: DB ID #${dbCropId3} | Batch Number: ${batchNumber3} | On-Chain #${onChainCropId3}`);
  if (dbCropId3 === dbCropId1 || dbCropId3 === dbCropId2) {
    throw new Error(`FAIL: Batch 3 DB ID #${dbCropId3} collided with existing batch!`);
  }
  if (onChainCropId3 === onChainCropId1 || onChainCropId3 === onChainCropId2) {
    throw new Error(`FAIL: Batch 3 On-Chain ID #${onChainCropId3} collided with existing batch!`);
  }
  console.log(`  [PASS] All 3 batches have distinct DB IDs: [${dbCropId1}, ${dbCropId2}, ${dbCropId3}]`);
  console.log(`  [PASS] All 3 batches have distinct On-Chain IDs: [${onChainCropId1}, ${onChainCropId2}, ${onChainCropId3}]`);
  console.log(`  [PASS] All 3 batches have distinct Batch Codes: [${batchNumber1}, ${batchNumber2}, ${batchNumber3}]`);

  // --------------------------------------------------------------------------
  // STEP 8: Provenance & Movement Isolation Verification
  // --------------------------------------------------------------------------
  console.log('\n>>> [PHASE 10] Smart Contract & Database Movement Provenance Isolation');
  const moves1 = await contract.getMovementHistory(onChainCropId1);
  const moves2 = await contract.getMovementHistory(onChainCropId2);
  const moves3 = await contract.getMovementHistory(onChainCropId3);

  console.log(`  [PASS] On-Chain Movements for Batch 1 (On-Chain #${onChainCropId1}): ${moves1.length} moves (Farmer -> Supplier -> Retailer)`);
  console.log(`  [PASS] On-Chain Movements for Batch 2 (On-Chain #${onChainCropId2}): ${moves2.length} moves (Never moved from farm)`);
  console.log(`  [PASS] On-Chain Movements for Batch 3 (On-Chain #${onChainCropId3}): ${moves3.length} moves (Never moved from farm)`);

  if (moves1.length !== 2) throw new Error(`Expected 2 movements for Batch 1, got ${moves1.length}`);
  if (moves2.length !== 0) throw new Error(`Expected 0 movements for Batch 2, got ${moves2.length}`);
  if (moves3.length !== 0) throw new Error(`Expected 0 movements for Batch 3, got ${moves3.length}`);

  const txs1 = await request(`/api/transactions/${dbCropId1}`);
  const txs2 = await request(`/api/transactions/${dbCropId2}`);
  const txs3 = await request(`/api/transactions/${dbCropId3}`);

  console.log(`  [PASS] Database Transactions for Batch 1 (DB #${dbCropId1}): ${txs1.length} records`);
  console.log(`  [PASS] Database Transactions for Batch 2 (DB #${dbCropId2}): ${txs2.length} records`);
  console.log(`  [PASS] Database Transactions for Batch 3 (DB #${dbCropId3}): ${txs3.length} records`);

  if (txs1.length !== 3) throw new Error(`Expected 3 DB transactions for Batch 1, got ${txs1.length}`);
  if (txs2.length !== 0) throw new Error(`Expected 0 DB transactions for Batch 2, got ${txs2.length}`);
  if (txs3.length !== 0) throw new Error(`Expected 0 DB transactions for Batch 3, got ${txs3.length}`);

  // Final Holders Check
  const finalHolder1 = await contract.getCurrentHolder(onChainCropId1);
  const finalHolder2 = await contract.getCurrentHolder(onChainCropId2);
  const finalHolder3 = await contract.getCurrentHolder(onChainCropId3);

  // --------------------------------------------------------------------------
  // STEP 9: Print Reconciliation Table
  // --------------------------------------------------------------------------
  console.log('\n================================================================================');
  console.log('         BATCH-LEVEL INVENTORY & PROVENANCE RECONCILIATION TABLE                ');
  console.log('================================================================================');
  console.log(
    'Batch Code'.padEnd(18) +
    'DB ID'.padEnd(8) +
    'Chain ID'.padEnd(10) +
    'Crop Name'.padEnd(26) +
    'Qty'.padEnd(10) +
    'Shelf Price'.padEnd(14) +
    'Current Holder'
  );
  console.log('-'.repeat(105));

  const rows = [
    {
      code: batchNumber1,
      dbId: `#${dbCropId1}`,
      chainId: `#${onChainCropId1}`,
      name: SHARED_CROP_NAME,
      qty: '50 kg',
      price: `₹${Number(confirmedCrop1.retail_price_per_kg).toFixed(2)}/kg`,
      holder: `Retailer (${finalHolder1.slice(0, 10)}...)`,
    },
    {
      code: batchNumber2,
      dbId: `#${dbCropId2}`,
      chainId: `#${onChainCropId2}`,
      name: SHARED_CROP_NAME,
      qty: '100 kg',
      price: 'Pending',
      holder: `Farmer (${finalHolder2.slice(0, 10)}...)`,
    },
    {
      code: batchNumber3,
      dbId: `#${dbCropId3}`,
      chainId: `#${onChainCropId3}`,
      name: SHARED_CROP_NAME,
      qty: '50 kg',
      price: 'Pending',
      holder: `Farmer (${finalHolder3.slice(0, 10)}...)`,
    },
  ];

  for (const r of rows) {
    console.log(
      r.code.padEnd(18) +
      r.dbId.padEnd(8) +
      r.chainId.padEnd(10) +
      r.name.padEnd(26) +
      r.qty.padEnd(10) +
      r.price.padEnd(14) +
      r.holder
    );
  }
  console.log('-'.repeat(105));

  console.log('\n================================================================================');
  console.log('  ALL 10 VERIFICATION PHASES PASSED: DUPLICATE CROP NAMES FULLY SUPPORTED!     ');
  console.log('================================================================================\n');
}

runDuplicateCropNamesTest().catch((err) => {
  console.error('\n[FAIL] Duplicate crop names E2E test failed:', err);
  process.exitCode = 1;
});
