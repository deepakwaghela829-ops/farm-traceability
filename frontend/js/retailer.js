// retailer.js - Retailer Portal Logic for AgriTrace OS
import {
  fetchCropsApi,
  confirmRetailPriceApi,
  receiveCropApi,
  markCropUnavailableApi,
  markCropAvailableApi,
} from './api.js';
import { resolveCropProvenance, renderTraceabilityHTML } from './traceability.js';
import { renderQRCode } from './qr.js';
import { getToken } from './auth.js';
import { icons } from './icons.js';
import { toast, showConfirmDialog, showPrerequisiteDialog } from './notifications.js';

let activeSubTab = 'inventory';
let cachedCrops = [];
let preselectedCropId = null;
let showArchived = false;

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
    toast.error(err.message || 'Could not load store inventory.', 'Inventory Error');
  }

  // Filter crops based on showArchived toggle
  const displayedCrops = showArchived
    ? cachedCrops
    : cachedCrops.filter((c) => c.is_available !== false);

  const totalCrops = displayedCrops.length;
  const verifiedProducts = displayedCrops.filter((c) => c.blockchain_crop_id != null).length;
  const receivedCount = displayedCrops.filter((c) => c.retailer_received_at != null).length;
  const unreceivedCount = displayedCrops.filter((c) => c.retailer_received_at == null).length;
  const qrCodesCount = totalCrops;

  container.innerHTML = `
    <!-- Retailer Header -->
    <div class="view-intro">
      <div class="view-title-row">
        <div>
          <h2>Retailer Dashboard</h2>
          <p>Manage store inventory, verify consignment receipts, confirm transparent retail markup, and generate consumer QR packaging tags.</p>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button id="retailer-btn-refresh" class="btn btn-secondary">
            ${icons.refresh} <span>Refresh Inventory</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div style="display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap;">
      <div style="display: flex; gap: 8px;">
        <button class="btn ${activeSubTab === 'inventory' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-tab="inventory">
          ${icons.store} <span>Store Inventory (${totalCrops})</span>
        </button>
        <button class="btn ${activeSubTab === 'traceability' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-tab="traceability">
          ${icons.shieldCheck} <span>Trace & Verify</span>
        </button>
      </div>
      <div style="font-size: 13px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
        <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">
          <input type="checkbox" id="toggle-archived" ${showArchived ? 'checked' : ''} style="cursor: pointer;" />
          <span>Show Archived / Unavailable Produce</span>
        </label>
      </div>
    </div>

    <!-- SUBVIEW CONTAINER -->
    <div id="retailer-subview"></div>

    <!-- QR CODE MODAL -->
    <div id="retailer-qr-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="retailer-qr-title">
      <div class="modal-content" style="max-width: 480px; text-align: center;">
        <div class="modal-header">
          <div>
            <h3 id="retailer-qr-title">Product Packaging QR Tag</h3>
            <p style="font-size: 13px; color: var(--text-muted); margin: 0;">Consumer Farm-to-Shelf Verification</p>
          </div>
          <button id="retailer-qr-close" class="modal-close" aria-label="Close QR Modal">&times;</button>
        </div>
        <div class="modal-body" style="padding: 24px;">
          <div id="retailer-qr-crop-info" style="margin-bottom: 16px;"></div>

          <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">
            Customers scan this QR code with their mobile phone to inspect verifiable harvest provenance, custody transfers, and fair price breakdown.
          </p>

          <div style="background: #ffffff; padding: 16px; border-radius: var(--radius-lg); display: inline-block; margin-bottom: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <canvas id="retailer-qr-canvas"></canvas>
          </div>

          <div id="retailer-qr-url-text" style="background: var(--bg-surface); border: 1px solid var(--border-color); padding: 8px 12px; border-radius: 6px; font-family: var(--font-mono); font-size: 11px; word-break: break-all; margin-bottom: 20px; color: var(--text-muted);"></div>

          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button id="retailer-qr-copy-btn" class="btn btn-secondary btn-sm">
              ${icons.copy} <span>Copy Verification Link</span>
            </button>
            <button id="retailer-qr-download-btn" class="btn btn-primary btn-sm">
              ${icons.download} <span>Download High-Res PNG</span>
            </button>
            <a id="retailer-qr-open-link" href="#" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style="color: var(--primary);">
              <span>Open Live Verification ↗</span>
            </a>
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

  // Bind Archived Toggle
  const toggleArchived = container.querySelector('#toggle-archived');
  if (toggleArchived) {
    toggleArchived.addEventListener('change', (e) => {
      showArchived = e.target.checked;
      renderRetailerView(container);
    });
  }

  // Bind Refresh
  container.querySelector('#retailer-btn-refresh')?.addEventListener('click', () => {
    toast.info('Refreshing store inventory records...', 'Syncing');
    renderRetailerView(container);
  });

  // QR Modal Close Handlers
  const qrModal = container.querySelector('#retailer-qr-modal');
  const qrCloseBtn = container.querySelector('#retailer-qr-close');
  if (qrCloseBtn) {
    qrCloseBtn.addEventListener('click', () => {
      qrModal.style.display = 'none';
    });
  }
  qrModal?.addEventListener('click', (e) => {
    if (e.target === qrModal) qrModal.style.display = 'none';
  });

  const subviewContainer = container.querySelector('#retailer-subview');
  if (activeSubTab === 'inventory') {
    renderInventoryView(subviewContainer, container, {
      totalCrops,
      receivedCount,
      unreceivedCount,
      verifiedProducts,
      qrCodesCount,
      displayedCrops,
    });
  } else if (activeSubTab === 'traceability') {
    renderTraceabilityView(subviewContainer);
  }
}

function renderInventoryView(container, parentContainer, stats) {
  const rows = stats.displayedCrops.map((c) => {
    const isChain = c.blockchain_crop_id != null;
    const batchCode = c.batch_number || `BATCH-2026-${String(c.crop_id).padStart(5, '0')}`;
    const farmerPrice = c.farmer_price_per_kg != null ? Number(c.farmer_price_per_kg) : null;
    const supplierMargin = c.supplier_margin_per_kg != null ? Number(c.supplier_margin_per_kg) : 15.00;
    const supplierPrice = c.supplier_price_per_kg != null ? Number(c.supplier_price_per_kg) : (farmerPrice != null ? farmerPrice + supplierMargin : null);
    const retailerMarkup = c.retailer_markup_per_kg != null ? Number(c.retailer_markup_per_kg) : 30.00;
    const retailPrice = c.retail_price_per_kg != null ? Number(c.retail_price_per_kg) : null;
    const isConfirmed = retailPrice != null;
    const isReceived = c.retailer_received_at != null;
    const isAvailable = c.is_available !== false;

    return `
      <tr class="retailer-crop-row" 
          data-name="${(c.crop_name || '').toLowerCase()}" 
          data-batch="${batchCode.toLowerCase()}" 
          data-dbid="${c.crop_id}" 
          data-chainid="${c.blockchain_crop_id || ''}" 
          data-received="${isReceived ? 'received' : 'unreceived'}" 
          data-price="${isConfirmed ? 'confirmed' : 'pending'}" 
          data-available="${isAvailable ? 'active' : 'archived'}" 
          style="${!isAvailable ? 'opacity: 0.65; background: rgba(0,0,0,0.15);' : ''}">
        <td>
          <div style="font-family: var(--font-mono); font-weight: 700; color: var(--primary); font-size: 13px;">${batchCode}</div>
          <div style="font-size: 11px; color: var(--text-dim);">
            DB #${c.crop_id} ${isChain ? `&bull; Chain #${c.blockchain_crop_id}` : ''}
          </div>
        </td>
        <td>
          <div style="font-weight: 600; display: flex; align-items: center; gap: 6px;">
            <span>${c.crop_name}</span>
            ${!isAvailable ? '<span class="badge badge-danger" style="font-size:10px;">Archived</span>' : ''}
          </div>
          <div style="font-size: 12px; color: var(--text-muted);">${c.crop_type} &bull; ${c.location}</div>
        </td>
        <td><strong>${c.quantity}</strong> ${c.unit}</td>
        <td>
          ${
            supplierPrice != null
              ? `<div><strong style="color: #60a5fa;">₹${supplierPrice.toFixed(2)}/kg</strong></div>
                 <div style="font-size: 10px; color: var(--text-dim);">Farm ₹${farmerPrice.toFixed(2)} + ₹${supplierMargin.toFixed(2)} margin</div>`
              : `<span style="color: var(--text-muted); font-size: 12px;">Price Pending</span>`
          }
        </td>
        <td>
          ${
            isConfirmed
              ? `<div><strong style="color: #34d399;">₹${retailPrice.toFixed(2)}/kg</strong> <span class="badge badge-success" style="font-size:10px;">✓ Published</span></div>
                 <div style="font-size: 10px; color: var(--text-dim);">(Cost ₹${supplierPrice ? supplierPrice.toFixed(2) : '0'} + ₹30 markup)</div>`
              : supplierPrice != null
              ? isReceived
                ? `<div><strong style="color: #f59e0b;">₹${(supplierPrice + retailerMarkup).toFixed(2)}/kg</strong> <span class="badge badge-warning" style="font-size:10px;">Price Pending</span></div>
                   <div style="font-size: 10px; color: var(--text-dim);">(Ready for Price Confirmation)</div>`
                : `<div><span style="color: #f59e0b; font-weight: 600;">₹${(supplierPrice + retailerMarkup).toFixed(2)}/kg</span> <span class="badge badge-warning" style="font-size:10px;">Unreceived</span></div>
                   <div style="font-size: 10px; color: var(--text-dim);">(Requires Consignment Receipt)</div>`
              : `<span style="color: var(--text-muted); font-size: 12px;">Supplier Price Required</span>`
          }
        </td>
        <td>
          ${
            isReceived
              ? `<span class="badge badge-success">✓ Received in Store</span>`
              : `<span class="badge badge-warning">⏳ Awaiting Receipt</span>`
          }
        </td>
        <td>
          ${
            isChain
              ? `<span class="badge badge-success">✓ On-Chain Verified</span>`
              : `<span class="badge badge-warning">• Off-Chain Record</span>`
          }
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm retailer-btn-view" data-id="${c.crop_id}" title="View Journey and Provenance" style="margin-right: 4px;">
            ${icons.search} <span>View</span>
          </button>
          ${
            !isReceived
              ? `<button class="btn btn-primary btn-sm retailer-btn-receive" data-id="${c.crop_id}" style="margin-right: 4px;" title="Confirm Physical Receipt of Consignment">
                   ${icons.check} <span>Receive</span>
                 </button>`
              : `<span class="badge badge-success" style="margin-right: 4px; font-size: 11px;">✓ Received</span>`
          }
          ${
            !isConfirmed
              ? isReceived
                ? `<button class="btn btn-primary btn-sm retailer-btn-confirm-price" data-id="${c.crop_id}" style="margin-right: 4px;" title="Confirm fixed ₹30/kg retail markup">Confirm Price</button>`
                : `<button class="btn btn-secondary btn-sm retailer-btn-confirm-price" data-id="${c.crop_id}" style="margin-right: 4px; opacity: 0.85;" title="Click to view prerequisite: Consignment receipt required">Confirm Price</button>`
              : `<span class="badge badge-success" style="margin-right: 4px; font-size: 11px;">✓ Confirmed</span>`
          }
          <button class="btn btn-secondary btn-sm retailer-btn-qr" data-id="${c.crop_id}" title="Generate Customer Packaging QR Code" style="margin-right: 4px;">
            ${icons.qr} <span>QR</span>
          </button>
          <a href="#/consumer/trace/${c.crop_id}" class="btn btn-ghost btn-sm" title="Open Public Consumer Verification View" style="margin-right: 4px;">
            <span>Consumer</span>
          </a>
          ${
            isAvailable
              ? `<button class="btn btn-ghost btn-sm retailer-btn-remove" data-id="${c.crop_id}" title="Archive from active inventory" style="color: #f87171;" aria-label="Archive crop">
                   ${icons.trash || '✕'}
                 </button>`
              : `<button class="btn btn-ghost btn-sm retailer-btn-restore" data-id="${c.crop_id}" title="Restore to active inventory" style="color: var(--primary);" aria-label="Restore crop">
                   ${icons.refresh || '↺'}
                 </button>`
          }
        </td>
      </tr>
    `;
  }).join('');

  const unreceivedBannerHtml =
    stats.unreceivedCount > 0
      ? `
      <div class="context-banner context-banner-warning">
        <div style="flex-shrink:0;margin-top:2px;">${icons.alertTriangle}</div>
        <div style="flex:1;">
          <strong>Consignment Receipt Workflow:</strong> ${stats.unreceivedCount} incoming produce batch(es) are currently awaiting store receipt. 
          Click <strong>Receive</strong> to record physical delivery. Consignment receipt unlocks the transparent ₹30.00/kg consumer shelf price confirmation.
        </div>
      </div>
    `
      : '';

  container.innerHTML = `
    <!-- KPI Cards Grid -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Active Inventory</span>
          <span class="kpi-value">${stats.totalCrops}</span>
          <span class="kpi-subtext">Store listings</span>
        </div>
        <div class="kpi-icon-box">${icons.store}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Received in Store</span>
          <span class="kpi-value" style="color: #34d399;">${stats.receivedCount}</span>
          <span class="kpi-subtext">${stats.unreceivedCount > 0 ? stats.unreceivedCount + ' awaiting receipt' : 'All batches verified'}</span>
        </div>
        <div class="kpi-icon-box">${icons.check}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">On-Chain Verified</span>
          <span class="kpi-value" style="color: #60a5fa;">${stats.verifiedProducts}</span>
          <span class="kpi-subtext">Cryptographic provenance</span>
        </div>
        <div class="kpi-icon-box">${icons.shieldCheck}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Ready QR Codes</span>
          <span class="kpi-value">${stats.qrCodesCount}</span>
          <span class="kpi-subtext">Packaging scan tags</span>
        </div>
        <div class="kpi-icon-box">${icons.qr}</div>
      </div>
    </div>

    <!-- Inventory Table Card -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3>Store Inventory & Pricing</h3>
          <p>Verified produce available for retail customer verification, markup confirmation, and packaging</p>
        </div>
        <span class="badge badge-info">${stats.displayedCrops.length} products listed</span>
      </div>

      ${unreceivedBannerHtml}

      ${
        stats.displayedCrops.length === 0
          ? `
          <div style="text-align: center; padding: 48px 16px;">
            <p style="color: var(--text-muted);">No products currently in store inventory.</p>
          </div>
          `
          : `
          <!-- Retailer Crop Browsing Toolbar -->
          <div class="table-toolbar">
            <div class="table-toolbar-left">
              <input type="text" id="retailer-crop-search" class="table-search-input" placeholder="Search by crop name, batch, DB #, on-chain #..." aria-label="Search store inventory" />
              <select id="retailer-receipt-filter" class="table-filter-select" aria-label="Filter by receipt status">
                <option value="">All Receipt States</option>
                <option value="unreceived">⏳ Awaiting Receipt</option>
                <option value="received">✓ Received in Store</option>
              </select>
              <select id="retailer-price-filter" class="table-filter-select" aria-label="Filter by price status">
                <option value="">All Price States</option>
                <option value="confirmed">✓ Confirmed & Published</option>
                <option value="pending">Price Pending</option>
              </select>
            </div>
            <div class="table-count-label" id="retailer-crop-count">
              Showing ${stats.displayedCrops.length} of ${stats.displayedCrops.length} crops
            </div>
          </div>

          <div class="table-responsive table-container-scrollable">
            <table class="table">
              <thead>
                <tr>
                  <th>Batch / DB ID</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Supplier Cost</th>
                  <th>Retail Shelf Price</th>
                  <th>Receipt Status</th>
                  <th>Blockchain Status</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody id="retailer-crops-tbody">
                ${rows}
              </tbody>
            </table>
          </div>
          `
      }
    </div>
  `;

  // Bind Live Search in Retailer Inventory
  const retSearch = container.querySelector('#retailer-crop-search');
  const retReceipt = container.querySelector('#retailer-receipt-filter');
  const retPrice = container.querySelector('#retailer-price-filter');
  const retCount = container.querySelector('#retailer-crop-count');
  const retRows = container.querySelectorAll('.retailer-crop-row');

  function filterRetailerRows() {
    const q = (retSearch ? retSearch.value : '').trim().toLowerCase();
    const selReceipt = (retReceipt ? retReceipt.value : '').trim().toLowerCase();
    const selPrice = (retPrice ? retPrice.value : '').trim().toLowerCase();

    let count = 0;
    retRows.forEach((tr) => {
      const name = tr.getAttribute('data-name');
      const batch = tr.getAttribute('data-batch');
      const dbId = tr.getAttribute('data-dbid');
      const chainId = tr.getAttribute('data-chainid');
      const received = tr.getAttribute('data-received');
      const price = tr.getAttribute('data-price');

      let matchQ = !q || name.includes(q) || batch.includes(q) || dbId === q || (q.startsWith('#') && dbId === q.slice(1)) || chainId === q;
      let matchReceipt = !selReceipt || received === selReceipt;
      let matchPrice = !selPrice || price === selPrice;

      const show = matchQ && matchReceipt && matchPrice;
      tr.style.display = show ? '' : 'none';
      if (show) count++;
    });

    if (retCount) retCount.innerText = `Showing ${count} of ${stats.displayedCrops.length} crops`;
  }

  if (retSearch) retSearch.addEventListener('input', filterRetailerRows);
  if (retReceipt) retReceipt.addEventListener('change', filterRetailerRows);
  if (retPrice) retPrice.addEventListener('change', filterRetailerRows);

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

  // Reusable helper to execute receipt
  async function executeReceiptForCrop(crop, sourceButton = null) {
    if (sourceButton) {
      sourceButton.disabled = true;
      sourceButton.innerHTML = `<span class="spin" style="display:inline-block;margin-right:4px;">${icons.spinner}</span> Receiving...`;
    }

    try {
      const token = getToken();
      await receiveCropApi(crop.crop_id, token);
      toast.success(
        `Batch #${crop.crop_id} (${crop.crop_name}) received into store inventory! Retail price confirmation is now unlocked.`,
        'Consignment Received'
      );
      renderRetailerView(parentContainer);
    } catch (err) {
      if (sourceButton) {
        sourceButton.disabled = false;
        sourceButton.innerHTML = `${icons.check} <span>Receive</span>`;
      }
      toast.error(err.message || 'Could not record consignment receipt.', 'Receipt Error');
    }
  }

  // Bind Receive
  container.querySelectorAll('.retailer-btn-receive').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cropId = btn.getAttribute('data-id');
      const crop = cachedCrops.find((c) => String(c.crop_id) === String(cropId));
      if (!crop) return;

      const batchCode = crop.batch_number || `BATCH-2026-${String(crop.crop_id).padStart(5, '0')}`;
      const confirmed = await showConfirmDialog({
        title: 'Confirm Consignment Receipt',
        message: `Confirm physical delivery of Crop #${crop.crop_id} (${crop.crop_name}) into retailer store inventory?`,
        details: [
          { label: 'Batch Identifier', value: batchCode },
          { label: 'Harvest Quantity', value: `${crop.quantity} ${crop.unit}` },
          { label: 'Origin Location', value: crop.location || 'Registered Farm' },
          { label: 'Status Impact', value: 'Enables retail markup and shelf pricing' },
        ],
        confirmText: 'Record Store Receipt',
        cancelText: 'Cancel',
        confirmVariant: 'primary',
        icon: 'store',
      });

      if (!confirmed) return;
      await executeReceiptForCrop(crop, btn);
    });
  });

  // Bind Confirm Retail Price with Contextual Prerequisite Handling
  container.querySelectorAll('.retailer-btn-confirm-price').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cropId = btn.getAttribute('data-id');
      const crop = cachedCrops.find((c) => String(c.crop_id) === String(cropId));
      if (!crop) return;

      const batchCode = crop.batch_number || `BATCH-2026-${String(crop.crop_id).padStart(5, '0')}`;
      const isReceived = crop.retailer_received_at != null;

      // 1. Workflow Prerequisite Check: Consignment Receipt
      if (!isReceived) {
        await showPrerequisiteDialog({
          title: 'Consignment Receipt Required',
          message: `Crop #${crop.crop_id} (${crop.crop_name}) has not been received into retailer inventory yet. Under AgriTrace OS rules, physical consignment receipt must be recorded before confirming the ₹30.00/kg retail markup.`,
          details: [
            { label: 'Batch Identifier', value: batchCode },
            { label: 'Current State', value: '⏳ Awaiting Physical Consignment Receipt' },
            { label: 'Required Action', value: 'Receive produce consignment into store' },
          ],
          actionText: 'Receive Consignment Now',
          onAction: async () => {
            await executeReceiptForCrop(crop);
          },
        });
        return;
      }

      // 2. Workflow Prerequisite Check: Farm-Gate Base Price
      if (!crop.farmer_price_per_kg) {
        toast.warning(
          `Cannot confirm retail price: Farm-gate base price has not been set by the farmer for Crop #${crop.crop_id}.`,
          'Base Price Required'
        );
        return;
      }

      // 3. Clear Financial Breakdown Confirmation Dialog
      const farmerPrice = Number(crop.farmer_price_per_kg);
      const supplierMargin = crop.supplier_margin_per_kg != null ? Number(crop.supplier_margin_per_kg) : 15.00;
      const supplierPrice = crop.supplier_price_per_kg != null ? Number(crop.supplier_price_per_kg) : farmerPrice + supplierMargin;
      const finalShelfPrice = supplierPrice + 30.00;

      const confirmed = await showConfirmDialog({
        title: 'Confirm Retail Shelf Price',
        message: `Confirm fixed ₹30.00/kg retail gross margin for Crop #${crop.crop_id} (${crop.crop_name})?`,
        details: [
          { label: 'Batch Identifier', value: batchCode },
          { label: '1. Farm-Gate Base Price', value: `₹${farmerPrice.toFixed(2)} / kg` },
          { label: '2. Supplier Logistics Margin (Wasi Mumbai)', value: `+ ₹${supplierMargin.toFixed(2)} / kg` },
          { label: '3. Retailer Gross Margin', value: `+ ₹30.00 / kg` },
          { label: '4. Final Consumer Shelf Price', value: `= ₹${finalShelfPrice.toFixed(2)} / kg` },
        ],
        confirmText: `Publish ₹${finalShelfPrice.toFixed(2)} / kg`,
        cancelText: 'Cancel',
        confirmVariant: 'primary',
        icon: 'check',
      });

      if (!confirmed) return;

      btn.disabled = true;
      btn.innerHTML = `<span class="spin" style="display:inline-block;margin-right:4px;">${icons.spinner}</span> Confirming...`;

      try {
        const token = getToken();
        await confirmRetailPriceApi(crop.crop_id, token, 30.00);
        toast.success(
          `Retail shelf price for Crop #${crop.crop_id} published at ₹${finalShelfPrice.toFixed(2)}/kg!`,
          'Shelf Price Published'
        );
        renderRetailerView(parentContainer);
      } catch (err) {
        btn.disabled = false;
        btn.innerText = 'Confirm Price';
        toast.error(
          err.message || 'Could not confirm retail price. Ensure the consignment is received into inventory first.',
          'Price Confirmation Failed'
        );
      }
    });
  });

  // Bind Archive / Remove with Branded Dialog (No Native Confirm)
  container.querySelectorAll('.retailer-btn-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cropId = btn.getAttribute('data-id');
      const crop = cachedCrops.find((c) => String(c.crop_id) === String(cropId));
      if (!crop) return;

      const batchCode = crop.batch_number || `BATCH-2026-${String(crop.crop_id).padStart(5, '0')}`;
      const confirmed = await showConfirmDialog({
        title: 'Archive Crop from Active Inventory',
        message: `Remove Crop #${crop.crop_id} (${crop.crop_name}) from active store inventory?`,
        details: [
          { label: 'Batch Identifier', value: batchCode },
          { label: 'Quantity', value: `${crop.quantity} ${crop.unit}` },
          { label: 'Audit Guarantee', value: 'Historical traceability & blockchain records remain 100% intact' },
        ],
        confirmText: 'Archive Crop',
        cancelText: 'Keep Active',
        confirmVariant: 'danger',
        icon: 'trash',
      });

      if (!confirmed) return;

      try {
        const token = getToken();
        await markCropUnavailableApi(crop.crop_id, token);
        toast.info(`Crop #${crop.crop_id} (${crop.crop_name}) marked as archived / unavailable.`, 'Inventory Updated');
        renderRetailerView(parentContainer);
      } catch (err) {
        toast.error(err.message || 'Could not archive crop from active inventory.', 'Archive Failed');
      }
    });
  });

  // Bind Restore from Archive
  container.querySelectorAll('.retailer-btn-restore').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cropId = btn.getAttribute('data-id');
      const crop = cachedCrops.find((c) => String(c.crop_id) === String(cropId));
      if (!crop) return;

      try {
        const token = getToken();
        await markCropAvailableApi(crop.crop_id, token);
        toast.success(`Crop #${crop.crop_id} (${crop.crop_name}) restored to active store inventory!`, 'Crop Restored');
        renderRetailerView(parentContainer);
      } catch (err) {
        toast.error(err.message || 'Could not restore crop to active inventory.', 'Restore Failed');
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
  const openLink = parentContainer.querySelector('#retailer-qr-open-link');

  modal.style.display = 'flex';

  const batchCode = crop?.batch_number || `BATCH-2026-${String(cropId).padStart(5, '0')}`;
  cropInfoDiv.innerHTML = `
    <h4 style="font-size: 18px; margin-bottom: 4px; color: #ffffff;">${crop ? crop.crop_name : 'Crop #' + cropId}</h4>
    <div style="font-size: 13px; color: var(--text-muted); display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;">
      <span class="badge badge-info" style="font-family: var(--font-mono);">${batchCode}</span>
      <span>&bull; ${crop ? crop.quantity + ' ' + crop.unit : ''}</span>
      <span>&bull; Origin: ${crop?.location || 'Registered Farm'}</span>
    </div>
  `;

  try {
    const url = await renderQRCode(canvas, crop || cropId);
    urlDiv.innerText = url;
    if (openLink) {
      openLink.href = url;
    }

    copyBtn.onclick = () => {
      navigator.clipboard.writeText(url).then(() => {
        toast.success('Verification link copied to clipboard!', 'Link Copied');
        copyBtn.innerHTML = `✓ Copied!`;
        setTimeout(() => {
          copyBtn.innerHTML = `${icons.copy} <span>Copy Verification Link</span>`;
        }, 2000);
      });
    };

    downloadBtn.onclick = () => {
      const link = document.createElement('a');
      link.download = `agritrace-qr-${batchCode}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success(`Downloaded packaging QR tag for ${batchCode}!`, 'Tag Exported');
    };
  } catch (err) {
    urlDiv.innerText = 'Failed to generate QR: ' + err.message;
    toast.error('Failed to generate QR code canvas.', 'QR Generation Error');
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
        <input type="text" id="retailer-trace-input" class="form-control" placeholder="Enter Batch Code or Crop ID (e.g. BATCH-2026-00134 or 134)" value="${initialId}" />
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
      toast.warning('Please enter a valid Batch Code or Crop ID.', 'Lookup Warning');
      return;
    }

    resultDiv.innerHTML = '<div style="padding: 32px; text-align: center; color: var(--text-muted);"><span class="spin" style="display:inline-block;margin-right:8px;">' + icons.spinner + '</span> Auditing provenance records...</div>';
    try {
      const res = await resolveCropProvenance(val);
      resultDiv.innerHTML = renderTraceabilityHTML(res);
    } catch (err) {
      resultDiv.innerHTML = `<div class="card" style="color: var(--danger); border: 1px solid var(--danger-border); padding: 18px;">Error loading traceability: ${err.message}</div>`;
      toast.error(err.message || 'Traceability query failed.', 'Traceability Error');
    }
  }

  traceBtn.addEventListener('click', runTrace);
  if (initialId) {
    runTrace();
  }
}
