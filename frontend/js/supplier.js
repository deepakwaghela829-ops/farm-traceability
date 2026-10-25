// supplier.js - Supplier Portal Logic for AgriTrace OS
import { fetchCropsApi, saveTransactionApi } from './api.js';
import { transferCropOnChain, getAccounts } from './blockchain.js';
import { resolveCropProvenance, renderTraceabilityHTML } from './traceability.js';
import { getToken, getCurrentUser } from './auth.js';
import { icons } from './icons.js';

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
          <h2>Supplier Dashboard</h2>
          <p>Manage incoming consignments, verify origin, and transfer supply chain custody.</p>
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
    return `
      <tr>
        <td><strong style="color: var(--primary);">#${c.crop_id}</strong></td>
        <td>
          <div style="font-weight: 600;">${c.crop_name}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${c.crop_type}</div>
        </td>
        <td><strong>${c.quantity}</strong> ${c.unit}</td>
        <td>${c.farmer_id || 'Farmer'}</td>
        <td>${c.location}</td>
        <td>
          ${
            isChain
              ? `<span class="badge badge-success">✓ Blockchain Verified</span>`
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
          <div class="table-responsive">
            <table class="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Crop Name</th>
                  <th>Quantity</th>
                  <th>Farmer</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
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
  let accounts = [];
  try {
    accounts = await getAccounts();
  } catch {
    accounts = [];
  }

  const cropOptions = cachedCrops
    .map(
      (c) =>
        `<option value="${c.crop_id}" ${String(c.crop_id) === String(preselectedCropId) ? 'selected' : ''}>
          #${c.crop_id} - ${c.crop_name} (${c.quantity} ${c.unit}) ${c.blockchain_crop_id ? '[On-Chain #' + c.blockchain_crop_id + ']' : '[Off-Chain]'}
        </option>`
    )
    .join('');

  const accountOptions = accounts
    .map((acc, idx) => `<option value="${acc}">${acc} ${idx === 0 ? '(Farmer)' : idx === 1 ? '(Supplier)' : idx === 2 ? '(Retailer)' : `(Account ${idx})`}</option>`)
    .join('');

  container.innerHTML = `
    <div class="card" style="max-width: 720px; margin: 0 auto;">
      <div class="card-header">
        <div>
          <h3>Transfer Custody</h3>
          <p>Transfer ownership of the product to the next supply-chain partner.</p>
        </div>
      </div>

      <!-- Custody Flow Visualizer (Section 11) -->
      <div class="custody-flow-bar">
        <div class="custody-step completed">
          <div class="custody-step-badge">✓</div>
          <span class="custody-step-name">Farmer</span>
        </div>
        <div class="custody-arrow">&rarr;</div>
        <div class="custody-step active">
          <div class="custody-step-badge">2</div>
          <span class="custody-step-name">Supplier (Current)</span>
        </div>
        <div class="custody-arrow">&rarr;</div>
        <div class="custody-step">
          <div class="custody-step-badge">3</div>
          <span class="custody-step-name">Retailer</span>
        </div>
      </div>

      <form id="supplier-transfer-form">
        <!-- Step 1: Select Crop -->
        <div class="form-group">
          <label class="form-label" for="transfer-crop-id">1. Select Crop <span style="color:var(--danger)">*</span></label>
          <select id="transfer-crop-id" class="form-control" required>
            <option value="">-- Choose Crop to Transfer --</option>
            ${cropOptions}
          </select>
        </div>

        <!-- Step 2: Destination Role -->
        <div class="form-group">
          <label class="form-label" for="transfer-to-role">2. Destination Role <span style="color:var(--danger)">*</span></label>
          <select id="transfer-to-role" class="form-control" required>
            <option value="Retailer">Retailer (Supermarket / Grocery Outlet)</option>
            <option value="Distributor">Secondary Distributor / Wholesaler</option>
            <option value="Processor">Food Processing Facility</option>
            <option value="Consumer">Direct to Consumer</option>
          </select>
        </div>

        <!-- Step 3: Destination Address -->
        <div class="form-group">
          <label class="form-label" for="transfer-to-address">3. Destination Partner Wallet / Identifier <span style="color:var(--danger)">*</span></label>
          ${
            accounts.length > 0
              ? `
            <select id="transfer-to-address-select" class="form-control" style="margin-bottom: 8px;">
              <option value="">-- Quick Select from Ganache Accounts --</option>
              ${accountOptions}
            </select>
            `
              : ''
          }
          <input type="text" id="transfer-to-address" class="form-control" placeholder="0x... (42-character Ethereum address)" required />
        </div>

        <!-- Pre-Transfer Summary Box (Section 11) -->
        <div id="transfer-summary-box" style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin: 20px 0;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-dim); margin-bottom: 8px;">
            Transfer Summary
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
            <div>Crop: <strong id="sum-crop-name">—</strong></div>
            <div>Quantity: <strong id="sum-crop-qty">—</strong></div>
            <div>From: <strong style="color: var(--primary);">Supplier</strong></div>
            <div>To: <strong id="sum-crop-to" style="color: #60a5fa;">Retailer</strong></div>
          </div>
        </div>

        <!-- Notification Banner -->
        <div id="transfer-status-msg" style="display: none; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 16px;"></div>

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
  const toAddressInput = container.querySelector('#transfer-to-address');
  const addressSelect = container.querySelector('#transfer-to-address-select');
  const statusMsg = container.querySelector('#transfer-status-msg');
  const submitBtn = container.querySelector('#btn-submit-transfer');
  const resultCard = container.querySelector('#transfer-result-card');

  const sumCropName = container.querySelector('#sum-crop-name');
  const sumCropQty = container.querySelector('#sum-crop-qty');
  const sumCropTo = container.querySelector('#sum-crop-to');

  function updateSummary() {
    const selected = cachedCrops.find((c) => String(c.crop_id) === String(cropSelect.value));
    if (selected) {
      sumCropName.innerText = selected.crop_name;
      sumCropQty.innerText = `${selected.quantity} ${selected.unit}`;
    } else {
      sumCropName.innerText = '—';
      sumCropQty.innerText = '—';
    }
    sumCropTo.innerText = roleSelect.value || 'Retailer';
  }

  cropSelect.addEventListener('change', updateSummary);
  roleSelect.addEventListener('change', updateSummary);

  if (addressSelect) {
    if (accounts.length > 2) {
      addressSelect.value = accounts[2];
      toAddressInput.value = accounts[2];
    }
    addressSelect.addEventListener('change', () => {
      if (addressSelect.value) {
        toAddressInput.value = addressSelect.value;
      }
    });
  }
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
    const toAddress = toAddressInput.value.trim();

    if (!toAddress.startsWith('0x') || toAddress.length !== 42) {
      statusMsg.style.display = 'block';
      statusMsg.style.background = 'var(--danger-subtle)';
      statusMsg.style.color = '#fca5a5';
      statusMsg.innerText = 'Destination address must be a valid 42-character Ethereum address (0x...).';
      submitBtn.disabled = false;
      submitBtn.innerText = 'Confirm Custody Transfer';
      return;
    }

    const token = getToken();
    const signerAddress = accounts.length > 1 ? accounts[1] : (accounts[0] || '0x0000000000000000000000000000000000000001');

    let txHash = '0x' + '0'.repeat(64);
    let blockNumber = 1;

    try {
      if (selectedCrop.blockchain_crop_id) {
        submitBtn.innerText = 'Broadcasting to Blockchain...';
        const chainRes = await transferCropOnChain(
          selectedCrop.blockchain_crop_id,
          toAddress,
          toRole,
          signerAddress
        );
        txHash = chainRes.txHash;
        blockNumber = chainRes.blockNumber;
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

      submitBtn.disabled = false;
      submitBtn.innerText = 'Confirm Custody Transfer';
      form.style.display = 'none';

      resultCard.style.display = 'block';
      resultCard.innerHTML = `
        <div style="background: var(--bg-surface); border: 1px solid var(--primary); border-radius: var(--radius-xl); padding: 28px; text-align: center;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--primary-subtle); border: 2px solid var(--primary); display: flex; align-items: center; justify-content: center; color: var(--primary); font-size: 26px; margin: 0 auto 16px;">
            ✓
          </div>
          <h3 style="color: var(--primary); font-size: 20px; margin-bottom: 6px;">Custody Transferred Successfully!</h3>
          <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">
            Ownership of <strong>${selectedCrop.crop_name}</strong> has been transferred to <strong>${toRole}</strong>.
          </p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: var(--bg-card); padding: 16px; border-radius: var(--radius-md); text-align: left; margin-bottom: 20px; font-size: 13px;">
            <div>Crop: <strong>${selectedCrop.crop_name}</strong></div>
            <div>Quantity: <strong>${selectedCrop.quantity} ${selectedCrop.unit}</strong></div>
            <div>Recipient Role: <strong>${toRole}</strong></div>
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
        <input type="number" id="supplier-trace-input" class="form-control" placeholder="Enter Crop ID (e.g. 1)" value="${initialId}" />
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
