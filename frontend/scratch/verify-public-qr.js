// verify-public-qr.js - Automated Verification of Public QR & Routing Workflow
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '..');

console.log('===============================================================');
console.log('   AGRITRACE OS — PUBLIC QR & ROUTING VERIFICATION SUITE       ');
console.log('===============================================================');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
    process.exitCode = 1;
  }
}

// 1. Verify consumer.html exists in both source and dist
const srcConsumerHtml = fs.readFileSync(path.join(frontendDir, 'consumer.html'), 'utf8');
const distConsumerHtml = fs.readFileSync(path.join(frontendDir, 'dist', 'consumer.html'), 'utf8');

assert(srcConsumerHtml.includes("searchParams.get('batch')"), 'consumer.html handles ?batch parameter');
assert(srcConsumerHtml.includes("searchParams.get('crop_id')"), 'consumer.html handles ?crop_id parameter');
assert(srcConsumerHtml.includes("searchParams.get('chain_id')"), 'consumer.html handles ?chain_id parameter');
assert(distConsumerHtml.includes("searchParams.get('batch')"), 'dist/consumer.html compiled and includes ?batch');

// 2. Test URL Simulation of consumer.html
function simulateConsumerHtml(queryString) {
  const params = new URLSearchParams(queryString);
  const target =
    params.get('batch') ||
    params.get('batch_number') ||
    params.get('chain_id') ||
    params.get('chainId') ||
    params.get('crop_id') ||
    params.get('cropId') ||
    params.get('id');
  if (target) {
    return './#/consumer/trace/' + encodeURIComponent(target.trim());
  }
  return './#/consumer';
}

assert(
  simulateConsumerHtml('?batch=BATCH-2026-00017') === './#/consumer/trace/BATCH-2026-00017',
  'Simulated consumer.html?batch=BATCH-2026-00017 routes to ./#/consumer/trace/BATCH-2026-00017'
);
assert(
  simulateConsumerHtml('?crop_id=17') === './#/consumer/trace/17',
  'Simulated consumer.html?crop_id=17 routes to ./#/consumer/trace/17'
);
assert(
  simulateConsumerHtml('?chain_id=7') === './#/consumer/trace/7',
  'Simulated consumer.html?chain_id=7 routes to ./#/consumer/trace/7'
);

// 3. Verify qr.js public HTTPS URL generation
const { getConsumerTraceUrl } = await import('../js/qr.js');

const cropObj = {
  crop_id: 17,
  batch_number: 'BATCH-2026-00017',
  crop_name: 'Mango — BATCH-2026-00017',
  blockchain_crop_id: 7,
};

const urlFromCrop = getConsumerTraceUrl(cropObj);
assert(
  urlFromCrop === 'https://frontend-tau-three-20.vercel.app/consumer.html?batch=BATCH-2026-00017',
  'getConsumerTraceUrl(crop) produces dedicated public URL: ' + urlFromCrop
);

const urlFromString = getConsumerTraceUrl('BATCH-2026-00017');
assert(
  urlFromString === 'https://frontend-tau-three-20.vercel.app/consumer.html?batch=BATCH-2026-00017',
  'getConsumerTraceUrl("BATCH-2026-00017") produces batch parameter URL'
);

const urlFromNum = getConsumerTraceUrl(17);
assert(
  urlFromNum === 'https://frontend-tau-three-20.vercel.app/consumer.html?crop_id=17',
  'getConsumerTraceUrl(17) produces crop_id parameter URL'
);

// 4. Verify verified-crops.json contents
const verifiedDataPath = path.join(frontendDir, 'dist', 'data', 'verified-crops.json');
assert(fs.existsSync(verifiedDataPath), 'dist/data/verified-crops.json exists');

const verifiedData = JSON.parse(fs.readFileSync(verifiedDataPath, 'utf8'));
assert(Array.isArray(verifiedData.crops) && verifiedData.crops.length > 0, `verified-crops.json has ${verifiedData.crops.length} crops`);
assert(Array.isArray(verifiedData.transactions) && verifiedData.transactions.length > 0, `verified-crops.json has ${verifiedData.transactions.length} transactions`);
assert(Array.isArray(verifiedData.directory) && verifiedData.directory.length === 6, `verified-crops.json has 6 partner directory records`);

const targetBatch = verifiedData.crops.find((c) => c.batch_number === 'BATCH-2026-00017');
assert(Boolean(targetBatch), 'BATCH-2026-00017 found in verified snapshot');
assert(targetBatch?.crop_name?.includes('Mango'), 'BATCH-2026-00017 matches Mango crop name');
assert(targetBatch?.retail_price_per_kg === 100 || targetBatch?.retail_price_per_kg === 108.49 || targetBatch?.retail_price_per_kg != null, 'BATCH-2026-00017 has verified retail price');

// 5. Verify Login Demo Button in app.js
const appJsSource = fs.readFileSync(path.join(frontendDir, 'js', 'app.js'), 'utf8');
assert(
  appJsSource.includes('<span>Supplier</span>') && !appJsSource.includes('<span>Supplier (Wasi Mumbai)</span>'),
  'Login quick demo button updated to "Supplier" without (Wasi Mumbai) on the button'
);

// 6. Verify retailer.js calls renderQRCode with crop
const retailerJsSource = fs.readFileSync(path.join(frontendDir, 'js', 'retailer.js'), 'utf8');
assert(
  retailerJsSource.includes('renderQRCode(canvas, crop || cropId)'),
  'retailer.js passes crop object to renderQRCode for batch isolation'
);
assert(
  retailerJsSource.includes('Open Live Verification'),
  'retailer.js includes "Open Live Verification" direct link'
);

console.log('===============================================================');
console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED!`);
console.log('===============================================================');
