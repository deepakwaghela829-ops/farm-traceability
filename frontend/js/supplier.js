// supplier.js - Supplier Portal Logic for AgriTrace OS
import { fetchCropsApi, saveTransactionApi, confirmSupplierMarginApi } from './api.js';
import { transferCropOnChain, getAccounts, getCurrentHolderFromChain } from './blockchain.js';
import { resolveCropProvenance, renderTraceabilityHTML } from './traceability.js';
import { getToken, getCurrentUser } from './auth.js';
import { icons } from './icons.js';
import { toast, showConfirmDialog } from './notifications.js';
import {
  getPartnerDirectory,
  formatAddress,
  getFriendlyAccountLabel,
  resolveUserByAddress,
  resolveAddressByUsername,
  getUserWallet,
} from './accounts.js';

let activeSubTab = 'crops';
let cachedCrops = [];
let preselectedCropId = null;

export async function initSupplierView(container) {
  activeSubTab = 'crops';
  preselectedCropId = null;
  await renderSupplierView(container);
}

export async function renderSupplierView(container) {
  try {
    cachedCrops = await fetchCropsApi();
  } catch (err) {
    cachedCrops = [];
    console.error('Failed to load crops for supplier:', err);
  }

  const totalCrops = cachedCrops.length;
  const verifiedCrops = cachedCrops.filter((c) => c.blockchain_crop_id != null).length;
  const pendingTransfers = Math.min(3, totalCrops);
  const received = Math.max(0, totalCrops - pendingTransfers);

  container.innerHTML = `
    <!-- Supplier Header -->
    <div class="view-intro">
      <div class="view-title-row">
        <div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <h2>Supplier Dashboard</h2>
            <span class="badge badge-info" style="font-size: 13px; font-weight: 700;">Wasi Mumbai</span>
          </div>
          <p>Authenticated as <strong style="color: var(--primary);">supplier1</strong> (Wasi Mumbai) &bull; Wholesale Logistics & Custody</p>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button id="supplier-btn-transfer" class="btn btn-primary">
            ${icons.truck} <span>Transfer Custody</span>
          </button>
          <button id="supplier-btn-refresh" class="btn btn-secondary">
            ${icons.refresh} <span>Refresh</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div style="display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
      <button class="btn ${activeSubTab === 'crops' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-tab="crops">
        ${icons.store} <span>Incoming Consignments (${totalCrops})</span>
      </button>
      <button class="btn ${activeSubTab === 'transfer' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-tab="transfer">
        ${icons.arrowRight} <span>Custody Transfer</span>
      </button>
      <button class="btn ${activeSubTab === 'traceability' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-tab="traceability">
        ${icons.shieldCheck} <span>Traceability Audit</span>
      </button>
    </div>

    <!-- SUBVIEW CONTAINER -->
    <div id="supplier-subview"></div>
  `;

  // Bind Tab Handlers
  container.querySelectorAll('button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeSubTab = btn.getAttribute('data-tab');
      renderSupplierView(container);
    });
  });

  container.querySelector('#supplier-btn-refresh')?.addEventListener('click', () => {
    renderSupplierView(container);
  });

  container.querySelector('#supplier-btn-transfer')?.addEventListener('click', () => {
    activeSubTab = 'transfer';
    renderSupplierView(container);
  });

  const subviewContainer = container.querySelector('#supplier-subview');
  if (activeSubTab === 'crops') {
    renderIncomingCropsView(subviewContainer, container, {
      totalCrops,
      received,
      pendingTransfers,
      verifiedCrops,
    });
  } else if (activeSubTab === 'transfer') {
    renderTransferView(subviewContainer, container);
  } else if (activeSubTab === 'traceability') {
    renderTraceabilityView(subviewContainer);
  }
}

