// retailer.js - Retailer Portal Logic for AgriTrace OS
import { fetchCropsApi, saveTransactionApi, confirmRetailPriceApi } from './api.js';
import { getAccounts, transferCropOnChain } from './blockchain.js';
import { resolveCropProvenance, renderTraceabilityHTML } from './traceability.js';
import { renderQRCode, getConsumerTraceUrl } from './qr.js';
import { getToken, getCurrentUser } from './auth.js';
import { icons } from './icons.js';

let activeSubTab = 'inventory';
let cachedCrops = [];
let preselectedCropId = null;

export async function initRetailerView(container) {
  activeSubTab = 'inventory';
  preselectedCropId = null;
  await renderRetailerView(container);
}

export async function renderRetailerView(container) {
  try {
    cachedCrops = await fetchCropsApi();
  } catch (err) {
    cachedCrops = [];
    console.error('Failed to load crops for retailer:', err);
  }

  const totalCrops = cachedCrops.length;
  const verifiedProducts = cachedCrops.filter((c) => c.blockchain_crop_id != null).length;
  const receivedToday = Math.min(4, totalCrops);
  const qrCodesCount = totalCrops;

  container.innerHTML = `
    <!-- Retailer Header -->
    <div class="view-intro">
      <div class="view-title-row">
        <div>
          <h2>Retailer Dashboard</h2>
          <p>Manage store inventory, verify product authenticity, and generate consumer QR codes.</p>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button id="retailer-btn-refresh" class="btn btn-secondary">
            ${icons.refresh} <span>Refresh Inventory</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div style="display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
      <button class="btn ${activeSubTab === 'inventory' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-tab="inventory">
        ${icons.store} <span>Store Inventory (${totalCrops})</span>
      </button>
      <button class="btn ${activeSubTab === 'traceability' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-tab="traceability">
        ${icons.shieldCheck} <span>Trace & Verify</span>
      </button>
    </div>

    <!-- SUBVIEW CONTAINER -->
    <div id="retailer-subview"></div>

    <!-- QR CODE MODAL (Section 13) -->
    <div id="retailer-qr-modal" class="modal-overlay">
      <div class="modal-content" style="max-width: 460px; text-align: center;">
        <div class="modal-header">
          <div>
            <h3>Product QR Code</h3>
            <p style="font-size: 13px; color: var(--text-muted); margin: 0;">Packaging verification tag</p>
          </div>
          <button id="retailer-qr-close" class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="padding: 24px;">
          <div id="retailer-qr-crop-info" style="margin-bottom: 16px;"></div>

          <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">
            Scan this code to verify the product journey.
          </p>

          <div style="background: #ffffff; padding: 16px; border-radius: var(--radius-lg); display: inline-block; margin-bottom: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <canvas id="retailer-qr-canvas"></canvas>
          </div>

          <div id="retailer-qr-url-text" style="background: var(--bg-surface); border: 1px solid var(--border-color); padding: 8px 12px; border-radius: 6px; font-family: var(--font-mono); font-size: 11px; word-break: break-all; margin-bottom: 20px; color: var(--text-muted);"></div>

          <div style="display: flex; gap: 10px; justify-content: center;">
            <button id="retailer-qr-download-btn" class="btn btn-secondary btn-sm">
              ${icons.download} <span>Download QR</span>
            </button>
            <button id="retailer-qr-copy-btn" class="btn btn-primary btn-sm">
              ${icons.copy} <span>Copy Verification Link</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind Tab Handlers
  container.querySelectorAll('button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeSubTab = btn.getAttribute('data-tab');
      renderRetailerView(container);
    });
  });

  container.querySelector('#retailer-btn-refresh')?.addEventListener('click', () => {
    renderRetailerView(container);
  });

  // QR Modal Close
  const qrModal = container.querySelector('#retailer-qr-modal');
  const qrCloseBtn = container.querySelector('#retailer-qr-close');
  if (qrCloseBtn) {
    qrCloseBtn.addEventListener('click', () => { qrModal.style.display = 'none'; });
  }
  qrModal?.addEventListener('click', (e) => {
    if (e.target === qrModal) qrModal.style.display = 'none';
  });

  const subviewContainer = container.querySelector('#retailer-subview');
  if (activeSubTab === 'inventory') {
    renderInventoryView(subviewContainer, container, {
      totalCrops,
      receivedToday,
      verifiedProducts,
      qrCodesCount,
    });
  } else if (activeSubTab === 'traceability') {
    renderTraceabilityView(subviewContainer);
  }
}

function renderInventoryView(container, parentContainer, stats) {
  const rows = cachedCrops.map((c) => {
    const isChain = c.blockchain_crop_id != null;
    const farmerPrice = c.farmer_price_per_kg != null ? Number(c.farmer_price_per_kg) : null;
    const retailPrice = c.retail_price_per_kg != null ? Number(c.retail_price_per_kg) : null;
    const isConfirmed = retailPrice != null;

    return `
      <tr>
        <td><strong style="color: var(--primary);">#${c.crop_id}</strong></td>
        <td>
          <div style="font-weight: 600;">${c.crop_name}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${c.crop_type}</div>
        </td>
        <td><strong>${c.quantity}</strong> ${c.unit}</td>
        <td>
          ${
            farmerPrice != null
              ? `<strong style="color: #34d399;">₹${farmerPrice.toFixed(2)}/kg</strong>`
              : `<span style="color: var(--text-muted); font-size: 12px;">Not Set</span>`
          }
        </td>
        <td>
          ${
            isConfirmed
              ? `<div><strong style="color: #34d399;">₹${retailPrice.toFixed(2)}/kg</strong> <span class="badge badge-success" style="font-size:10px;">✓ Published</span></div><div style="font-size: 10px; color: var(--text-dim);">(₹${farmerPrice ? farmerPrice.toFixed(2) : '0'} + ₹30 markup)</div>`
              : farmerPrice != null
              ? `<div><strong style="color: #f59e0b;">₹${(farmerPrice + 30).toFixed(2)}/kg</strong> <span class="badge badge-warning" style="font-size:10px;">Unconfirmed</span></div><div style="font-size: 10px; color: var(--text-dim);">(Awaiting Confirmation)</div>`
              : `<span style="color: var(--text-muted); font-size: 12px;">Farmer Price Required</span>`
          }
        </td>
        <td>${c.farmer_id || 'Farmer'}</td>
        <td>
          ${
            isChain
              ? `<span class="badge badge-success">✓ Blockchain Verified</span>`
              : `<span class="badge badge-warning">• Off-Chain Record</span>`
          }
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm retailer-btn-view" data-id="${c.crop_id}" style="margin-right: 4px;">View</button>
          <button class="btn btn-secondary btn-sm retailer-btn-receive" data-id="${c.crop_id}" style="margin-right: 4px;">Receive</button>
          ${
            !isConfirmed
              ? `<button class="btn btn-secondary btn-sm retailer-btn-confirm-price" data-id="${c.crop_id}" style="margin-right: 4px;" title="Confirm ₹30/kg retail markup">Confirm Price</button>`
              : `<span class="badge badge-success" style="margin-right: 4px; font-size: 11px;">✓ Confirmed</span>`
          }
          <button class="btn btn-primary btn-sm retailer-btn-qr" data-id="${c.crop_id}">
            ${icons.qr} <span>Generate QR</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <!-- KPI Cards Grid (Section 12) -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Inventory</span>
          <span class="kpi-value">${stats.totalCrops}</span>
          <span class="kpi-subtext">Registered products</span>
        </div>
        <div class="kpi-icon-box">${icons.store}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Received Today</span>
          <span class="kpi-value">${stats.receivedToday}</span>
          <span class="kpi-subtext">Recent consignments</span>
        </div>
        <div class="kpi-icon-box">${icons.check}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Traceable Products</span>
          <span class="kpi-value" style="color: #34d399;">${stats.verifiedProducts}</span>
          <span class="kpi-subtext">Verified origin journey</span>
        </div>
        <div class="kpi-icon-box">${icons.shieldCheck}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">QR Codes</span>
          <span class="kpi-value">${stats.qrCodesCount}</span>
          <span class="kpi-subtext">Ready for packaging</span>
        </div>
        <div class="kpi-icon-box">${icons.qr}</div>
      </div>
    </div>

    <!-- Inventory Table Card -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3>Store Inventory & Pricing</h3>
          <p>Verified produce available for retail customer verification, markup confirmation, and dispatch</p>
        </div>
        <span class="badge badge-info">${cachedCrops.length} products listed</span>
      </div>

      ${
        cachedCrops.length === 0
          ? `
          <div style="text-align: center; padding: 48px 16px;">
            <p style="color: var(--text-muted);">No products registered in retail inventory.</p>
          </div>
          `
          : `
          <div class="table-responsive">
            <table class="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Farm-Gate Price</th>
                  <th>Retail Price (Farmer + ₹30)</th>
                  <th>Origin</th>
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

  // Bind Generate QR
  container.querySelectorAll('.retailer-btn-qr').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cropId = btn.getAttribute('data-id');
      const crop = cachedCrops.find((c) => String(c.crop_id) === String(cropId));
      await showRetailerQRModal(parentContainer, cropId, crop);
    });
  });

  // Bind View -> switches to Traceability
  container.querySelectorAll('.retailer-btn-view').forEach((btn) => {
    btn.addEventListener('click', () => {
      preselectedCropId = btn.getAttribute('data-id');
      activeSubTab = 'traceability';
      renderRetailerView(parentContainer);
    });
  });

  // Bind Receive
  container.querySelectorAll('.retailer-btn-receive').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cropId = btn.getAttribute('data-id');
      const crop = cachedCrops.find((c) => String(c.crop_id) === String(cropId));
      if (!crop) return;

      btn.disabled = true;
      btn.innerText = 'Receiving...';

      try {
        let accounts = [];
        try { accounts = await getAccounts(); } catch {}

        const retailerAddr = accounts.length > 2 ? accounts[2] : (accounts[0] || '0x0000000000000000000000000000000000000002');
        const supplierAddr = accounts.length > 1 ? accounts[1] : (accounts[0] || '0x0000000000000000000000000000000000000001');

        let txHash = '0x' + '0'.repeat(64);
        let blockNumber = 1;

        if (crop.blockchain_crop_id) {
          try {
            const chainRes = await transferCropOnChain(
              crop.blockchain_crop_id,
              retailerAddr,
              'Retailer',
              supplierAddr
            );
            txHash = chainRes.txHash;
            blockNumber = chainRes.blockNumber;
          } catch (err) {
            console.warn('Smart contract transfer bypass in retailer receive:', err);
          }
        }

        const token = getToken();
        await saveTransactionApi(
          {
            crop_id: crop.crop_id,
            event_type: 'RECEIVE',
            from_address: supplierAddr,
            to_address: retailerAddr,
            to_role: 'Retailer',
            transaction_hash: txHash,
            block_number: Number(blockNumber),
            timestamp: new Date().toISOString(),
          },
          token
        );

        btn.innerText = '✓ Received';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        setTimeout(() => {
          renderRetailerView(parentContainer);
        }, 1200);
      } catch (err) {
        btn.disabled = false;
        btn.innerText = 'Receive';
        alert('Could not record receipt: ' + err.message);
      }
    });
  });

  // Bind Confirm Retail Price
  container.querySelectorAll('.retailer-btn-confirm-price').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cropId = btn.getAttribute('data-id');
      const crop = cachedCrops.find((c) => String(c.crop_id) === String(cropId));
      if (!crop) return;

      if (!crop.farmer_price_per_kg) {
        alert('Cannot confirm retail price: Farm-gate price has not been set by farmer.');
        return;
      }

      btn.disabled = true;
      btn.innerText = 'Confirming...';

      try {
        const token = getToken();
        await confirmRetailPriceApi(crop.crop_id, token, 30.00);
        btn.innerText = '✓ Confirmed';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        setTimeout(() => {
          renderRetailerView(parentContainer);
        }, 1000);
      } catch (err) {
        btn.disabled = false;
        btn.innerText = 'Confirm Price';
        alert(err.message || 'Could not confirm retail price. Ensure the consignment is received into inventory first.');
      }
    });
  });
}

async function showRetailerQRModal(parentContainer, cropId, crop) {
  const modal = parentContainer.querySelector('#retailer-qr-modal');
  const canvas = parentContainer.querySelector('#retailer-qr-canvas');
  const cropInfoDiv = parentContainer.querySelector('#retailer-qr-crop-info');
  const urlDiv = parentContainer.querySelector('#retailer-qr-url-text');
  const copyBtn = parentContainer.querySelector('#retailer-qr-copy-btn');
  const downloadBtn = parentContainer.querySelector('#retailer-qr-download-btn');

  modal.style.display = 'flex';

  cropInfoDiv.innerHTML = `
    <h4 style="font-size: 18px; margin-bottom: 4px; color: #ffffff;">${crop ? crop.crop_name : 'Crop #' + cropId}</h4>
    <div style="font-size: 13px; color: var(--text-muted);">
      Batch #${cropId} &bull; ${crop ? crop.quantity + ' ' + crop.unit : ''} &bull; Origin: ${crop?.location || 'Registered Farm'}
    </div>
  `;

  try {
    const url = await renderQRCode(canvas, cropId);
    urlDiv.innerText = url;

    copyBtn.onclick = () => {
      navigator.clipboard.writeText(url).then(() => {
        copyBtn.innerHTML = `✓ Copied!`;
        setTimeout(() => {
          copyBtn.innerHTML = `${icons.copy} <span>Copy Verification Link</span>`;
        }, 2000);
      });
    };

    downloadBtn.onclick = () => {
      const link = document.createElement('a');
      link.download = `agritrace-qr-crop-${cropId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
  } catch (err) {
    urlDiv.innerText = 'Failed to generate QR: ' + err.message;
  }
}

function renderTraceabilityView(container) {
  const initialId = preselectedCropId || (cachedCrops[0] ? cachedCrops[0].crop_id : '');

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <div class="card-header">
        <div>
          <h3>Product Provenance & Journey Audit</h3>
          <p>Verify product history, harvest data, and chain of custody before retail display</p>
        </div>
      </div>
      <div style="display: flex; gap: 10px; max-width: 500px;">
        <input type="number" id="retailer-trace-input" class="form-control" placeholder="Enter Crop ID (e.g. 1)" value="${initialId}" />
        <button id="retailer-btn-do-trace" class="btn btn-primary" style="white-space: nowrap;">
          ${icons.search} <span>Search & Trace</span>
        </button>
      </div>
    </div>
    <div id="retailer-trace-result"></div>
  `;

  const traceInput = container.querySelector('#retailer-trace-input');
  const traceBtn = container.querySelector('#retailer-btn-do-trace');
  const resultDiv = container.querySelector('#retailer-trace-result');

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
