// test-custody-handover-regression.js
// Verification suite for Farmer-to-Supplier Custody Handover and Batch Isolation
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
  const res = await request('/api/auth/login', 'POST', { username, password });
  return res.access_token;
}

async function run() {
  console.log('======================================================================');
  console.log('   AGRITRACE OS: CUSTODY HANDOVER & ISOLATION REGRESSION SUITE       ');
  console.log('======================================================================\n');

  const provider = new ethers.JsonRpcProvider(GANACHE_RPC);
  const accounts = await provider.listAccounts();
  const contract = new ethers.Contract(deploymentInfo.contractAddress, cropRegistryAbi, provider);

  const farmerSigner = await provider.getSigner(accounts[0].address);
  const supplierSigner = await provider.getSigner(accounts[1].address);
  const retailerSigner = await provider.getSigner(accounts[2].address);

  const farmerWallet = accounts[0].address;
  const supplierWallet = accounts[1].address;
  const retailerWallet = accounts[2].address;

  console.log('Participants Verified:');
  console.log(`  Farmer Wallet  (farmer1)   : ${farmerWallet}`);
  console.log(`  Supplier Wallet (Wasi Mumbai) : ${supplierWallet}`);
  console.log(`  Retailer Wallet (retailer1) : ${retailerWallet}`);
  console.log(`  Smart Contract Address      : ${deploymentInfo.contractAddress}\n`);

  // STEP 0: Authenticate
  const farmerToken = await login('farmer1');
  const supplierToken = await login('supplier1');
  const retailerToken = await login('retailer1');

  const nowUnix = Math.floor(Date.now() / 1000);

  // STEP 1: Farmer registers Batch A (Mango, 300 kg)
  console.log('>>> STEP 1: Farmer registers Batch A (Mango, 300 kg)');
  const farmerContract = contract.connect(farmerSigner);
  const txRegA = await farmerContract.registerCrop(
    'Mango',
    'Mango',
    300,
    'kg',
    nowUnix,
    nowUnix + 45 * 86400,
    'Nashik Orchards, Block A'
  );
  const recRegA = await txRegA.wait();
  const farmerCropsA = await contract.getFarmerCrops(farmerWallet);
  const onChainCropIdA = Number(farmerCropsA[farmerCropsA.length - 1]);

  const payloadA = {
    crop_type: 'Mango',
    quantity: 300,
    unit: 'kg',
    cultivation_date: '2026-07-01',
    expected_harvest_date: '2026-08-15',
    location: 'Nashik Orchards, Block A',
    farmer_id: 'farmer1',
    farmer_price_per_kg: 65.00,
    blockchain_crop_id: onChainCropIdA,
    blockchain_tx_hash: txRegA.hash,
    blockchain_block_number: recRegA.blockNumber,
    blockchain_farmer_address: farmerWallet,
  };
  const cropA = await request('/api/crops', 'POST', payloadA, farmerToken);
  console.log(`  [PASS] Batch A created: DB #${cropA.crop_id} (${cropA.batch_number}) -> On-Chain #${onChainCropIdA}`);

  // Confirm initial holder is Farmer
  const initialHolderA = await contract.getCurrentHolder(onChainCropIdA);
  if (initialHolderA.toLowerCase() !== farmerWallet.toLowerCase()) {
    throw new Error(`Expected initial holder to be Farmer (${farmerWallet}), got ${initialHolderA}`);
  }
  console.log(`  [PASS] Initial On-Chain Holder: ${initialHolderA} (Matches Farmer: TRUE)`);

  // STEP 2: Farmer dispatches Batch A to Wasi Mumbai (supplier1)
  console.log('\n>>> STEP 2: Farmer dispatches Batch A to Wasi Mumbai');
  const txDispatchA = await farmerContract.transferCrop(onChainCropIdA, supplierWallet, 'Supplier');
  const recDispatchA = await txDispatchA.wait();
  console.log(`  [PASS] transferCrop(Farmer -> Wasi Mumbai) confirmed in block #${recDispatchA.blockNumber}`);

  // Record dispatch in database
  await request('/api/transactions', 'POST', {
    crop_id: cropA.crop_id,
    from_address: farmerWallet,
    to_address: supplierWallet,
    to_role: 'Supplier',
    transaction_hash: txDispatchA.hash,
    block_number: recDispatchA.blockNumber,
    timestamp: new Date().toISOString(),
    notes: 'Dispatched to wholesale partner Wasi Mumbai',
  }, farmerToken);

  // STEP 3: Smart contract confirms Wasi Mumbai is the current holder
  console.log('\n>>> STEP 3: Verify Supplier Custody on Smart Contract');
  const holderAfterDispatchA = await contract.getCurrentHolder(onChainCropIdA);
  if (holderAfterDispatchA.toLowerCase() !== supplierWallet.toLowerCase()) {
    throw new Error(`Expected current holder to be Wasi Mumbai (${supplierWallet}), got ${holderAfterDispatchA}`);
  }
  console.log(`  [PASS] Verified On-Chain Current Holder: ${holderAfterDispatchA}`);
  console.log(`  [PASS] Matches Wasi Mumbai (${supplierWallet}): TRUE`);

  // STEP 4: Wasi Mumbai transfers Batch A to retailer1
  console.log('\n>>> STEP 4: Supplier transfers Batch A to Retailer');
  const supplierContract = contract.connect(supplierSigner);
  const txTransferA = await supplierContract.transferCrop(onChainCropIdA, retailerWallet, 'Retailer');
  const recTransferA = await txTransferA.wait();
  console.log(`  [PASS] transferCrop(Wasi Mumbai -> Retailer) confirmed in block #${recTransferA.blockNumber}`);

  // Record transfer in database
  await request('/api/transactions', 'POST', {
    crop_id: cropA.crop_id,
    from_address: supplierWallet,
    to_address: retailerWallet,
    to_role: 'Retailer',
    transaction_hash: txTransferA.hash,
    block_number: recTransferA.blockNumber,
    timestamp: new Date().toISOString(),
    notes: 'Transferred from Wasi Mumbai to Apex Organic Mart',
  }, supplierToken);

  // STEP 5: Smart contract confirms Retailer is the current holder
  console.log('\n>>> STEP 5: Verify Retailer Custody on Smart Contract');
  const holderAfterRetailerA = await contract.getCurrentHolder(onChainCropIdA);
  if (holderAfterRetailerA.toLowerCase() !== retailerWallet.toLowerCase()) {
    throw new Error(`Expected current holder to be Retailer (${retailerWallet}), got ${holderAfterRetailerA}`);
  }
  console.log(`  [PASS] Verified On-Chain Current Holder: ${holderAfterRetailerA}`);
  console.log(`  [PASS] Matches Retailer (${retailerWallet}): TRUE`);

  // STEP 6: Movement history contains both transfers in chronological order
  console.log('\n>>> STEP 6: Verify Movement History Provenance');
  const historyA = await contract.getMovementHistory(onChainCropIdA);
  if (historyA.length !== 2) {
    throw new Error(`Expected exactly 2 movements for Batch A, got ${historyA.length}`);
  }
  console.log(`  [PASS] Smart contract recorded ${historyA.length} custody movement events in order:`);
  console.log(`         1. From: ${historyA[0].from} -> To: ${historyA[0].to} (${historyA[0].toRole})`);
  console.log(`         2. From: ${historyA[1].from} -> To: ${historyA[1].to} (${historyA[1].toRole})`);

  if (historyA[0].to.toLowerCase() !== supplierWallet.toLowerCase()) {
    throw new Error('First movement destination must be Supplier');
  }
  if (historyA[1].to.toLowerCase() !== retailerWallet.toLowerCase()) {
    throw new Error('Second movement destination must be Retailer');
  }
  console.log(`  [PASS] Chronological Provenance Trail Verified 100%!`);

  // STEP 7: Register Batch B with the SAME crop type ("Mango") and confirm isolation
  console.log('\n>>> STEP 7: Batch Isolation Verification (Batch B - Same Crop Type "Mango")');
  const txRegB = await farmerContract.registerCrop(
    'Mango',
    'Mango',
    450,
    'kg',
    nowUnix,
    nowUnix + 50 * 86400,
    'Nashik Orchards, Block B'
  );
  const recRegB = await txRegB.wait();
  const farmerCropsB = await contract.getFarmerCrops(farmerWallet);
  const onChainCropIdB = Number(farmerCropsB[farmerCropsB.length - 1]);

  const payloadB = {
    crop_type: 'Mango',
    quantity: 450,
    unit: 'kg',
    cultivation_date: '2026-07-05',
    expected_harvest_date: '2026-08-25',
    location: 'Nashik Orchards, Block B',
    farmer_id: 'farmer1',
    farmer_price_per_kg: 68.00,
    blockchain_crop_id: onChainCropIdB,
    blockchain_tx_hash: txRegB.hash,
    blockchain_block_number: recRegB.blockNumber,
    blockchain_farmer_address: farmerWallet,
  };
  const cropB = await request('/api/crops', 'POST', payloadB, farmerToken);
  console.log(`  [PASS] Batch B created: DB #${cropB.crop_id} (${cropB.batch_number}) -> On-Chain #${onChainCropIdB}`);

  // Confirm Batch B remains with Farmer
  const holderB = await contract.getCurrentHolder(onChainCropIdB);
  if (holderB.toLowerCase() !== farmerWallet.toLowerCase()) {
    throw new Error(`Expected Batch B holder to remain Farmer (${farmerWallet}), got ${holderB}`);
  }
  console.log(`  [PASS] Batch B Current Holder: ${holderB} (Farmer match: TRUE)`);

  const historyB = await contract.getMovementHistory(onChainCropIdB);
  if (historyB.length !== 0) {
    throw new Error(`Expected 0 movements for Batch B, got ${historyB.length}`);
  }
  console.log(`  [PASS] Batch B Movement Count: ${historyB.length} (Unaffected by Batch A transfers: TRUE)`);

  // Test unauthorized transfer rejection on Batch B:
  // If Supplier tries to transfer Batch B before Farmer dispatches it:
  console.log('  Testing unauthorized transfer rejection on Batch B by Supplier:');
  let rejectedAsExpected = false;
  try {
    await supplierContract.transferCrop.staticCall(onChainCropIdB, retailerWallet, 'Retailer');
  } catch (revertErr) {
    rejectedAsExpected = true;
    console.log(`  [PASS] Smart contract rejected unauthorized transfer: "${revertErr.reason || revertErr.shortMessage || revertErr.message}"`);
  }
  if (!rejectedAsExpected) {
    throw new Error('Smart contract should have rejected transferCrop by non-holder!');
  }

  console.log('\n======================================================================');
  console.log('       ALL 7 REGRESSION CHECKS PASSED WITH 100% SUCCESS!              ');
  console.log('======================================================================');
}

run().catch((err) => {
  console.error('\n[FATAL ERROR]:', err);
  process.exit(1);
});