function renderIncomingCropsView(container, parentContainer, stats) {
  const rows = cachedCrops.map((c) => {
    const isChain = c.blockchain_crop_id != null;
    const farmerPrice = c.farmer_price_per_kg != null ? Number(c.farmer_price_per_kg) : 63.49;
    const supplierMargin = c.supplier_margin_per_kg != null ? Number(c.supplier_margin_per_kg) : 15.00;
    const supplierPrice = c.supplier_price_per_kg != null ? Number(c.supplier_price_per_kg) : (farmerPrice + supplierMargin);

    const batchCode = c.batch_number || `BATCH-2026-${String(c.crop_id).padStart(5, '0')}`;
    return `
      <tr class="supplier-crop-row" 
          data-name="${(c.crop_name || '').toLowerCase()}" 
          data-batch="${batchCode.toLowerCase()}" 
          data-dbid="${c.crop_id}" 
          data-chainid="${c.blockchain_crop_id || ''}">
        <td>
          <div style="font-family: var(--font-mono); font-weight: 700; color: var(--primary); font-size: 13px;">${batchCode}</div>
          <div style="font-size: 11px; color: var(--text-dim);">DB #${c.crop_id} ${isChain ? `&bull; Chain #${c.blockchain_crop_id}` : ''}</div>
        </td>
        <td>
          <div style="font-weight: 600;">${c.crop_name}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${c.crop_type}</div>
        </td>
        <td><strong>${c.quantity}</strong> ${c.unit}</td>
        <td>
          <div style="font-weight: 600; color: #60a5fa;">₹${supplierPrice.toFixed(2)}/kg</div>
          <div style="font-size: 11px; color: var(--text-muted);">Cost: ₹${farmerPrice.toFixed(2)} + ₹${supplierMargin.toFixed(2)} margin</div>
        </td>
        <td>${c.farmer_id || 'farmer1'}</td>
        <td>${c.location}</td>
        <td>
          ${
            isChain
              ? `<span class="badge badge-success">✓ On-Chain #${c.blockchain_crop_id}</span>`
              : `<span class="badge badge-warning">• Off-Chain Record</span>`
          }
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm supplier-btn-trace-crop" data-id="${c.crop_id}" style="margin-right: 6px;">Trace</button>
          <button class="btn btn-primary btn-sm supplier-btn-transfer-crop" data-id="${c.crop_id}">Transfer Custody</button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <!-- KPI Cards Grid -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Incoming Crops</span>
          <span class="kpi-value">${stats.totalCrops}</span>
          <span class="kpi-subtext">Total consignments</span>
        </div>
        <div class="kpi-icon-box">${icons.store}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Received</span>
          <span class="kpi-value">${stats.received}</span>
          <span class="kpi-subtext">In transit / warehouse</span>
        </div>
        <div class="kpi-icon-box">${icons.truck}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Pending Transfer</span>
          <span class="kpi-value">${stats.pendingTransfers}</span>
          <span class="kpi-subtext">Awaiting handover</span>
        </div>
        <div class="kpi-icon-box">${icons.clock}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Verified</span>
          <span class="kpi-value" style="color: #34d399;">${stats.verifiedCrops}</span>
          <span class="kpi-subtext">On-Chain Provenance</span>
        </div>
        <div class="kpi-icon-box">${icons.shieldCheck}</div>
      </div>
    </div>

    <!-- Table Card -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3>Incoming Consignments & Inventory</h3>
          <p>Agricultural batches eligible for logistics handover and verification</p>
        </div>
        <span class="badge badge-info">${cachedCrops.length} records available</span>
      </div>

      ${
        cachedCrops.length === 0
          ? `
          <div style="text-align: center; padding: 48px 16px;">
            <p style="color: var(--text-muted);">No crop consignments available in the system.</p>
          </div>
          `
          : `
          <!-- Toolbar -->
          <div class="table-toolbar">
            <div class="table-toolbar-left">
              <input type="text" id="supplier-crop-search" class="table-search-input" placeholder="Search by crop name, batch, DB #, on-chain #..." aria-label="Search incoming consignments" />
            </div>
            <div class="table-count-label" id="supplier-crop-count">
              Showing ${cachedCrops.length} of ${cachedCrops.length} crops
            </div>
          </div>

          <div class="table-responsive table-container-scrollable">
            <table class="table">
              <thead>
                <tr>
                  <th>Batch / DB ID</th>
                  <th>Crop Name</th>
                  <th>Quantity</th>
                  <th>Pricing Breakdown</th>
                  <th>Farmer</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody id="supplier-crops-tbody">
                ${rows}
              </tbody>
            </table>
          </div>
          `
      }
    </div>
  `;

  // Bind Buttons
  container.querySelectorAll('.supplier-btn-transfer-crop').forEach((btn) => {
    btn.addEventListener('click', () => {
      preselectedCropId = btn.getAttribute('data-id');
      activeSubTab = 'transfer';
      renderSupplierView(parentContainer);
    });
  });

  container.querySelectorAll('.supplier-btn-trace-crop').forEach((btn) => {
    btn.addEventListener('click', () => {
      preselectedCropId = btn.getAttribute('data-id');
      activeSubTab = 'traceability';
      renderSupplierView(parentContainer);
    });
  });
}

async function renderTransferView(container, parentContainer) {
  const token = getToken();
  let accounts = [];
  try {
    accounts = await getAccounts();
  } catch {
    accounts = [];
  }

  const directory = await getPartnerDirectory(token);
  const retailers = directory.filter((u) => u.role === 'RETAILER');
  if (retailers.length === 0) {
    retailers.push({
      username: 'retailer1',
      full_name: 'Apex Organic Mart (Retailer)',
      role: 'RETAILER',
      wallet_address: '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b',
    });
  }

  const currentUser = getCurrentUser();
  const expectedSupplierWallet = getUserWallet(currentUser, directory) || '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0';
  let signerAddress = expectedSupplierWallet;
  if (accounts.length > 0) {
    const matching = accounts.find((a) => a.toLowerCase() === expectedSupplierWallet.toLowerCase());
    if (matching) {
      signerAddress = matching;
    } else if (accounts.length > 1 && accounts[1].toLowerCase() === expectedSupplierWallet.toLowerCase()) {
      signerAddress = accounts[1];
    }
  }

  const signerUser = resolveUserByAddress(signerAddress, directory);
  const signerFriendly = signerUser ? `${signerUser.username} (${signerUser.full_name})` : formatAddress(signerAddress);

  const cropOptions = cachedCrops
    .map((c) => {
      const batchCode = c.batch_number || `BATCH-2026-${String(c.crop_id).padStart(5, '0')}`;
      const chainLabel = c.blockchain_crop_id ? `On-chain #${c.blockchain_crop_id}` : 'Off-chain';
      // Format: Mango — BATCH-2026-00134 — 50 kg — On-chain #18
      const labelPrefix = c.crop_name.includes(batchCode) ? c.crop_name : `${c.crop_name} — ${batchCode}`;
      const displayLabel = `${labelPrefix} — ${c.quantity} ${c.unit} — ${chainLabel}`;
      return `<option value="${c.crop_id}" data-search="${c.crop_name.toLowerCase()} ${batchCode.toLowerCase()} #${c.crop_id}" ${String(c.crop_id) === String(preselectedCropId) ? 'selected' : ''}>${displayLabel}</option>`;
    })
    .join('');

  const retailerOptions = retailers
    .map(
      (r) =>
        `<option value="${r.wallet_address}" data-username="${r.username}" data-name="${r.full_name || r.username}">
          ${r.username} — ${r.full_name || 'Retailer Store'} (${formatAddress(r.wallet_address)})
        </option>`
    )
    .join('');

  container.innerHTML = `
    <div class="card" style="max-width: 720px; margin: 0 auto;">
      <div class="card-header">
        <div>
          <h3>Transfer Custody to Retailer</h3>
          <p>Transfer on-chain and physical custody to authorized downstream retail partner.</p>
        </div>
      </div>

      <!-- Custody Flow Visualizer -->
      <div class="custody-flow-bar">
        <div class="custody-step completed">
          <div class="custody-step-badge">✓</div>
          <span class="custody-step-name">Farmer</span>
        </div>
        <div class="custody-arrow">&rarr;</div>
        <div class="custody-step active">
          <div class="custody-step-badge">2</div>
          <span class="custody-step-name">Wasi Mumbai (Current)</span>
        </div>
        <div class="custody-arrow">&rarr;</div>
        <div class="custody-step">
          <div class="custody-step-badge">3</div>
          <span class="custody-step-name">Retailer</span>
        </div>
      </div>

      <!-- Authenticated Signer Banner -->
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 12px;">
        <div style="color: var(--text-muted); margin-bottom: 2px;">Authenticated Transfer Signer (Supplier):</div>
        <div style="font-weight: 600; color: #ffffff;">${signerFriendly}</div>
        <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);">${signerAddress}</div>
      </div>

      <form id="supplier-transfer-form">
        <!-- Step 1: Select Crop -->
        <div class="form-group">
          <label class="form-label" for="transfer-crop-id">1. Select Consignment <span style="color:var(--danger)">*</span></label>
          <input type="text" id="transfer-crop-quicksearch" class="form-control" placeholder="Quick filter consignment options (type name, batch, ID)..." style="margin-bottom: 8px; height: 36px; font-size: 13px;" />
          <select id="transfer-crop-id" class="form-control" required>
            <option value="">-- Choose Crop Consignment --</option>
            ${cropOptions}
          </select>
        </div>

        <!-- Step 2: Destination Role -->
        <div class="form-group">
          <label class="form-label" for="transfer-to-role">2. Destination Role <span style="color:var(--danger)">*</span></label>
          <select id="transfer-to-role" class="form-control" required>
            <option value="Retailer" selected>Retailer (Supermarket / Organic Mart Outlet)</option>
            <option value="Distributor">Secondary Regional Distributor</option>
            <option value="Processor">Food Processing Facility</option>
          </select>
        </div>

        <!-- Step 3: Destination Partner Dropdown -->
        <div class="form-group">
          <label class="form-label" for="transfer-to-address-select">
            3. Destination Retail Partner <span style="color:var(--danger)">*</span>
          </label>
          <select id="transfer-to-address-select" class="form-control" required>
            ${retailerOptions}
          </select>
          <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 4px;">
            Select from registered and verified retailers.
          </span>
        </div>

        <!-- Pre-Transfer Summary Box -->
        <div id="transfer-summary-box" style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin: 20px 0;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-dim); margin-bottom: 10px;">
            Custody & Financial Transfer Summary
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; margin-bottom: 12px;">
            <div>Crop: <strong id="sum-crop-name">—</strong></div>
            <div>Quantity: <strong id="sum-crop-qty">—</strong></div>
            <div>From: <strong style="color: var(--primary);">${signerUser?.username || 'supplier1'}</strong></div>
            <div>To: <strong id="sum-crop-to" style="color: #60a5fa;">retailer1</strong></div>
          </div>
          
          <!-- Pricing details -->
          <div style="border-top: 1px solid var(--border-color); padding-top: 10px; font-size: 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="color: var(--text-muted);">Purchase Cost (Farmer Price):</span>
              <strong id="sum-farmer-cost">₹0.00 / kg</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="color: var(--text-muted);">Supplier Gross Margin:</span>
              <strong id="sum-supplier-margin">+ ₹15.00 / kg</strong>
            </div>
            <div style="border-top: 1px solid var(--border-color); padding-top: 4px; display: flex; justify-content: space-between; color: #34d399; font-weight: 700;">
              <span>Invoice Sale Price to Retailer:</span>
              <span id="sum-retailer-cost">₹0.00 / kg</span>
            </div>
          </div>
        </div>

        <!-- Notification Banner -->
        <div id="transfer-status-msg" style="display: none; padding: 12px 16px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; line-height: 1.5;"></div>

        <!-- Submit Button -->
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button type="submit" id="btn-submit-transfer" class="btn btn-primary" style="padding: 10px 24px;">
            ${icons.truck} <span>Confirm Custody Transfer</span>
          </button>
        </div>
      </form>

      <div id="transfer-result-card" style="display: none; margin-top: 24px;"></div>
    </div>
  `;

  const form = container.querySelector('#supplier-transfer-form');
  const cropSelect = container.querySelector('#transfer-crop-id');
  const roleSelect = container.querySelector('#transfer-to-role');
  const addressSelect = container.querySelector('#transfer-to-address-select');
  const statusMsg = container.querySelector('#transfer-status-msg');
  const submitBtn = container.querySelector('#btn-submit-transfer');
  const resultCard = container.querySelector('#transfer-result-card');

  const sumCropName = container.querySelector('#sum-crop-name');
  const sumCropQty = container.querySelector('#sum-crop-qty');
  const sumCropTo = container.querySelector('#sum-crop-to');
  const sumFarmerCost = container.querySelector('#sum-farmer-cost');
  const sumSupplierMargin = container.querySelector('#sum-supplier-margin');
  const sumRetailerCost = container.querySelector('#sum-retailer-cost');

  async function updateSummary() {
    const selected = cachedCrops.find((c) => String(c.crop_id) === String(cropSelect.value));
    const selectedRetailer = retailers.find((r) => r.wallet_address.toLowerCase() === (addressSelect.value || '').toLowerCase()) || retailers[0];

    if (selected) {
      sumCropName.innerText = selected.crop_name;
      sumCropQty.innerText = `${selected.quantity} ${selected.unit}`;
      const farmerPrice = selected.farmer_price_per_kg != null ? Number(selected.farmer_price_per_kg) : 63.49;
      const supplierMargin = selected.supplier_margin_per_kg != null ? Number(selected.supplier_margin_per_kg) : 15.00;
      const retailerCost = farmerPrice + supplierMargin;
      sumFarmerCost.innerText = `₹${farmerPrice.toFixed(2)} / kg`;
      sumSupplierMargin.innerText = `+ ₹${supplierMargin.toFixed(2)} / kg`;
      sumRetailerCost.innerText = `₹${retailerCost.toFixed(2)} / kg`;
    } else {
      sumCropName.innerText = '—';
      sumCropQty.innerText = '—';
      sumFarmerCost.innerText = '—';
      sumSupplierMargin.innerText = '+ ₹15.00 / kg';
      sumRetailerCost.innerText = '—';
    }

    if (selectedRetailer) {
      sumCropTo.innerText = `${selectedRetailer.username} (${selectedRetailer.full_name || 'Retailer'})`;
    }

    if (!selected) {
      statusMsg.style.display = 'none';
      submitBtn.disabled = false;
      submitBtn.innerText = 'Confirm Custody Transfer';
      return;
    }

    if (selected.blockchain_crop_id) {
      try {
        const holder = await getCurrentHolderFromChain(selected.blockchain_crop_id);
        const holderLower = holder.toLowerCase();
        const signerLower = signerAddress.toLowerCase();

        if (holderLower !== signerLower) {
          const holderLabel = getFriendlyAccountLabel(holder, directory);
          const isRetailer = (holderLabel && holderLabel.toLowerCase().includes('retailer')) || holderLower === '0x22d491bde2303f2f43325b2108d26f1eaba1e32b';

          statusMsg.style.display = 'block';
          statusMsg.style.background = 'rgba(245, 158, 11, 0.15)';
          statusMsg.style.border = '1px solid #f59e0b';
          statusMsg.style.color = '#fbbf24';

          if (isRetailer) {
            statusMsg.innerHTML = `
              <div style="font-weight: 700; margin-bottom: 4px;">ℹ️ Consignment Already Transferred to Retailer</div>
              <div>The current on-chain holder is: <strong>${holderLabel}</strong> (<code>${formatAddress(holder)}</code>).</div>
              <div style="margin-top: 6px; font-size: 12px; color: #fde68a;">
                This consignment has already completed wholesale handover and is held in downstream retailer inventory.
              </div>
            `;
            submitBtn.disabled = true;
            submitBtn.innerText = 'Already In Retail Custody';
          } else {
            statusMsg.innerHTML = `
              <div style="font-weight: 700; margin-bottom: 4px;">⚠️ Custody Handover Required</div>
              <div>The on-chain holder is: <strong>${holderLabel}</strong> (<code>${formatAddress(holder)}</code>).</div>
              <div>Your supplier wallet is: <strong>${signerFriendly}</strong> (<code>${formatAddress(signerAddress)}</code>).</div>
              <div style="margin-top: 6px; font-size: 12px; color: #fde68a;">
                The Farmer must dispatch this crop to your supplier wallet before you can transfer custody to a Retailer.
              </div>
            `;
            submitBtn.disabled = true;
            submitBtn.innerText = 'Awaiting Farmer Dispatch';
          }
          return;
        } else {
          statusMsg.style.display = 'block';
          statusMsg.style.background = 'rgba(16, 185, 129, 0.15)';
          statusMsg.style.border = '1px solid #10b981';
          statusMsg.style.color = '#34d399';
          statusMsg.innerHTML = `
            <strong>✓ Verified On-Chain Custody:</strong> Your supplier wallet (${signerFriendly}) holds this consignment on-chain (Crop #${selected.blockchain_crop_id}). Ready to transfer to Retailer.
          `;
          submitBtn.disabled = false;
          submitBtn.innerText = 'Confirm Custody Transfer';
        }
      } catch (err) {
        statusMsg.style.display = 'block';
        statusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
        statusMsg.style.border = '1px solid #ef4444';
        statusMsg.style.color = '#f87171';
        statusMsg.innerHTML = `
          <strong>Smart Contract Verification Notice:</strong> ${err.message || 'Crop record not found on active smart contract.'}
        `;
        submitBtn.disabled = true;
        submitBtn.innerText = 'Contract Sync Required';
      }
    } else {
      statusMsg.style.display = 'block';
      statusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
      statusMsg.style.border = '1px solid #ef4444';
      statusMsg.style.color = '#fca5a5';
      statusMsg.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 4px;">⚠️ Off-Chain Record</div>
        <div>Batch <strong>${selected.batch_number || selected.crop_id}</strong> is not registered on the smart contract.</div>
        <div style="margin-top: 4px; font-size: 12px;">Only blockchain-verified batches can be transferred through on-chain custody.</div>
      `;
      submitBtn.disabled = true;
      submitBtn.innerText = 'Off-Chain Consignment';
    }
  }

  const cropQuickSearch = container.querySelector('#transfer-crop-quicksearch');
  if (cropQuickSearch) {
    cropQuickSearch.addEventListener('input', () => {
      const q = cropQuickSearch.value.trim().toLowerCase();
      const options = cropSelect.querySelectorAll('option');
      options.forEach((opt, idx) => {
        if (idx === 0) return; // Keep placeholder
        const searchData = opt.getAttribute('data-search') || opt.text.toLowerCase();
        opt.style.display = searchData.includes(q) ? '' : 'none';
      });
    });
  }

  cropSelect.addEventListener('change', updateSummary);
  roleSelect.addEventListener('change', updateSummary);
  addressSelect.addEventListener('change', updateSummary);

  updateSummary();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerText = 'Processing Transfer...';
    statusMsg.style.display = 'none';
    resultCard.style.display = 'none';

    const selectedCrop = cachedCrops.find((c) => String(c.crop_id) === String(cropSelect.value));
    if (!selectedCrop) {
      statusMsg.style.display = 'block';
      statusMsg.style.background = 'var(--danger-subtle)';
      statusMsg.style.color = '#fca5a5';
      statusMsg.innerText = 'Please select a valid crop.';
      submitBtn.disabled = false;
      submitBtn.innerText = 'Confirm Custody Transfer';
      return;
    }

    const toRole = roleSelect.value;
    const toAddress = addressSelect.value.trim();
    const destinationRetailer = retailers.find((r) => r.wallet_address.toLowerCase() === toAddress.toLowerCase());
    const destLabel = destinationRetailer ? `${destinationRetailer.username} (${destinationRetailer.full_name})` : formatAddress(toAddress);

    const batchCode = selectedCrop.batch_number || `BATCH-2026-${String(selectedCrop.crop_id).padStart(5, '0')}`;
    const farmerPrice = selectedCrop.farmer_price_per_kg != null ? Number(selectedCrop.farmer_price_per_kg) : 63.49;
    const supplierMargin = selectedCrop.supplier_margin_per_kg != null ? Number(selectedCrop.supplier_margin_per_kg) : 15.00;
    const invoicePrice = farmerPrice + supplierMargin;

    const confirmed = await showConfirmDialog({
      title: 'Confirm Custody Transfer',
      message: `Transfer supply chain custody of Crop #${selectedCrop.crop_id} (${selectedCrop.crop_name}) to ${destLabel}?`,
      details: [
        { label: 'Batch Identifier', value: batchCode },
        { label: 'Harvest Quantity', value: `${selectedCrop.quantity} ${selectedCrop.unit}` },
        { label: 'Supplier Sale Price', value: `₹${invoicePrice.toFixed(2)} / kg` },
        { label: 'Destination Retailer', value: destLabel }
      ],
      confirmText: 'Confirm Transfer',
      cancelText: 'Cancel',
      confirmVariant: 'primary',
      icon: 'truck'
    });

    if (!confirmed) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Confirm Custody Transfer';
      return;
    }

    let txHash = '0x' + '0'.repeat(64);
    let blockNumber = 1;

    try {
      if (!selectedCrop.blockchain_crop_id) {
        throw new Error('Consignment does not have a mapped smart-contract ID.');
      }

      submitBtn.innerText = 'Broadcasting to Blockchain...';
      const chainRes = await transferCropOnChain(
        selectedCrop.blockchain_crop_id,
        toAddress,
        toRole,
        signerAddress
      );
      txHash = chainRes.txHash;
      blockNumber = chainRes.blockNumber;

      // Post-flight verification: verify current holder equals destination retailer
      const confirmedHolder = await getCurrentHolderFromChain(selectedCrop.blockchain_crop_id);
      if (confirmedHolder.toLowerCase() !== toAddress.toLowerCase()) {
        throw new Error(
          `On-chain transfer verification failed: Current holder is ${confirmedHolder}, expected ${toAddress}`
        );
      }

      submitBtn.innerText = 'Recording Transaction Audit...';
      const nowIso = new Date().toISOString();
      await saveTransactionApi(
        {
          crop_id: selectedCrop.crop_id,
          event_type: 'TRANSFER',
          from_address: signerAddress,
          to_address: toAddress,
          to_role: toRole,
          transaction_hash: txHash,
          block_number: Number(blockNumber),
          timestamp: nowIso,
        },
        token
      );

      // Refresh cached crops
      cachedCrops = await fetchCropsApi();

      submitBtn.disabled = false;
      submitBtn.innerText = 'Confirm Custody Transfer';
      toast.success(`Consignment #${selectedCrop.crop_id} (${selectedCrop.crop_name}) transferred to ${destLabel} successfully!`, 'Custody Transferred');
      form.style.display = 'none';

      resultCard.style.display = 'block';
      resultCard.innerHTML = `
        <div style="background: var(--bg-surface); border: 1px solid var(--primary); border-radius: var(--radius-xl); padding: 28px; text-align: center;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--primary-subtle); border: 2px solid var(--primary); display: flex; align-items: center; justify-content: center; color: var(--primary); font-size: 26px; margin: 0 auto 16px;">
            ✓
          </div>
          <h3 style="color: var(--primary); font-size: 20px; margin-bottom: 6px;">Custody Transferred Successfully!</h3>
          <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">
            Ownership of <strong>${selectedCrop.crop_name}</strong> transferred to <strong>${destLabel}</strong>.
          </p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: var(--bg-card); padding: 16px; border-radius: var(--radius-md); text-align: left; margin-bottom: 20px; font-size: 13px;">
            <div>Crop: <strong>${selectedCrop.crop_name}</strong></div>
            <div>Quantity: <strong>${selectedCrop.quantity} ${selectedCrop.unit}</strong></div>
            <div>Recipient: <strong>${destLabel}</strong></div>
            <div>Status: <span class="badge badge-success">✓ Transferred</span></div>
          </div>

          <details style="text-align: left; margin-bottom: 20px; background: var(--bg-card); padding: 12px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-color); font-size: 13px;">
            <summary style="cursor: pointer; color: var(--text-muted); font-weight: 600;">Technical Details</summary>
            <div style="margin-top: 10px; font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); word-break: break-all;">
              <div>Tx Hash: <span style="color: var(--text-main);">${txHash}</span></div>
              <div style="margin-top: 4px;">Block Number: <span style="color: var(--text-main);">${blockNumber}</span></div>
              <div style="margin-top: 4px;">Sender: <span style="color: var(--text-main);">${signerAddress}</span></div>
            </div>
          </details>

          <div style="display: flex; gap: 12px; justify-content: center;">
            <button id="supplier-btn-transfer-another" class="btn btn-primary">Transfer Another</button>
            <button id="supplier-btn-view-all" class="btn btn-secondary">View Consignments</button>
          </div>
        </div>
      `;

      resultCard.querySelector('#supplier-btn-transfer-another').addEventListener('click', () => {
        form.reset();
        form.style.display = 'block';
        resultCard.style.display = 'none';
        updateSummary();
      });

      resultCard.querySelector('#supplier-btn-view-all').addEventListener('click', () => {
        activeSubTab = 'crops';
        renderSupplierView(parentContainer);
      });
    } catch (err) {
      statusMsg.style.display = 'block';
      statusMsg.style.background = 'var(--danger-subtle)';
      statusMsg.style.color = '#fca5a5';
      statusMsg.innerText = err.message || 'Transfer failed.';
      toast.error(err.message || 'Transfer failed.', 'Transfer Failed');
      submitBtn.disabled = false;
      submitBtn.innerText = 'Confirm Custody Transfer';
    }
  });
}

