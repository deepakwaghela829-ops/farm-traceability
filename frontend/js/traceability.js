// traceability.js - End-to-End Provenance & Identity Resolution for AgriTrace OS
import {
  fetchCropByIdApi,
  fetchCropByBlockchainIdApi,
  fetchCropByBatchApi,
  fetchCropTransactionsApi,
  fetchCropPredictionApi,
} from './api.js';
import {
  getCropFromChain,
  getCurrentHolderFromChain,
  getMovementHistoryFromChain,
  isHarvestedOnChain,
  CONTRACT_ADDRESS,
  REQUIRED_CHAIN_ID,
} from './blockchain.js';
import { icons } from './icons.js';
import {
  formatAddress,
  getFriendlyAccountLabel,
  resolveUserByAddress,
  getPartnerDirectory,
} from './accounts.js';

function dateFromUnix(val) {
  const num = Number(val);
  if (!num || num <= 0) return 'N/A';
  return new Date(num * 1000).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function truncateAddress(addr) {
  if (!addr || typeof addr !== 'string') return '—';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export async function resolveCropProvenance(inputId, requestedType = null) {
  let rawInput = String(inputId || '').trim().replace(/^#/, '');
  if (!rawInput) {
    return {
      status: 'NOT_FOUND',
      statusLabel: 'Product Not Found',
      crop: null,
      movements: [],
      dbCrop: null,
      searchedId: '',
    };
  }

  // 1. Detect explicit prefix if present (e.g. "chain:7", "db:17", "batch:BATCH-2026-00017")
  let idType = requestedType;
  if (/^chain[-:]/i.test(rawInput)) {
    idType = 'blockchain';
    rawInput = rawInput.replace(/^chain[-:]/i, '');
  } else if (/^db[-:]/i.test(rawInput)) {
    idType = 'db';
    rawInput = rawInput.replace(/^db[-:]/i, '');
  } else if (/^batch:/i.test(rawInput)) {
    idType = 'batch';
    rawInput = rawInput.replace(/^batch:/i, '');
  }

  const isBatchCode = /^[A-Za-z0-9_-]{3,32}$/.test(rawInput) && !/^\d+$/.test(rawInput);
  if (!idType && isBatchCode) {
    idType = 'batch';
  }

  let dbCrop = null;

  // 2. Perform strictly scoped lookup based on idType to avoid cross-namespace confusion
  if (idType === 'batch') {
    try {
      dbCrop = await fetchCropByBatchApi(rawInput);
    } catch {
      dbCrop = null;
    }
  } else if (idType === 'blockchain') {
    const chainIdNum = parseInt(rawInput, 10);
    if (!isNaN(chainIdNum) && chainIdNum > 0) {
      try {
        dbCrop = await fetchCropByBlockchainIdApi(chainIdNum);
      } catch {
        dbCrop = null;
      }
    }
  } else if (idType === 'db') {
    const dbIdNum = parseInt(rawInput, 10);
    if (!isNaN(dbIdNum) && dbIdNum > 0) {
      try {
        dbCrop = await fetchCropByIdApi(dbIdNum, 'db');
      } catch {
        dbCrop = null;
      }
    }
  } else {
    // 3. Fallback Auto-Resolution (check batch -> DB ID -> Blockchain ID)
    const numId = parseInt(rawInput, 10);
    if (isBatchCode) {
      try {
        dbCrop = await fetchCropByBatchApi(rawInput);
      } catch {
        dbCrop = null;
      }
    }
    if (!dbCrop && !isNaN(numId) && numId > 0) {
      try {
        dbCrop = await fetchCropByIdApi(numId, 'db');
      } catch {
        dbCrop = null;
      }
    }
    if (!dbCrop && !isNaN(numId) && numId > 0) {
      try {
        dbCrop = await fetchCropByBlockchainIdApi(numId);
      } catch {
        dbCrop = null;
      }
    }
  }

  const numId = parseInt(rawInput, 10);

  if (!dbCrop && (isNaN(numId) || numId <= 0)) {
    return {
      status: 'NOT_FOUND',
      statusLabel: 'Product Not Found',
      crop: null,
      movements: [],
      dbCrop: null,
      searchedId: rawInput,
    };
  }

  // 4. Fetch recorded supply-chain transactions from database using canonical DB crop_id
  const queryCropId = dbCrop?.crop_id ?? numId;
  const txIdType = dbCrop ? 'db' : (idType === 'blockchain' ? 'blockchain' : 'db');
  let dbTransactions = [];
  try {
    dbTransactions = await fetchCropTransactionsApi(queryCropId, txIdType);
  } catch {
    dbTransactions = [];
  }

  // 5. Query Supply Chain Partner Directory to resolve friendly participant identities
  let directory = [];
  try {
    directory = await getPartnerDirectory();
  } catch {
    directory = [];
  }

  // 6. Determine Blockchain Crop ID to query on smart contract
  const targetOnChainId = dbCrop?.blockchain_crop_id ?? (idType === 'blockchain' ? numId : null);

  let onChainSuccess = false;
  let cropData = null;
  let currentHolder = '';
  let movementsRaw = [];
  let harvested = false;

  if (targetOnChainId !== null && targetOnChainId > 0) {
    try {
      const [cData, holder, hist, isHarv] = await Promise.all([
        getCropFromChain(targetOnChainId),
        getCurrentHolderFromChain(targetOnChainId),
        getMovementHistoryFromChain(targetOnChainId),
        isHarvestedOnChain(targetOnChainId),
      ]);
      cropData = cData;
      currentHolder = holder;
      movementsRaw = hist || [];
      harvested = Boolean(isHarv);
      onChainSuccess = true;
    } catch {
      onChainSuccess = false;
    }
  }

  // 7. Resolve Farmer Origin Identity & Verify Integrity
  const farmerUsername = dbCrop?.farmer_id || 'farmer1';
  const onChainFarmerAddr = cropData ? String(cropData.farmer ?? cropData[1]) : null;
  const dbFarmerAddr = dbCrop?.blockchain_farmer_address || null;

  const farmerUser = directory.find(
    (u) =>
      (u.username && u.username.toLowerCase() === farmerUsername.toLowerCase()) ||
      (onChainFarmerAddr && u.wallet_address && u.wallet_address.toLowerCase() === onChainFarmerAddr.toLowerCase()) ||
      (dbFarmerAddr && u.wallet_address && u.wallet_address.toLowerCase() === dbFarmerAddr.toLowerCase())
  );

  const farmerDisplayName = farmerUser?.full_name || farmerUsername;
  const registeredFarmerWallet = farmerUser?.wallet_address || dbFarmerAddr || null;

  let walletMismatch = false;
  let mismatchDetails = null;
  if (onChainFarmerAddr && registeredFarmerWallet) {
    if (onChainFarmerAddr.toLowerCase() !== registeredFarmerWallet.toLowerCase()) {
      walletMismatch = true;
      mismatchDetails = `Smart contract creator wallet (${onChainFarmerAddr}) does not match registered farmer wallet in database (${registeredFarmerWallet}).`;
    }
  }

  const farmerInfo = {
    username: farmerUsername,
    displayName: farmerDisplayName,
    registeredWallet: registeredFarmerWallet,
    onChainWallet: onChainFarmerAddr,
    walletMismatch,
    mismatchDetails,
  };

  // CASE A: Fully Verified on Blockchain
  if (onChainSuccess && cropData) {
    const movements = movementsRaw.map((m) => {
      const fromAddr = String(m.from ?? m[0]);
      const toAddr = String(m.to ?? m[1]);
      const toRole = String(m.toRole ?? m[2]);
      const ts = Number(m.timestamp ?? m[3]);

      const matchedTx = dbTransactions.find(
        (t) =>
          t.from_address.toLowerCase() === fromAddr.toLowerCase() &&
          t.to_address.toLowerCase() === toAddr.toLowerCase() &&
          t.to_role.trim().toLowerCase() === toRole.trim().toLowerCase()
      );

      return {
        from: fromAddr,
        to: toAddr,
        toRole,
        timestamp: ts,
        transactionHash: matchedTx?.transaction_hash || dbCrop?.blockchain_tx_hash || '—',
        blockNumber: matchedTx?.block_number || dbCrop?.blockchain_block_number || '—',
      };
    });

    const crop = {
      dbId: dbCrop?.crop_id || null,
      batchNumber: dbCrop?.batch_number || null,
      blockchainCropId: targetOnChainId,
      cropName: dbCrop?.crop_name || String(cropData.cropName ?? cropData[2]),
      cropType: String(cropData.cropType ?? cropData[3] ?? dbCrop?.crop_type),
      quantity: (cropData.quantity ?? cropData[4]).toString(),
      unit: String(cropData.unit ?? cropData[5]),
      cultivationDate: dateFromUnix(cropData.cultivationDate ?? cropData[6]),
      expectedHarvestDate: dateFromUnix(cropData.expectedHarvestDate ?? cropData[7]),
      location: String(cropData.location ?? cropData[8]),
      currentHolder: String(currentHolder),
      farmerAddress: String(cropData.farmer ?? cropData[1]),
      farmerUsername,
      farmerDisplayName,
      registeredFarmerWallet,
      onChainFarmerWallet: onChainFarmerAddr,
      walletMismatch,
      mismatchDetails,
      isHarvested: harvested,
      txHash: dbCrop?.blockchain_tx_hash || '—',
      blockNumber: dbCrop?.blockchain_block_number || '—',
      farmerPricePerKg: dbCrop?.farmer_price_per_kg != null ? Number(dbCrop.farmer_price_per_kg) : null,
      supplierMarginPerKg: dbCrop?.supplier_margin_per_kg != null ? Number(dbCrop.supplier_margin_per_kg) : 15.00,
      supplierPricePerKg: dbCrop?.supplier_price_per_kg != null ? Number(dbCrop.supplier_price_per_kg) : (dbCrop?.farmer_price_per_kg != null ? Number(dbCrop.farmer_price_per_kg) + 15.00 : null),
      retailPricePerKg: dbCrop?.retail_price_per_kg != null ? Number(dbCrop.retail_price_per_kg) : null,
      retailerMarkupPerKg: dbCrop?.retailer_markup_per_kg != null ? Number(dbCrop.retailer_markup_per_kg) : 30.00,
      retailConfirmedBy: dbCrop?.retail_confirmed_by || null,
      retailConfirmedAt: dbCrop?.retail_confirmed_at || null,
      retailerReceivedAt: dbCrop?.retailer_received_at || null,
      retailerReceivedBy: dbCrop?.retailer_received_by || null,
    };

    return {
      status: 'ON_CHAIN_VERIFIED',
      statusLabel: 'Blockchain Verified',
      crop,
      movements,
      dbCrop,
      dbTransactions,
      directory,
      farmerInfo,
    };
  }

  // CASE B: Verified in Database (Off-Chain)
  if (dbCrop) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isHarvestedNow = dbCrop.expected_harvest_date
      ? new Date(`${dbCrop.expected_harvest_date}T00:00:00`) <= today
      : false;

    const movements = dbTransactions.map((t) => ({
      from: t.from_address,
      to: t.to_address,
      toRole: t.to_role,
      timestamp: Math.floor(new Date(t.timestamp).getTime() / 1000),
      transactionHash: t.transaction_hash,
      blockNumber: t.block_number,
    }));

    const holder =
      dbTransactions.length > 0
        ? dbTransactions[dbTransactions.length - 1].to_address
        : dbCrop.blockchain_farmer_address || dbCrop.farmer_id;

    const crop = {
      dbId: dbCrop.crop_id,
      batchNumber: dbCrop.batch_number || null,
      blockchainCropId: dbCrop.blockchain_crop_id || null,
      _source: dbCrop._source || 'database',
      cropName: dbCrop.crop_name,
      cropType: dbCrop.crop_type,
      quantity: String(dbCrop.quantity),
      unit: dbCrop.unit,
      cultivationDate: dbCrop.cultivation_date,
      expectedHarvestDate: dbCrop.expected_harvest_date,
      location: dbCrop.location,
      currentHolder: holder,
      farmerAddress: dbCrop.blockchain_farmer_address || dbCrop.farmer_id,
      farmerUsername,
      farmerDisplayName,
      registeredFarmerWallet,
      onChainFarmerWallet: null,
      walletMismatch: false,
      mismatchDetails: null,
      isHarvested: isHarvestedNow,
      txHash: dbCrop.blockchain_tx_hash || '—',
      blockNumber: dbCrop.blockchain_block_number || '—',
      farmerPricePerKg: dbCrop.farmer_price_per_kg != null ? Number(dbCrop.farmer_price_per_kg) : null,
      supplierMarginPerKg: dbCrop?.supplier_margin_per_kg != null ? Number(dbCrop.supplier_margin_per_kg) : 15.00,
      supplierPricePerKg: dbCrop?.supplier_price_per_kg != null ? Number(dbCrop.supplier_price_per_kg) : (dbCrop.farmer_price_per_kg != null ? Number(dbCrop.farmer_price_per_kg) + 15.00 : null),
      retailPricePerKg: dbCrop?.retail_price_per_kg != null ? Number(dbCrop.retail_price_per_kg) : null,
      retailerMarkupPerKg: dbCrop?.retailer_markup_per_kg != null ? Number(dbCrop.retailer_markup_per_kg) : 30.00,
      retailConfirmedBy: dbCrop?.retail_confirmed_by || null,
      retailConfirmedAt: dbCrop?.retail_confirmed_at || null,
      retailerReceivedAt: dbCrop?.retailer_received_at || null,
      retailerReceivedBy: dbCrop?.retailer_received_by || null,
    };

    return {
      status: 'DATABASE_VERIFIED_OFFCHAIN',
      statusLabel: 'Database Record Verified',
      crop,
      movements,
      dbCrop,
      dbTransactions,
      directory,
      farmerInfo,
    };
  }

  // CASE C: Not Found
  return {
    status: 'NOT_FOUND',
    statusLabel: 'Product Not Found',
    crop: null,
    movements: [],
    dbCrop: null,
    directory: [],
    farmerInfo: null,
  };
}

export function renderTraceabilityHTML(resolution, aiPrediction = null) {
  if (resolution.status === 'NOT_FOUND' || !resolution.crop) {
    const searchedText = resolution.searchedId ? ` (${resolution.searchedId})` : '';
    return `
      <div class="card" style="text-align: center; padding: 48px 16px; border-color: var(--danger-border);">
        <div style="font-size: 36px; margin-bottom: 12px;">🔍</div>
        <h3 style="color: var(--danger); font-size: 20px; margin-bottom: 6px;">Product Not Found</h3>
        <p style="color: var(--text-muted); max-width: 500px; margin: 0 auto; line-height: 1.5;">
          The requested product identifier <strong>${searchedText}</strong> was not found in the verified registry. Please check the batch identifier printed on your packaging tag.
        </p>
      </div>
    `;
  }

  const c = resolution.crop;
  const movements = resolution.movements || [];
  const directory = resolution.directory || [];
  const farmerInfo = resolution.farmerInfo || {
    username: c.farmerUsername || 'farmer1',
    displayName: c.farmerDisplayName || 'farmer1',
    registeredWallet: c.registeredFarmerWallet,
    onChainWallet: c.onChainFarmerWallet,
    walletMismatch: c.walletMismatch,
    mismatchDetails: c.mismatchDetails,
  };

  const isChain = resolution.status === 'ON_CHAIN_VERIFIED';

  const supplierMv = movements.find((m) => m.toRole.toLowerCase().includes('supplier'));
  const retailerMv = movements.find((m) => m.toRole.toLowerCase().includes('retailer'));

  const retailerUser = directory.find((u) => u.role === 'RETAILER');
  const retailerDisplayName = retailerUser?.full_name || 'Apex Organic Mart (Retailer)';

  // Calculate Reference / Suggested Price
  const farmerPrice = c.farmerPricePerKg != null ? Number(c.farmerPricePerKg) : 63.49;
  const supplierMargin = c.supplierMarginPerKg != null ? Number(c.supplierMarginPerKg) : 15.00;
  const supplierSalePrice = c.supplierPricePerKg != null ? Number(c.supplierPricePerKg) : (farmerPrice + supplierMargin);
  const retailerMarkup = c.retailerMarkupPerKg != null ? Number(c.retailerMarkupPerKg) : 30.00;
  const finalShelfPrice = c.retailPricePerKg != null ? Number(c.retailPricePerKg) : (supplierSalePrice + retailerMarkup);

  const batchDisplay = c.batchNumber || `BATCH-2026-${String(c.dbId || c.blockchainCropId).padStart(5, '0')}`;

  return `
    <!-- SECTION 1: Product Header & Verification Status -->
    <div class="card" style="border-left: 4px solid var(--primary); margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap;">
            <span class="badge ${isChain ? 'badge-success' : 'badge-warning'}" style="font-size: 13px; padding: 6px 12px;">
              ${isChain ? '✓ Blockchain Verified' : (c._source === 'verified_snapshot' ? '✓ Verified Ledger Snapshot' : '✓ Database Record Verified')}
            </span>
            <span style="font-size: 13px; font-family: var(--font-mono); color: var(--primary); font-weight: 700; background: var(--primary-subtle); padding: 4px 10px; border-radius: 4px; border: 1px solid var(--primary-border);">
              ${batchDisplay}
            </span>
            <span style="font-size: 12px; color: var(--text-muted);">
              DB ID: #${c.dbId || '—'} ${c.blockchainCropId ? `&bull; On-Chain ID: #${c.blockchainCropId}` : ''}
            </span>
          </div>
          <h2 style="font-size: 26px; font-weight: 800; margin-bottom: 6px; color: #ffffff;">${c.cropName}</h2>
          <div style="font-size: 15px; color: var(--text-secondary);">
            Category: <strong style="color: #ffffff;">${c.cropType}</strong> &bull; Quantity: <strong>${c.quantity} ${c.unit}</strong> &bull; Origin: <strong>${c.location}</strong>
          </div>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); font-weight: 700; display: block; margin-bottom: 2px;">
            Current Custody Holder
          </span>
          <span style="font-size: 14px; color: var(--primary); font-weight: 700; display: block;">
            ${getFriendlyAccountLabel(c.currentHolder, directory)}
          </span>
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);">${truncateAddress(c.currentHolder)}</div>
        </div>
      </div>
    </div>

    <!-- SECTION 2: Farmer & Origin Details (Requirement 3) -->
    <div class="card" style="margin-bottom: 24px; border-left: 4px solid #10b981; background: var(--bg-surface);">
      <div class="card-header" style="margin-bottom: 16px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">🌱</span>
            <h3 style="font-size: 18px; font-weight: 700; color: #ffffff; margin: 0;">Farmer & Origin Details</h3>
          </div>
          <p style="font-size: 13px; color: var(--text-muted); margin: 4px 0 0 0;">
            Verified agricultural origin, cultivator identity, and immutable provenance anchor
          </p>
        </div>
        <span class="badge badge-success" style="font-size: 11px;">
          ${isChain ? '✓ Smart Contract Creator' : 'Verified Producer'}
        </span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
        <!-- Column A: Producer Identity & Agronomic Specifications -->
        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); font-weight: 700; margin-bottom: 12px;">
            Cultivator Profile & Agronomic Data
          </div>
          <div style="display: grid; grid-template-columns: 1fr; gap: 10px; font-size: 13px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-muted);">Farmer Display Name:</span>
              <strong style="color: #ffffff; font-size: 14px;">${farmerInfo.displayName}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-muted);">Farmer Username:</span>
              <span class="badge badge-info" style="font-family: var(--font-mono); font-size: 12px; padding: 2px 8px;">@${farmerInfo.username}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-muted);">Farm Location / Region:</span>
              <strong style="color: #ffffff;">${c.location}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-muted);">Crop Type / Category:</span>
              <strong>${c.cropType}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-muted);">Harvest Quantity & Unit:</span>
              <strong>${c.quantity} ${c.unit}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-muted);">Cultivation Date:</span>
              <span>${c.cultivationDate || '—'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-muted);">Expected Harvest Date:</span>
              <span>${c.expectedHarvestDate || '—'}</span>
            </div>
          </div>
        </div>

        <!-- Column B: Blockchain Origin Verification & Cryptographic Ledger Proof -->
        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); font-weight: 700; margin-bottom: 12px;">
              Blockchain Provenance & Verification
            </div>
            <div style="display: grid; grid-template-columns: 1fr; gap: 8px; font-size: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: var(--text-muted);">On-Chain Crop ID:</span>
                <strong style="color: var(--primary); font-size: 14px;">#${c.blockchainCropId || 'Off-chain'}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: var(--text-muted);">Unique Batch Code:</span>
                <code style="color: #34d399; font-weight: 700;">${batchDisplay}</code>
              </div>
              <div style="margin-top: 4px;">
                <div style="color: var(--text-muted); font-size: 11px; margin-bottom: 2px;">Registered Farmer Wallet (DB Record):</div>
                <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); word-break: break-all; background: rgba(0,0,0,0.25); padding: 4px 6px; border-radius: 4px;">
                  ${farmerInfo.registeredWallet || c.farmerAddress || '—'}
                </div>
              </div>
              <div>
                <div style="color: var(--text-muted); font-size: 11px; margin-bottom: 2px;">Smart Contract Creator Address (On-Chain):</div>
                <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); word-break: break-all; background: rgba(0,0,0,0.25); padding: 4px 6px; border-radius: 4px;">
                  ${farmerInfo.onChainWallet || (isChain ? c.farmerAddress : 'Off-chain Produce Record')}
                </div>
              </div>
            </div>

            <!-- Verification Integrity Alert or Pass Status -->
            ${
              farmerInfo.walletMismatch
                ? `
                <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; padding: 10px 12px; margin-top: 10px; color: #fca5a5; font-size: 12px;">
                  <div style="font-weight: 700; margin-bottom: 2px;">⚠️ Origin Identity Discrepancy</div>
                  <div>${farmerInfo.mismatchDetails}</div>
                </div>
                `
                : isChain
                ? `
                <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 8px 12px; margin-top: 10px; color: #34d399; font-size: 12px; display: flex; align-items: center; gap: 6px;">
                  <span>✓</span>
                  <span><strong>Cryptographically Verified:</strong> Registered farmer wallet matches smart contract creator address.</span>
                </div>
                `
                : ''
            }
          </div>

          <div style="font-size: 11px; color: var(--text-dim); margin-top: 12px; border-top: 1px solid var(--border-color); padding-top: 8px; line-height: 1.4;">
            Ledger Distinction: The smart contract anchors cryptographic wallet provenance and custody movements. Farmer username (<code>@${farmerInfo.username}</code>) and business display name are verified via AgriTrace OS identity directory.
          </div>
        </div>
      </div>
    </div>

    <!-- SECTION 3: Supply Chain Journey (Farmer -> Wasi Mumbai -> Retailer) -->
    <div class="card" style="margin-bottom: 24px;">
      <div class="card-header">
        <div>
          <h3 style="font-size: 18px; margin-bottom: 4px;">Supply Chain Journey</h3>
          <p style="font-size: 13px; color: var(--text-muted); margin: 0;">Chronological custody progression: Farmer &rarr; Wasi Mumbai (Supplier) &rarr; Retailer</p>
        </div>
        <span class="badge badge-info">6 Milestones</span>
      </div>

      <!-- Custody Flow Breadcrumb Bar -->
      <div class="custody-flow-bar" style="margin-bottom: 24px;">
        <div class="custody-step completed">
          <div class="custody-step-badge">✓</div>
          <span class="custody-step-name">${farmerInfo.displayName} (@${farmerInfo.username})</span>
        </div>
        <div class="custody-arrow">&rarr;</div>
        <div class="custody-step ${supplierMv ? 'completed' : c.isHarvested ? 'active' : 'pending'}">
          <div class="custody-step-badge">${supplierMv ? '✓' : '2'}</div>
          <span class="custody-step-name">Wasi Mumbai (@supplier1)</span>
        </div>
        <div class="custody-arrow">&rarr;</div>
        <div class="custody-step ${(retailerMv || c.retailerReceivedAt || c.retailConfirmedAt) ? 'completed' : supplierMv ? 'active' : 'pending'}">
          <div class="custody-step-badge">${(retailerMv || c.retailerReceivedAt || c.retailConfirmedAt) ? '✓' : '3'}</div>
          <span class="custody-step-name">${retailerDisplayName} (@retailer1)</span>
        </div>
      </div>

      <!-- Detailed 6-Stage Stepper -->
      <div class="stepper-timeline">
        <!-- Stage 1: Crop Registered -->
        <div class="stepper-node completed">
          <div class="stepper-bullet">✓</div>
          <div class="stepper-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <h4 style="font-size: 15px;">1. Crop Registered</h4>
              <span class="badge badge-success">Completed</span>
            </div>
            <div style="font-size: 13px; color: var(--text-muted);">
              Batch registered with digital identity #${c.blockchainCropId || c.dbId} (${batchDisplay}).
            </div>
            <div style="font-size: 12px; color: var(--text-dim); margin-top: 6px;">
              Origin: ${c.location} &bull; Sown: ${c.cultivationDate}
            </div>
          </div>
        </div>

        <!-- Stage 2: Farmer Origin -->
        <div class="stepper-node completed">
          <div class="stepper-bullet">✓</div>
          <div class="stepper-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <h4 style="font-size: 15px;">2. Farmer Origin Verified</h4>
              <span class="badge badge-success">Verified Farm</span>
            </div>
            <div style="font-size: 13px; color: var(--text-muted);">
              Farmer identity <strong>${farmerInfo.displayName}</strong> (<code>@${farmerInfo.username}</code>) verified at <strong>${c.location}</strong>.
            </div>
            <div style="font-size: 12px; color: var(--text-dim); margin-top: 6px; font-family: var(--font-mono);">
              Farmer Wallet: ${truncateAddress(farmerInfo.onChainWallet || c.farmerAddress)}
            </div>
          </div>
        </div>

        <!-- Stage 3: Harvest Status -->
        <div class="stepper-node ${c.isHarvested ? 'completed' : 'active'}">
          <div class="stepper-bullet">${c.isHarvested ? '✓' : '3'}</div>
          <div class="stepper-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <h4 style="font-size: 15px;">3. Harvest Status</h4>
              <span class="badge ${c.isHarvested ? 'badge-success' : 'badge-info'}">
                ${c.isHarvested ? 'Harvested / Ready' : 'In Cultivation'}
              </span>
            </div>
            <div style="font-size: 13px; color: var(--text-muted);">
              ${c.isHarvested ? 'Produce harvested and packed for logistics transport.' : 'Crop currently maturing in field.'}
            </div>
            <div style="font-size: 12px; color: var(--text-dim); margin-top: 6px;">
              Expected Harvest: ${c.expectedHarvestDate}
            </div>
          </div>
        </div>

        <!-- Stage 4: Supplier Custody (Wasi Mumbai) -->
        <div class="stepper-node ${supplierMv ? 'completed' : c.isHarvested ? 'active' : 'pending'}">
          <div class="stepper-bullet">${supplierMv ? '✓' : '4'}</div>
          <div class="stepper-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <h4 style="font-size: 15px;">4. Supplier Custody: Wasi Mumbai</h4>
              <span class="badge ${supplierMv ? 'badge-success' : 'badge-offchain'}">
                ${supplierMv ? 'Received by Wasi Mumbai' : c.isHarvested ? 'Awaiting Handover' : 'Pending Transfer'}
              </span>
            </div>
            <div style="font-size: 13px; color: var(--text-muted);">
              ${
                supplierMv
                  ? 'Wholesale logistics partner <strong>Wasi Mumbai</strong> (@supplier1) accepted on-chain custody and verified physical batch.'
                  : 'Awaiting supplier transport handover to Wasi Mumbai.'
              }
            </div>
            ${supplierMv ? `<div style="font-size: 12px; color: var(--text-dim); margin-top: 6px; font-family: var(--font-mono);">Tx: ${supplierMv.transactionHash.slice(0, 18)}... &bull; Block: ${supplierMv.blockNumber}</div>` : ''}
          </div>
        </div>

        <!-- Stage 5: Retailer -->
        <div class="stepper-node ${(retailerMv || c.retailerReceivedAt || c.retailConfirmedAt) ? 'completed' : supplierMv ? 'active' : 'pending'}">
          <div class="stepper-bullet">${(retailerMv || c.retailerReceivedAt || c.retailConfirmedAt) ? '✓' : '5'}</div>
          <div class="stepper-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <h4 style="font-size: 15px;">5. Retail Store Inventory: Apex Organic Mart</h4>
              <span class="badge ${(retailerMv || c.retailerReceivedAt || c.retailConfirmedAt) ? 'badge-success' : 'badge-offchain'}">
                ${(retailerMv || c.retailerReceivedAt || c.retailConfirmedAt) ? 'Received in Store' : supplierMv ? 'In Transit' : 'Pending Delivery'}
              </span>
            </div>
            <div style="font-size: 13px; color: var(--text-muted);">
              ${
                (retailerMv || c.retailerReceivedAt)
                  ? 'Produce received into active supermarket inventory at Apex Organic Mart (@retailer1).'
                  : 'Produce scheduled for supermarket delivery and retail intake.'
              }
            </div>
            ${retailerMv ? `<div style="font-size: 12px; color: var(--text-dim); margin-top: 6px; font-family: var(--font-mono);">Tx: ${retailerMv.transactionHash.slice(0, 18)}... &bull; Block: ${retailerMv.blockNumber}</div>` : ''}
          </div>
        </div>

        <!-- Stage 6: Consumer Verification -->
        <div class="stepper-node ${(c.retailPricePerKg != null && (retailerMv || c.retailerReceivedAt || c.retailConfirmedAt)) ? 'completed' : 'pending'}">
          <div class="stepper-bullet">${(c.retailPricePerKg != null && (retailerMv || c.retailerReceivedAt || c.retailConfirmedAt)) ? '✓' : '6'}</div>
          <div class="stepper-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <h4 style="font-size: 15px;">6. Consumer Shelf Sale & Verification</h4>
              <span class="badge ${(c.retailPricePerKg != null && (retailerMv || c.retailerReceivedAt || c.retailConfirmedAt)) ? 'badge-success' : 'badge-info'}">
                ${(c.retailPricePerKg != null && (retailerMv || c.retailerReceivedAt || c.retailConfirmedAt)) ? 'Ready for Purchase' : 'In Pipeline'}
              </span>
            </div>
            <div style="font-size: 13px; color: var(--text-muted);">
              Packaging QR enables real-time verification of origin and transparent supply chain journey.
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- SECTION 4: Chronological Custody History & Transaction Hashes -->
    ${
      movements.length > 0
        ? `
        <div class="card" style="margin-bottom: 24px;">
          <div class="card-header">
            <div>
              <h3 style="font-size: 16px;">Chronological On-Chain Custody Log</h3>
              <p style="font-size: 13px; color: var(--text-muted); margin: 0;">Immutable custody transfer transactions mined on Ganache</p>
            </div>
            <span class="badge badge-success">${movements.length} Handover${movements.length > 1 ? 's' : ''}</span>
          </div>
          <div class="table-container-scrollable" style="max-height: 280px;">
            <table class="table" style="font-size: 12px;">
              <thead>
                <tr>
                  <th>#</th>
                  <th>From Dispatcher</th>
                  <th>To Recipient</th>
                  <th>Destination Role</th>
                  <th>Block</th>
                  <th>Transaction Hash</th>
                  <th>Date & Time</th>
                </tr>
              </thead>
              <tbody>
                ${movements
                  .map(
                    (m, idx) => `
                    <tr>
                      <td style="font-weight: 700; color: var(--primary);">${idx + 1}</td>
                      <td>
                        <div>${getFriendlyAccountLabel(m.from, directory)}</div>
                        <div style="font-family: var(--font-mono); font-size: 10px; color: var(--text-dim);">${truncateAddress(m.from)}</div>
                      </td>
                      <td>
                        <div style="color: #60a5fa; font-weight: 600;">${getFriendlyAccountLabel(m.to, directory)}</div>
                        <div style="font-family: var(--font-mono); font-size: 10px; color: var(--text-dim);">${truncateAddress(m.to)}</div>
                      </td>
                      <td><span class="badge badge-info" style="font-size: 10px;">${m.toRole}</span></td>
                      <td style="font-family: var(--font-mono);">${m.blockNumber}</td>
                      <td>
                        <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);" title="${m.transactionHash}">
                          ${m.transactionHash !== '—' ? `${m.transactionHash.slice(0, 16)}...` : '—'}
                        </span>
                      </td>
                      <td style="color: var(--text-dim); white-space: nowrap;">${dateFromUnix(m.timestamp)}</td>
                    </tr>
                    `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
        `
        : ''
    }

    <!-- SECTION 5: Multi-Stage Transparent Pricing Breakdown -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; margin-bottom: 24px;">
      <!-- Product Specifications Card -->
      <div class="card" style="margin-bottom: 0;">
        <h3 style="font-size: 16px; margin-bottom: 14px;">Product Specifications</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
          <div>
            <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Product Name</span>
            <strong style="color: #ffffff;">${c.cropName}</strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Category</span>
            <strong>${c.cropType}</strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Batch Number</span>
            <code style="color: var(--primary); font-weight: 700;">${batchDisplay}</code>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Quantity</span>
            <strong>${c.quantity} ${c.unit}</strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Farm Origin</span>
            <strong>${c.location}</strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Cultivator</span>
            <strong>${farmerInfo.displayName}</strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Cultivation Date</span>
            <span>${c.cultivationDate}</span>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Expected Harvest</span>
            <span>${c.expectedHarvestDate}</span>
          </div>
        </div>
      </div>

      <!-- Transparent Price Breakdown Card -->
      <div class="card" style="margin-bottom: 0; background: var(--bg-surface); border-color: ${c.retailPricePerKg != null ? 'var(--primary-border)' : 'var(--warning-border, #f59e0b)'}; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">
              Transparent Price Audit
            </span>
            ${
              c.retailPricePerKg != null
                ? `<span class="badge badge-success" style="font-size: 11px;">✓ Retail Price Confirmed</span>`
                : `<span class="badge badge-warning" style="font-size: 11px;">⏳ Pricing Pending</span>`
            }
          </div>

          ${
            c.retailPricePerKg != null
              ? `
              <div style="font-size: 34px; font-weight: 800; color: #34d399; margin: 6px 0;">
                ₹${c.retailPricePerKg.toFixed(2)} <span style="font-size: 15px; font-weight: 500; color: var(--text-muted);">/ kg</span>
              </div>
              <div style="font-size: 13px; font-weight: 600; color: #ffffff; margin-bottom: 8px;">
                Published Consumer Shelf Price
              </div>
              <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px 14px; margin-bottom: 12px; font-size: 13px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                  <span style="color: var(--text-muted);">1. Registered Farm-Gate Base Price:</span>
                  <strong>₹${farmerPrice.toFixed(2)} / kg</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                  <span style="color: var(--text-muted);">2. Supplier Margin (Wasi Mumbai):</span>
                  <strong>+ ₹${supplierMargin.toFixed(2)} / kg</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #60a5fa; font-weight: 600;">
                  <span>Supplier Sale Price (Retailer Cost):</span>
                  <span>= ₹${supplierSalePrice.toFixed(2)} / kg</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                  <span style="color: var(--text-muted);">3. Retailer Markup (Apex Organic Mart):</span>
                  <strong>+ ₹${retailerMarkup.toFixed(2)} / kg</strong>
                </div>
                <div style="border-top: 1px solid var(--border-color); padding-top: 8px; display: flex; justify-content: space-between; color: #34d399; font-weight: 800; font-size: 14px;">
                  <span>Final Consumer Shelf Price:</span>
                  <span>₹${c.retailPricePerKg.toFixed(2)} / kg</span>
                </div>
              </div>
              <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 4px;">
                Confirmed by: <strong style="color: var(--text-secondary);">${c.retailConfirmedBy || 'Apex Organic Mart (retailer1)'}</strong>
              </div>
              `
              : `
              <div style="font-size: 24px; font-weight: 700; color: #f59e0b; margin: 10px 0;">
                Retail Pricing In Progress
              </div>
              <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 12px;">
                Consignment is moving through the supply chain. Verified shelf pricing will be published upon supermarket receipt.
              </p>
              <div style="background: rgba(255,255,255,0.02); padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border-color); font-size: 12px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span style="color: var(--text-muted);">Registered Farm-Gate Price:</span>
                  <strong>₹${farmerPrice.toFixed(2)} / kg</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span style="color: var(--text-muted);">Standard Supplier Margin (Wasi Mumbai):</span>
                  <strong>+ ₹${supplierMargin.toFixed(2)} / kg</strong>
                </div>
                <div style="display: flex; justify-content: space-between; color: #60a5fa; font-weight: 600;">
                  <span>Estimated Supplier Sale Price:</span>
                  <span>= ₹${supplierSalePrice.toFixed(2)} / kg</span>
                </div>
              </div>
              `
          }
        </div>
        <div style="font-size: 11px; color: var(--text-dim); border-top: 1px solid var(--border-color); padding-top: 10px; margin-top: 14px; line-height: 1.5;">
          Pricing Transparency Audit: Values reflect the registered farm-gate price plus agreed stage margins (₹15.00/kg Wasi Mumbai supplier margin and ₹30.00/kg retailer markup). Calculated formula: Farm-Gate ₹${farmerPrice.toFixed(2)} + Supplier ₹${supplierMargin.toFixed(2)} + Retailer ₹${retailerMarkup.toFixed(2)} = ₹${finalShelfPrice.toFixed(2)}/kg.
        </div>
      </div>
    </div>

    <!-- SECTION 6: Technical Blockchain Details (Section 17) -->
    <details class="card" style="background: var(--bg-surface); cursor: pointer;">
      <summary style="font-size: 14px; font-weight: 600; color: var(--text-muted); outline: none;">
        Technical Blockchain & Smart Contract Details
      </summary>
      <div style="margin-top: 16px; font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); display: grid; grid-template-columns: 1fr; gap: 8px; word-break: break-all;">
        <div>Blockchain Network: <span style="color: var(--text-main);">Ganache EVM (Chain ID ${REQUIRED_CHAIN_ID})</span></div>
        <div>Blockchain Crop ID: <span style="color: var(--primary); font-weight: bold;">#${c.blockchainCropId || 'Not registered on-chain'}</span></div>
        <div>Active Contract Address: <span style="color: var(--text-main);">${CONTRACT_ADDRESS}</span></div>
        <div>Farmer / Creator Wallet: <span style="color: var(--text-main);">${farmerInfo.onChainWallet || c.farmerAddress}</span></div>
        <div>Creation Transaction Hash: <span style="color: var(--text-main);">${c.txHash}</span></div>
        <div>Mined Block Number: <span style="color: var(--text-main);">${c.blockNumber}</span></div>
      </div>
    </details>
  `;
}