function renderTraceabilityView(container) {
  const initialId = preselectedCropId || (cachedCrops[0] ? cachedCrops[0].crop_id : '');

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <div class="card-header">
        <div>
          <h3>Crop Traceability & Provenance Audit</h3>
          <p>Inspect the full chain of custody from farm origin through supply nodes</p>
        </div>
      </div>
      <div style="display: flex; gap: 10px; max-width: 500px;">
        <input type="text" id="supplier-trace-input" class="form-control" placeholder="Enter Batch Code or Crop ID (e.g. BATCH-2026-00134 or 134)" value="${initialId}" />
        <button id="supplier-btn-do-trace" class="btn btn-primary" style="white-space: nowrap;">
          ${icons.search} <span>Search & Trace</span>
        </button>
      </div>
    </div>
    <div id="supplier-trace-result"></div>
  `;

  const traceInput = container.querySelector('#supplier-trace-input');
  const traceBtn = container.querySelector('#supplier-btn-do-trace');
  const resultDiv = container.querySelector('#supplier-trace-result');

  async function runTrace() {
    const val = traceInput.value.trim();
    if (!val) {
      resultDiv.innerHTML = '<p style="color: var(--warning);">Please enter a valid Crop ID.</p>';
      return;
    }

    resultDiv.innerHTML = '<div style="padding: 32px; text-align: center; color: var(--text-muted);">Auditing provenance records...</div>';
    try {
      const res = await resolveCropProvenance(val);
      resultDiv.innerHTML = renderTraceabilityHTML(res);
    } catch (err) {
      resultDiv.innerHTML = `<div class="card" style="color: var(--danger);">Error loading traceability: ${err.message}</div>`;
    }
  }

  traceBtn.addEventListener('click', runTrace);
  if (initialId) {
    runTrace();
  }
}
