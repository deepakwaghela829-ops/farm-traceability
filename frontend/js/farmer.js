// farmer.js - Farmer Portal Logic for AgriTrace OS
import {
  fetchCropsApi,
  createCropApi,
  predictCropPriceApi,
  fetchCropBenchmarksApi,
  updateFarmerPriceApi,
  saveTransactionApi,
} from './api.js';
import {
  registerCropOnChain,
  transferCropOnChain,
  getAccounts,
  getCurrentHolderFromChain,
} from './blockchain.js';
import {
  getPartnerDirectory,
  formatAddress,
  getFriendlyAccountLabel,
  resolveUserByAddress,
  resolveAddressByUsername,
  getUserWallet,
} from './accounts.js';
import { resolveCropProvenance, renderTraceabilityHTML } from './traceability.js';
import { getToken, getCurrentUser } from './auth.js';
import { icons } from './icons.js';
import { toast, showConfirmDialog } from './notifications.js';

let activeSubTab = 'dashboard';
let cachedCrops = [];
let preselectedTraceId = null;
let preselectedPricingCrop = null;

export async function initFarmerView(container) {
  activeSubTab = 'dashboard';
  preselectedTraceId = null;
  preselectedPricingCrop = null;
  await renderFarmerView(container);
}

export async function renderFarmerView(container) {
  const user = getCurrentUser();
  const token = getToken();

  // Load farmer crops
  try {
    cachedCrops = await fetchCropsApi(user?.username);
  } catch (err) {
    cachedCrops = [];
    console.error('Failed to load farmer crops:', err);
  }

  const totalCrops = cachedCrops.length;
  const onChainCount = cachedCrops.filter((c) => c.blockchain_crop_id != null).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const harvestReady = cachedCrops.filter((c) => {
    if (!c.expected_harvest_date) return false;
    return new Date(`${c.expected_harvest_date}T00:00:00`) <= today;
  }).length;

  const activeCultivation = totalCrops - harvestReady;

  // Approximate portfolio value
  const estimatedValue = cachedCrops.reduce((sum, c) => sum + (Number(c.quantity) || 100) * 45, 0);

  container.innerHTML = `
    <!-- Farmer Header -->
    <div class="view-intro">
      <div class="view-title-row">
        <div>
          <h2>Farmer Dashboard</h2>
          <p>Register, price, and track your agricultural products from cultivation to market.</p>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button id="farmer-btn-open-register" class="btn btn-primary">
            ${icons.plus} <span>Register Crop</span>
          </button>
          <button id="farmer-btn-refresh" class="btn btn-secondary">
            ${icons.refresh} <span>Refresh</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Sub Navigation Tabs -->
    <div style="display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
      <button class="btn ${activeSubTab === 'dashboard' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-tab="dashboard">
        ${icons.leaf} <span>Overview</span>
      </button>
      <button class="btn ${activeSubTab === 'my-crops' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-tab="my-crops">
        ${icons.store} <span>My Crops (${totalCrops})</span>
      </button>
      <button class="btn ${activeSubTab === 'pricing' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-tab="pricing">
        ${icons.chart} <span>Price Prediction</span>
      </button>
      <button class="btn ${activeSubTab === 'traceability' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-tab="traceability">
        ${icons.shieldCheck} <span>Traceability</span>
      </button>
    </div>

    <!-- SUB-VIEW CONTAINER -->
    <div id="farmer-subview"></div>

    <!-- REGISTER CROP MODAL -->
    <div id="register-crop-modal" class="modal-overlay">
      <div class="modal-content" style="max-width: 720px;">
        <div class="modal-header">
          <div>
            <h3>Register New Crop</h3>
            <p style="font-size: 13px; color: var(--text-muted); margin: 0;">Create a digital identity for your agricultural product.</p>
          </div>
          <button id="modal-close-btn" class="modal-close">&times;</button>
        </div>
        <div id="register-crop-modal-body" class="modal-body"></div>
      </div>
    </div>

    <!-- DISPATCH CROP MODAL -->
    <div id="farmer-dispatch-modal" class="modal-overlay">
      <div class="modal-content" style="max-width: 560px;">
        <div class="modal-header">
          <div>
            <h3>Dispatch to Supplier</h3>
            <p style="font-size: 13px; color: var(--text-muted); margin: 0;">Transfer on-chain and physical custody to logistics partner.</p>
          </div>
          <button id="dispatch-modal-close-btn" class="modal-close">&times;</button>
        </div>
        <div id="farmer-dispatch-modal-body" class="modal-body" style="padding: 24px;"></div>
      </div>
    </div>
  `;

  // Bind Tab Handlers
  container.querySelectorAll('button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeSubTab = btn.getAttribute('data-tab');
      renderFarmerView(container);
    });
  });

  // Bind Refresh
  container.querySelector('#farmer-btn-refresh')?.addEventListener('click', () => {
    renderFarmerView(container);
  });

  // Bind Open Register Modal
  container.querySelector('#farmer-btn-open-register')?.addEventListener('click', () => {
    openRegisterCropModal(container);
  });

  // Dispatch Modal Close
  const dispatchModal = container.querySelector('#farmer-dispatch-modal');
  const dispatchCloseBtn = container.querySelector('#dispatch-modal-close-btn');
  if (dispatchCloseBtn) {
    dispatchCloseBtn.addEventListener('click', () => { dispatchModal.style.display = 'none'; });
  }
  dispatchModal?.addEventListener('click', (e) => {
    if (e.target === dispatchModal) dispatchModal.style.display = 'none';
  });

  const subviewContainer = container.querySelector('#farmer-subview');
  if (activeSubTab === 'dashboard') {
    renderFarmerDashboardView(subviewContainer, container, {
      totalCrops,
      activeCultivation,
      harvestReady,
      estimatedValue,
      onChainCount,
    });
  } else if (activeSubTab === 'my-crops') {
    renderMyCropsView(subviewContainer, container);
  } else if (activeSubTab === 'pricing') {
    renderPricingView(subviewContainer, container);
  } else if (activeSubTab === 'traceability') {
    renderFarmerTraceabilityView(subviewContainer);
  }
}

function renderFarmerDashboardView(container, parentContainer, stats) {
  const currencyFormatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(stats.estimatedValue || 124000);

  const recentRows = cachedCrops.slice(0, 5).map((c) => {
    const isChain = c.blockchain_crop_id != null;
    return `
      <tr>
        <td><strong style="color: var(--primary);">#${c.crop_id}</strong></td>
        <td>
          <div style="font-weight: 600;">${c.crop_name}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${c.crop_type}</div>
        </td>
        <td>${c.quantity} ${c.unit}</td>
        <td>${c.location}</td>
        <td>
          ${
            isChain
              ? `<span class="badge badge-success">✓ Blockchain Verified</span>`
              : `<span class="badge badge-warning">• Off-Chain Record</span>`
          }
        </td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm farmer-btn-trace-crop" data-id="${c.crop_id}">Trace</button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <!-- KPI Cards Grid -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Total Crops</span>
          <span class="kpi-value">${stats.totalCrops}</span>
          <span class="kpi-subtext">${stats.onChainCount} on blockchain</span>
        </div>
        <div class="kpi-icon-box">${icons.leaf}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Active Cultivation</span>
          <span class="kpi-value">${stats.activeCultivation}</span>
          <span class="kpi-subtext">Growing in fields</span>
        </div>
        <div class="kpi-icon-box">${icons.clock}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Harvest Ready</span>
          <span class="kpi-value">${stats.harvestReady}</span>
          <span class="kpi-subtext">Ready for custody transfer</span>
        </div>
        <div class="kpi-icon-box">${icons.check}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Estimated Value</span>
          <span class="kpi-value" style="font-size: 22px; color: #34d399;">${currencyFormatted}</span>
          <span class="kpi-subtext">AI Reference Portfolio</span>
        </div>
        <div class="kpi-icon-box">${icons.chart}</div>
      </div>
    </div>

    <!-- Recent Crops Card -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3>Recent Registered Crops</h3>
          <p>Latest harvest batches and their on-chain verification status</p>
        </div>
        <button id="farmer-btn-view-all-crops" class="btn btn-secondary btn-sm">
          <span>View All (${stats.totalCrops})</span> ${icons.arrowRight}
        </button>
      </div>

      ${
        cachedCrops.length === 0
          ? `
          <div style="text-align: center; padding: 48px 16px;">
            <div style="color: var(--text-dim); margin-bottom: 12px; font-size: 32px;">🌱</div>
            <h4 style="margin-bottom: 6px;">No crops registered yet</h4>
            <p style="margin-bottom: 16px;">Start tracking your agricultural produce by creating your first crop record.</p>
            <button id="farmer-btn-zero-register" class="btn btn-primary">
              ${icons.plus} <span>Register First Crop</span>
            </button>
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
                  <th>Location</th>
                  <th>Status</th>
                  <th style="text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${recentRows}
              </tbody>
            </table>
          </div>
          `
      }
    </div>
  `;

  // Bind View All
  container.querySelector('#farmer-btn-view-all-crops')?.addEventListener('click', () => {
    activeSubTab = 'my-crops';
    renderFarmerView(parentContainer);
  });

  // Bind Zero Register
  container.querySelector('#farmer-btn-zero-register')?.addEventListener('click', () => {
    openRegisterCropModal(parentContainer);
  });

  // Bind Row Trace
  container.querySelectorAll('.farmer-btn-trace-crop').forEach((btn) => {
    btn.addEventListener('click', () => {
      preselectedTraceId = btn.getAttribute('data-id');
      activeSubTab = 'traceability';
      renderFarmerView(parentContainer);
    });
  });
}

function renderMyCropsView(container, parentContainer) {
  if (cachedCrops.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 48px 16px;">
        <h4 style="margin-bottom: 8px;">No crops found</h4>
        <p style="margin-bottom: 16px;">You have not registered any crop consignments yet.</p>
        <button id="btn-empty-register" class="btn btn-primary">
          ${icons.plus} <span>Register New Crop</span>
        </button>
      </div>
    `;
    container.querySelector('#btn-empty-register')?.addEventListener('click', () => {
      openRegisterCropModal(parentContainer);
    });
    return;
  }

  const categories = [...new Set(cachedCrops.map((c) => c.crop_type).filter(Boolean))];

  const rows = cachedCrops.map((c) => {
    const isChain = c.blockchain_crop_id != null;
    const batchCode = c.batch_number || `BATCH-2026-${String(c.crop_id).padStart(5, '0')}`;
    return `
      <tr class="farmer-crop-row" 
          data-name="${(c.crop_name || '').toLowerCase()}" 
          data-batch="${batchCode.toLowerCase()}" 
          data-dbid="${c.crop_id}" 
          data-chainid="${c.blockchain_crop_id || ''}" 
          data-type="${(c.crop_type || '').toLowerCase()}" 
          data-status="${isChain ? 'on-chain' : 'off-chain'}">
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
          <div style="font-weight: 700; color: #34d399;">
            ${c.farmer_price_per_kg != null ? `₹${Number(c.farmer_price_per_kg).toFixed(2)}/kg` : '<span style="color:var(--text-muted); font-size:12px;">Not Set</span>'}
          </div>
          <div style="font-size: 10px; color: var(--text-dim);">Farm-Gate</div>
        </td>
        <td>
          ${
            c.farmer_price_per_kg != null
              ? `<div>
                   <strong style="color: #60a5fa;">₹${(Number(c.supplier_price_per_kg) || (Number(c.farmer_price_per_kg) + 15.00)).toFixed(2)}/kg</strong>
                   <span style="font-size: 10px; color: var(--text-dim);">(Supplier Price)</span>
                 </div>
                 <div style="font-size: 11px; margin-top: 2px;">
                   ${
                     c.retail_price_per_kg != null
                       ? `<span class="badge badge-success" style="font-size: 10px;" title="Confirmed by ${c.retail_confirmed_by || 'Retailer'}">Shelf: ₹${Number(c.retail_price_per_kg).toFixed(2)}/kg</span>`
                       : `<span class="badge badge-warning" style="font-size: 10px;">Retail Pending</span>`
                   }
                 </div>`
              : `<span class="badge badge-ghost" style="font-size: 11px;">Price Required</span>`
          }
        </td>
        <td>${c.cultivation_date || 'N/A'}</td>
        <td>${c.expected_harvest_date || 'N/A'}</td>
        <td>${c.location}</td>
        <td>
          ${
            isChain
              ? `<span class="badge badge-success">✓ Blockchain Verified</span>`
              : `<span class="badge badge-warning">• Off-Chain Record</span>`
          }
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm farmer-btn-trace-crop" data-id="${c.crop_id}" style="margin-right: 4px;">Trace</button>
          <button class="btn btn-primary btn-sm farmer-btn-price-crop" data-id="${c.crop_id}" data-crop="${c.crop_type}" data-qty="${c.quantity}" data-loc="${c.location}" data-name="${c.crop_name}" style="margin-right: 4px;">Price AI</button>
          <button class="btn btn-secondary btn-sm farmer-btn-dispatch" data-id="${c.crop_id}" title="Dispatch to Supplier">
            ${icons.truck || '🚚'} <span>Dispatch</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <h3>My Registered Crops</h3>
          <p>Comprehensive register of your agricultural batches across active seasons</p>
        </div>
        <span class="badge badge-info" style="font-size: 13px; padding: 6px 12px;">${cachedCrops.length} batches recorded</span>
      </div>

      <!-- Crop Browsing Toolbar -->
      <div class="table-toolbar">
        <div class="table-toolbar-left">
          <input type="text" id="farmer-crop-search" class="table-search-input" placeholder="Search by crop name, batch (e.g. BATCH-2026-00134), DB #, on-chain #..." aria-label="Search crops" />
          <select id="farmer-category-filter" class="table-filter-select" aria-label="Filter by category">
            <option value="">All Categories</option>
            ${categories.map((cat) => `<option value="${cat.toLowerCase()}">${cat}</option>`).join('')}
          </select>
          <select id="farmer-status-filter" class="table-filter-select" aria-label="Filter by blockchain status">
            <option value="">All Blockchain States</option>
            <option value="on-chain">On-Chain Verified</option>
            <option value="off-chain">Off-Chain Record</option>
          </select>
        </div>
        <div class="table-count-label" id="farmer-crop-count">
          Showing ${cachedCrops.length} of ${cachedCrops.length} crops
        </div>
      </div>

      <div class="table-responsive table-container-scrollable">
        <table class="table">
          <thead>
            <tr>
              <th>Batch / DB ID</th>
              <th>Crop Name & Type</th>
              <th>Quantity</th>
              <th>Farm-Gate Price</th>
              <th>Downstream Pricing</th>
              <th>Cultivation Date</th>
              <th>Expected Harvest</th>
              <th>Location</th>
              <th>Blockchain Status</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody id="farmer-crop-tbody">
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Bind Real-Time Live Search and Filter
  const searchInput = container.querySelector('#farmer-crop-search');
  const catSelect = container.querySelector('#farmer-category-filter');
  const statusSelect = container.querySelector('#farmer-status-filter');
  const countLabel = container.querySelector('#farmer-crop-count');
  const rowElements = container.querySelectorAll('.farmer-crop-row');

  function filterFarmerRows() {
    const query = (searchInput.value || '').trim().toLowerCase();
    const selCat = (catSelect.value || '').trim().toLowerCase();
    const selStatus = (statusSelect.value || '').trim().toLowerCase();

    let visibleCount = 0;
    rowElements.forEach((tr) => {
      const name = tr.getAttribute('data-name');
      const batch = tr.getAttribute('data-batch');
      const dbId = tr.getAttribute('data-dbid');
      const chainId = tr.getAttribute('data-chainid');
      const type = tr.getAttribute('data-type');
      const status = tr.getAttribute('data-status');

      let matchesQuery = true;
      if (query) {
        matchesQuery =
          name.includes(query) ||
          batch.includes(query) ||
          dbId === query ||
          (query.startsWith('#') && dbId === query.slice(1)) ||
          chainId === query ||
          (query.startsWith('#') && chainId === query.slice(1));
      }

      let matchesCat = true;
      if (selCat) {
        matchesCat = type === selCat;
      }

      let matchesStatus = true;
      if (selStatus) {
        matchesStatus = status === selStatus;
      }

      const show = matchesQuery && matchesCat && matchesStatus;
      tr.style.display = show ? '' : 'none';
      if (show) visibleCount++;
    });

    countLabel.innerText = `Showing ${visibleCount} of ${cachedCrops.length} crops`;
  }

  searchInput.addEventListener('input', filterFarmerRows);
  catSelect.addEventListener('change', filterFarmerRows);
  statusSelect.addEventListener('change', filterFarmerRows);

  // Bind Trace
  container.querySelectorAll('.farmer-btn-trace-crop').forEach((btn) => {
    btn.addEventListener('click', () => {
      preselectedTraceId = btn.getAttribute('data-id');
      activeSubTab = 'traceability';
      renderFarmerView(parentContainer);
    });
  });

  // Bind Price AI with auto-fill
  container.querySelectorAll('.farmer-btn-price-crop').forEach((btn) => {
    btn.addEventListener('click', () => {
      preselectedPricingCrop = {
        crop_id: parseInt(btn.getAttribute('data-id'), 10),
        crop_type: btn.getAttribute('data-crop'),
        quantity: parseFloat(btn.getAttribute('data-qty')),
        location: btn.getAttribute('data-loc'),
        crop_name: btn.getAttribute('data-name'),
      };
      activeSubTab = 'pricing';
      renderFarmerView(parentContainer);
    });
  });

  // Bind Dispatch
  container.querySelectorAll('.farmer-btn-dispatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cropId = btn.getAttribute('data-id');
      const crop = cachedCrops.find((c) => String(c.crop_id) === String(cropId));
      if (crop) {
        openDispatchCropModal(parentContainer, crop);
      }
    });
  });
}

async function openDispatchCropModal(parentContainer, crop) {
  const modal = parentContainer.querySelector('#farmer-dispatch-modal');
  const body = parentContainer.querySelector('#farmer-dispatch-modal-body');

  modal.style.display = 'flex';
  body.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted);">Loading dispatch details...</div>';

  const token = getToken();
  const currentUser = getCurrentUser();
  let accounts = [];
  try {
    accounts = await getAccounts();
  } catch {}

  const directory = await getPartnerDirectory(token);
  const suppliers = directory.filter((u) => u.role === 'SUPPLIER');
  if (suppliers.length === 0) {
    suppliers.push({
      username: 'supplier1',
      full_name: 'Wasi Mumbai',
      role: 'SUPPLIER',
      wallet_address: '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0',
    });
  }

  // Resolve authenticated farmer wallet cleanly
  const expectedFarmerWallet = getUserWallet(currentUser, directory) || crop.blockchain_farmer_address || '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1';
  let farmerAddr = expectedFarmerWallet;
  if (accounts.length > 0) {
    const matching = accounts.find((a) => a.toLowerCase() === expectedFarmerWallet.toLowerCase());
    if (matching) {
      farmerAddr = matching;
    } else if (crop.blockchain_farmer_address && accounts.find((a) => a.toLowerCase() === crop.blockchain_farmer_address.toLowerCase())) {
      farmerAddr = crop.blockchain_farmer_address;
    }
  }

  const farmerUser = resolveUserByAddress(farmerAddr, directory);
  const farmerFriendly = farmerUser ? `${farmerUser.username} (${farmerUser.full_name})` : formatAddress(farmerAddr);

  // Validate on-chain mapping
  const hasOnChainMapping = crop.blockchain_crop_id != null && Number(crop.blockchain_crop_id) > 0;

  // Pre-flight on-chain current holder check
  let currentHolderOnChain = null;
  let isCurrentHolder = false;
  let holderLookupError = null;

  if (hasOnChainMapping) {
    try {
      currentHolderOnChain = await getCurrentHolderFromChain(crop.blockchain_crop_id);
      isCurrentHolder = currentHolderOnChain.toLowerCase() === farmerAddr.toLowerCase();
    } catch (err) {
      console.warn('Pre-flight on-chain holder lookup note:', err);
      holderLookupError = err.message || 'Smart contract lookup failed.';
    }
  }

  const supplierOptions = suppliers
    .map(
      (s) =>
        `<option value="${s.wallet_address}" data-username="${s.username}" data-name="${s.full_name || s.username}">
          ${s.full_name ? `${s.full_name} (${s.username})` : s.username} — ${formatAddress(s.wallet_address)}
        </option>`
    )
    .join('');

  const farmerPrice = crop.farmer_price_per_kg != null ? Number(crop.farmer_price_per_kg) : 63.49;
  const supplierMargin = 15.00;
  const supplierPurchasePrice = farmerPrice + supplierMargin;

  body.innerHTML = `
    <form id="farmer-dispatch-form">
      <div style="background: var(--bg-surface); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 16px; font-size: 13px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="color: var(--primary);">Batch #${crop.crop_id} - ${crop.crop_name}</strong>
          ${
            hasOnChainMapping
              ? `<span class="badge badge-success" style="font-size: 11px;">✓ On-Chain #${crop.blockchain_crop_id}</span>`
              : `<span class="badge badge-warning" style="font-size: 11px;">Off-Chain Record</span>`
          }
        </div>
        <div style="color: var(--text-muted); font-size: 12px;">
          Quantity: <strong>${crop.quantity} ${crop.unit}</strong> &bull; Origin: <strong>${crop.location}</strong>
        </div>
      </div>

      <!-- Current Custody & Holder Status -->
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; font-size: 12px;">
        <div style="color: var(--text-muted); margin-bottom: 2px;">Authenticated Dispatcher (Farmer):</div>
        <div style="font-weight: 600; color: #ffffff;">${farmerFriendly}</div>
        <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);">${farmerAddr}</div>
      </div>

      ${
        !hasOnChainMapping
          ? `
          <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; padding: 12px; margin-bottom: 16px; color: #fca5a5; font-size: 13px;">
            <div style="font-weight: 700; margin-bottom: 4px;">⚠️ Consignment Not Registered On-Chain</div>
            <div>Batch <strong>${crop.batch_number || crop.crop_id}</strong> is an off-chain record without a smart-contract mapping.</div>
            <div style="margin-top: 4px; font-size: 12px; color: #fecaca;">
              Blockchain custody transfer requires an active on-chain registration.
            </div>
          </div>
          `
          : !isCurrentHolder && currentHolderOnChain
          ? `
          <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; padding: 12px; margin-bottom: 16px; color: #fca5a5; font-size: 13px;">
            <div style="font-weight: 700; margin-bottom: 4px;">⚠️ On-Chain Custody Notice</div>
            <div>The current on-chain holder is: <strong>${getFriendlyAccountLabel(currentHolderOnChain, directory)}</strong> (<code>${formatAddress(currentHolderOnChain)}</code>).</div>
            <div style="margin-top: 4px; font-size: 12px; color: #fecaca;">
              Only the active on-chain holder can dispatch this consignment.
            </div>
          </div>
          `
          : hasOnChainMapping && isCurrentHolder
          ? `
          <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; font-size: 12px; color: #34d399;">
            <strong>✓ Active Custody Verified:</strong> Your farmer wallet holds this consignment on-chain (Crop #${crop.blockchain_crop_id}). Ready to dispatch to verified supplier.
          </div>
          `
          : ''
      }

      <!-- Step: Select Authorized Supplier -->
      <div class="form-group">
        <label class="form-label" for="dispatch-supplier-select">
          Select Logistics Partner / Supplier <span style="color:var(--danger)">*</span>
        </label>
        <select id="dispatch-supplier-select" class="form-control" ${!hasOnChainMapping || !isCurrentHolder ? 'disabled' : ''} required>
          ${supplierOptions}
        </select>
        <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 4px;">
          Select from registered, verified supply-chain partners.
        </span>
      </div>

      <!-- Multi-Stage Pricing Summary Before Confirmation -->
      <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px 14px; margin-bottom: 16px; font-size: 12px;">
        <div style="font-weight: 700; color: var(--text-secondary); text-transform: uppercase; font-size: 11px; margin-bottom: 6px;">
          Transparent Multi-Stage Transfer Pricing
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span style="color: var(--text-muted);">Registered Farm-Gate Price:</span>
          <strong>₹${farmerPrice.toFixed(2)} / kg</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span style="color: var(--text-muted);">Standard Supplier Gross Margin:</span>
          <strong>+ ₹${supplierMargin.toFixed(2)} / kg</strong>
        </div>
        <div style="border-top: 1px solid var(--border-color); padding-top: 4px; display: flex; justify-content: space-between; color: #60a5fa; font-weight: 700;">
          <span>Supplier Sale Price (Retailer Cost):</span>
          <span>₹${supplierPurchasePrice.toFixed(2)} / kg</span>
        </div>
      </div>

      <div id="dispatch-error-msg" style="display: none; padding: 10px; border-radius: 6px; background: var(--danger-subtle); color: #fca5a5; font-size: 13px; margin-bottom: 14px;"></div>

      <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
        <button type="button" id="btn-cancel-dispatch" class="btn btn-secondary">Cancel</button>
        <button type="submit" id="btn-confirm-dispatch" class="btn btn-primary" ${!hasOnChainMapping || !isCurrentHolder ? 'disabled' : ''}>
          ${icons.truck || '🚚'} <span>Confirm Dispatch to Supplier</span>
        </button>
      </div>
    </form>
  `;

  const form = body.querySelector('#farmer-dispatch-form');
  const cancelBtn = body.querySelector('#btn-cancel-dispatch');
  const confirmBtn = body.querySelector('#btn-confirm-dispatch');
  const errorMsg = body.querySelector('#dispatch-error-msg');
  const supplierSelect = body.querySelector('#dispatch-supplier-select');

  cancelBtn.onclick = () => {
    modal.style.display = 'none';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!hasOnChainMapping) {
      errorMsg.style.display = 'block';
      errorMsg.innerText = 'Cannot dispatch: Consignment is not registered on the smart contract.';
      return;
    }
    if (!isCurrentHolder) {
      errorMsg.style.display = 'block';
      errorMsg.innerText = 'Cannot dispatch: Active on-chain ownership belongs to another participant.';
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.innerText = 'Dispatching Consignment...';
    errorMsg.style.display = 'none';

    const supplierAddr = supplierSelect.value.trim();
    const selectedSupplier = suppliers.find((s) => s.wallet_address.toLowerCase() === supplierAddr.toLowerCase());
    const supplierFriendly = selectedSupplier ? `${selectedSupplier.username} (${selectedSupplier.full_name})` : formatAddress(supplierAddr);

    try {
      confirmBtn.innerText = 'Signing Blockchain Transfer...';
      const chainRes = await transferCropOnChain(
        crop.blockchain_crop_id,
        supplierAddr,
        'Supplier',
        farmerAddr
      );

      // Verify post-flight that on-chain holder equals supplier wallet
      const confirmedHolder = await getCurrentHolderFromChain(crop.blockchain_crop_id);
      if (confirmedHolder.toLowerCase() !== supplierAddr.toLowerCase()) {
        throw new Error(
          `On-chain verification error: Transferred to ${supplierAddr}, but smart contract reports current holder as ${confirmedHolder}.`
        );
      }

      confirmBtn.innerText = 'Recording Transaction Audit...';
      await saveTransactionApi(
        {
          crop_id: crop.crop_id,
          event_type: 'TRANSFER',
          from_address: farmerAddr,
          to_address: supplierAddr,
          to_role: 'Supplier',
          transaction_hash: chainRes.txHash,
          block_number: Number(chainRes.blockNumber),
          timestamp: new Date().toISOString(),
        },
        token
      );

      modal.style.display = 'none';
      toast.success(`Batch #${crop.crop_id} (${crop.crop_name}) dispatched to ${supplierFriendly} on-chain! Block #${chainRes.blockNumber}`, 'Consignment Dispatched');
      renderFarmerView(parentContainer);
    } catch (err) {
      errorMsg.style.display = 'block';
      errorMsg.innerText = err.message || 'Dispatch failed.';
      confirmBtn.disabled = false;
      confirmBtn.innerText = 'Confirm Dispatch to Supplier';
    }
  });
}

function openRegisterCropModal(parentContainer) {
  const modal = parentContainer.querySelector('#register-crop-modal');
  const body = parentContainer.querySelector('#register-crop-modal-body');
  const closeBtn = parentContainer.querySelector('#modal-close-btn');

  modal.style.display = 'flex';

  closeBtn.onclick = () => { modal.style.display = 'none'; };
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

  const today = new Date().toISOString().split('T')[0];
  const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  body.innerHTML = `
    <form id="farmer-register-form">
      <div class="form-row-2">
        <!-- Left: Crop Information -->
        <div>
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--primary); letter-spacing: 0.05em; margin-bottom: 12px;">
            1. Crop Information
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-crop-type">Crop Type / Category <span style="color:var(--danger)">*</span></label>
            <select id="reg-crop-type" class="form-control" required>
              <option value="Mango" selected>Mango</option>
              <option value="Banana">Banana</option>
              <option value="Tomato">Tomato</option>
              <option value="Onion">Onion</option>
              <option value="Potato">Potato</option>
              <option value="Cabbage">Cabbage</option>
              <option value="Cauliflower">Cauliflower</option>
              <option value="Grapes">Grapes</option>
              <option value="Rice">Rice</option>
              <option value="Wheat">Wheat</option>
              <option value="Other">Other</option>
            </select>
            <span style="font-size: 11px; color: var(--text-dim); display: block; margin-top: 4px;">
              A unique batch identifier (e.g. <code style="color: var(--primary);">Mango — BATCH-2026-XXXXX</code>) will be automatically generated.
            </span>
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label" for="reg-crop-quantity">Quantity <span style="color:var(--danger)">*</span></label>
              <input type="number" id="reg-crop-quantity" class="form-control" placeholder="500" min="1" step="any" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="reg-crop-unit">Unit <span style="color:var(--danger)">*</span></label>
              <select id="reg-crop-unit" class="form-control" required>
                <option value="kg">kg (Kilograms)</option>
                <option value="crates">crates</option>
                <option value="quintal">quintal</option>
                <option value="tons">tons</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Right: Cultivation Information -->
        <div>
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--primary); letter-spacing: 0.05em; margin-bottom: 12px;">
            2. Cultivation & Origin
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-cultivation-date">Cultivation Date <span style="color:var(--danger)">*</span></label>
            <input type="date" id="reg-cultivation-date" class="form-control" value="${today}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-expected-harvest">Expected Harvest Date <span style="color:var(--danger)">*</span></label>
            <input type="date" id="reg-expected-harvest" class="form-control" value="${nextMonth}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-location">Farm Location / Region <span style="color:var(--danger)">*</span></label>
            <input type="text" id="reg-location" class="form-control" placeholder="e.g. Greenfield Farm, Nashik" required />
          </div>
        </div>
      </div>

      <!-- Pricing Workflow Section -->
      <div style="margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 16px;">
        <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--primary); letter-spacing: 0.05em; margin-bottom: 12px;">
          3. Farm-Gate Pricing (AI Assisted)
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start;">
          <div>
            <div class="form-group" style="margin-bottom: 8px;">
              <label class="form-label" for="reg-farmer-price">
                Your Selling Price (₹ / kg) <span style="color:var(--danger)">*</span>
              </label>
              <div style="display: flex; gap: 8px;">
                <input
                  type="number"
                  id="reg-farmer-price"
                  class="form-control"
                  placeholder="e.g. 45.00"
                  min="1"
                  step="0.01"
                  required
                  style="font-size: 16px; font-weight: 600;"
                />
                <button type="button" id="btn-fetch-ai-pricing" class="btn btn-secondary" style="white-space: nowrap; font-size: 12px; padding: 0 12px;" title="Auto-populate AI price estimate">
                  ${icons.chart} AI Suggest
                </button>
              </div>
            </div>
            <div style="font-size: 11px; color: var(--text-dim); line-height: 1.4;">
              Minimum ₹1.00/kg required. This represents your farm-gate revenue before logistics and retail markup.
            </div>
          </div>

          <!-- Retail Shelf Price Preview -->
          <div id="shelf-price-preview-card" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px 14px;">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700; margin-bottom: 4px;">
              Retail Shelf Price Preview
            </div>
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <span style="font-size: 13px; color: var(--text-muted);">Farmer Price:</span>
              <span id="preview-farmer-val" style="font-weight: 600;">₹0.00 / kg</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 2px;">
              <span style="font-size: 13px; color: var(--text-muted);">Retailer Markup:</span>
              <span style="color: var(--text-dim);">+ ₹30.00 / kg</span>
            </div>
            <div style="border-top: 1px solid var(--border-color); margin-top: 6px; padding-top: 6px; display: flex; justify-content: space-between; align-items: baseline;">
              <span style="font-size: 13px; font-weight: 700; color: #ffffff;">Consumer Price:</span>
              <span id="preview-total-val" style="font-size: 16px; font-weight: 800; color: #34d399;">₹30.00 / kg</span>
            </div>
          </div>
        </div>
      </div>

      <div id="register-error-msg" style="display: none; padding: 10px; border-radius: 6px; background: var(--danger-subtle); color: #fca5a5; font-size: 13px; margin-top: 14px;"></div>

      <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 24px; border-top: 1px solid var(--border-color); padding-top: 16px;">
        <button type="button" id="btn-cancel-register" class="btn btn-secondary">Cancel</button>
        <button type="submit" id="btn-submit-register" class="btn btn-primary" style="padding: 10px 28px;">
          ${icons.plus} <span>Register Crop</span>
        </button>
      </div>
    </form>
  `;

  const form = body.querySelector('#farmer-register-form');
  const cropTypeSelect = body.querySelector('#reg-crop-type');
  const farmerPriceInput = body.querySelector('#reg-farmer-price');
  const previewFarmerVal = body.querySelector('#preview-farmer-val');
  const previewTotalVal = body.querySelector('#preview-total-val');
  const btnFetchAi = body.querySelector('#btn-fetch-ai-pricing');
  const submitBtn = body.querySelector('#btn-submit-register');
  const cancelBtn = body.querySelector('#btn-cancel-register');
  const errorMsg = body.querySelector('#register-error-msg');

  cancelBtn.onclick = () => { modal.style.display = 'none'; };

  function updatePricePreview() {
    const val = parseFloat(farmerPriceInput.value);
    if (!isNaN(val) && val > 0) {
      previewFarmerVal.innerText = `₹${val.toFixed(2)} / kg`;
      previewTotalVal.innerText = `₹${(val + 30.0).toFixed(2)} / kg`;
    } else {
      previewFarmerVal.innerText = '₹0.00 / kg';
      previewTotalVal.innerText = '₹30.00 / kg';
    }
  }

  farmerPriceInput.addEventListener('input', updatePricePreview);

  btnFetchAi.addEventListener('click', async () => {
    btnFetchAi.disabled = true;
    btnFetchAi.innerText = 'Fetching...';
    try {
      const benchmark = await fetchCropBenchmarksApi(cropTypeSelect.value);
      if (benchmark && benchmark.historical_price) {
        const estPriceKg = benchmark.historical_price_per_kg || roundToTwo(benchmark.historical_price / 100);
        farmerPriceInput.value = estPriceKg.toFixed(2);
        updatePricePreview();
      }
    } catch {
      farmerPriceInput.value = '45.00';
      updatePricePreview();
    } finally {
      btnFetchAi.disabled = false;
      btnFetchAi.innerHTML = `${icons.chart} AI Suggest`;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerText = 'Registering Crop...';
    errorMsg.style.display = 'none';

    const user = getCurrentUser();
    const token = getToken();

    const cropType = body.querySelector('#reg-crop-type').value;
    const quantity = parseFloat(body.querySelector('#reg-crop-quantity').value);
    const unit = body.querySelector('#reg-crop-unit').value;
    const cultivationDate = body.querySelector('#reg-cultivation-date').value;
    const expectedHarvest = body.querySelector('#reg-expected-harvest').value;
    const location = body.querySelector('#reg-location').value.trim();
    const farmerPrice = parseFloat(farmerPriceInput.value);

    if (isNaN(farmerPrice) || farmerPrice < 1.0) {
      errorMsg.style.display = 'block';
      errorMsg.innerText = 'Farmer price must be at least ₹1.00/kg.';
      submitBtn.disabled = false;
      submitBtn.innerText = 'Register Crop';
      return;
    }

    try {
      let chainRes = null;
      let accounts = [];
      try {
        accounts = await getAccounts();
      } catch {}

      const directory = await getPartnerDirectory(token);
      const expectedFarmerWallet = getUserWallet(user, directory) || '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1';
      let signerAddress = expectedFarmerWallet;
      if (accounts.length > 0) {
        const matching = accounts.find((a) => a.toLowerCase() === expectedFarmerWallet.toLowerCase());
        if (matching) signerAddress = matching;
        else signerAddress = accounts[0];
      }

      submitBtn.innerText = 'Broadcasting to Blockchain...';
      try {
        chainRes = await registerCropOnChain(
          {
            crop_name: cropType,
            crop_type: cropType,
            quantity,
            unit,
            cultivation_date: cultivationDate,
            expected_harvest_date: expectedHarvest,
            location,
          },
          signerAddress
        );
      } catch (chainErr) {
        console.warn('On-chain registration bypass notice:', chainErr);
      }

      submitBtn.innerText = 'Saving Crop Record...';
      const payload = {
        crop_type: cropType,
        quantity,
        unit,
        cultivation_date: cultivationDate,
        expected_harvest_date: expectedHarvest,
        location,
        farmer_id: user?.username || 'farmer1',
        farmer_price_per_kg: farmerPrice,
        ...(chainRes
          ? {
              blockchain_crop_id: chainRes.blockchainCropId,
              blockchain_tx_hash: chainRes.txHash,
              blockchain_block_number: chainRes.blockNumber,
              blockchain_farmer_address: signerAddress,
            }
          : {}),
      };

      const created = await createCropApi(payload, token);
      toast.success(`Crop #${created.crop_id} (${created.crop_name}) registered successfully!`, 'Crop Registered');

      body.innerHTML = `
        <div style="text-align: center; padding: 24px 12px;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--primary-subtle); border: 2px solid var(--primary); display: flex; align-items: center; justify-content: center; color: var(--primary); font-size: 26px; margin: 0 auto 16px;">
            ✓
          </div>
          <h3 style="font-size: 22px; margin-bottom: 6px; color: #ffffff;">Crop Registered Successfully</h3>
          <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 24px;">
            A digital identity has been created and mapped to the agricultural provenance ledger.
          </p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: var(--bg-surface); padding: 18px; border-radius: var(--radius-lg); border: 1px solid var(--border-color); text-align: left; margin-bottom: 24px;">
            <div>
              <span style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Database Crop ID</span>
              <div style="font-size: 18px; font-weight: 800; color: var(--primary);">#${created.crop_id}</div>
            </div>
            <div>
              <span style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Farm-Gate Price</span>
              <div style="font-size: 18px; font-weight: 800; color: #34d399;">₹${Number(created.farmer_price_per_kg || farmerPrice).toFixed(2)}/kg</div>
            </div>
            <div style="grid-column: span 2; margin-top: 6px; border-top: 1px solid var(--border-color); padding-top: 10px;">
              <span style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Crop Name & Quantity</span>
              <div style="font-weight: 600;">${created.crop_name} (${created.quantity} ${created.unit})</div>
            </div>
            <div style="grid-column: span 2;">
              <span style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Retail Markup Policy</span>
              <div style="font-size: 12px; color: var(--text-muted);">Retailers will add fixed ₹30.00/kg markup (Final Shelf Price: ₹${(Number(created.farmer_price_per_kg || farmerPrice) + 30).toFixed(2)}/kg)</div>
            </div>
          </div>

          <div style="display: flex; gap: 12px; justify-content: center;">
            <button id="btn-view-registered-crop" class="btn btn-primary" style="padding: 10px 24px;">
              View Crop
            </button>
            <button id="btn-done-register" class="btn btn-secondary">
              Done
            </button>
          </div>
        </div>
      `;

      body.querySelector('#btn-view-registered-crop').onclick = () => {
        modal.style.display = 'none';
        preselectedTraceId = created.crop_id;
        activeSubTab = 'traceability';
        renderFarmerView(parentContainer);
      };

      body.querySelector('#btn-done-register').onclick = () => {
        modal.style.display = 'none';
        activeSubTab = 'my-crops';
        renderFarmerView(parentContainer);
      };
    } catch (err) {
      errorMsg.style.display = 'block';
      errorMsg.innerText = err.message || 'Failed to register crop record.';
      submitBtn.disabled = false;
      submitBtn.innerText = 'Register Crop';
    }
  });
}

function roundToTwo(num) {
  return +(Math.round(num + "e+2")  + "e-2");
}

function renderPricingView(container, parentContainer) {
  const isPreselected = preselectedPricingCrop != null;

  container.innerHTML = `
    <div class="card" style="max-width: 800px; margin: 0 auto;">
      <div class="card-header">
        <div>
          <h3>AI Price Prediction</h3>
          <p>Estimate fair market value for your harvest using historical trend analysis</p>
        </div>
        <span class="badge badge-info">${icons.chart} Random Forest Regressor</span>
      </div>

      ${
        isPreselected
          ? `
          <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: #34d399;">Pricing Mode:</strong>
              <span>Evaluating Crop #${preselectedPricingCrop.crop_id} (${preselectedPricingCrop.crop_name || preselectedPricingCrop.crop_type})</span>
            </div>
            <button id="btn-clear-preselected-crop" class="btn btn-ghost btn-sm" style="font-size: 11px;">Clear</button>
          </div>
          `
          : ''
      }

      <form id="farmer-pricing-form">
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label" for="price-crop-type">Crop Type</label>
            <select id="price-crop-type" class="form-control">
              <option value="Banana" ${preselectedPricingCrop?.crop_type?.toLowerCase() === 'banana' ? 'selected' : ''}>Banana</option>
              <option value="Tomato" ${preselectedPricingCrop?.crop_type?.toLowerCase() === 'tomato' ? 'selected' : ''}>Tomato</option>
              <option value="Onion" ${preselectedPricingCrop?.crop_type?.toLowerCase() === 'onion' ? 'selected' : ''}>Onion</option>
              <option value="Potato" ${preselectedPricingCrop?.crop_type?.toLowerCase() === 'potato' ? 'selected' : ''}>Potato</option>
              <option value="Mango" ${preselectedPricingCrop?.crop_type?.toLowerCase() === 'mango' ? 'selected' : ''}>Mango</option>
              <option value="Cabbage" ${preselectedPricingCrop?.crop_type?.toLowerCase() === 'cabbage' ? 'selected' : ''}>Cabbage</option>
              <option value="Cauliflower" ${preselectedPricingCrop?.crop_type?.toLowerCase() === 'cauliflower' ? 'selected' : ''}>Cauliflower</option>
              <option value="Grapes" ${preselectedPricingCrop?.crop_type?.toLowerCase() === 'grapes' ? 'selected' : ''}>Grapes</option>
              <option value="Rice" ${preselectedPricingCrop?.crop_type?.toLowerCase() === 'rice' ? 'selected' : ''}>Rice</option>
              <option value="Wheat" ${preselectedPricingCrop?.crop_type?.toLowerCase() === 'wheat' ? 'selected' : ''}>Wheat</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="price-season">Season</label>
            <select id="price-season" class="form-control">
              <option value="Monsoon">Monsoon (Kharif)</option>
              <option value="Winter">Winter (Rabi)</option>
              <option value="Summer">Summer (Zaid)</option>
            </select>
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label" for="price-location">Location / District</label>
            <input type="text" id="price-location" class="form-control" value="${preselectedPricingCrop?.location || 'Nashik'}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="price-history">Historical Mandi Price (₹ / quintal)</label>
            <input type="number" id="price-history" class="form-control" value="4500" required />
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label" for="price-demand">Market Demand Factor (0.1 - 1.0)</label>
            <input type="number" id="price-demand" class="form-control" value="0.8" step="0.1" min="0.1" max="1.0" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="price-quantity">Estimated Batch Quantity (kg)</label>
            <input type="number" id="price-quantity" class="form-control" value="${preselectedPricingCrop?.quantity || '500'}" required />
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; margin-top:16px;">
          <button type="submit" id="btn-predict-price" class="btn btn-primary" style="padding:10px 24px;">
            ${icons.chart} <span>Calculate Estimated Price</span>
          </button>
        </div>
      </form>

      <div id="pricing-result-container" style="display: none; margin-top: 24px;"></div>
    </div>
  `;

  const form = container.querySelector('#farmer-pricing-form');
  const cropSelect = container.querySelector('#price-crop-type');
  const historyInput = container.querySelector('#price-history');
  const resultDiv = container.querySelector('#pricing-result-container');
  const submitBtn = container.querySelector('#btn-predict-price');
  const clearPreselectedBtn = container.querySelector('#btn-clear-preselected-crop');

  if (clearPreselectedBtn) {
    clearPreselectedBtn.onclick = () => {
      preselectedPricingCrop = null;
      renderPricingView(container, parentContainer);
    };
  }

  // Auto-fill benchmark on crop select
  async function loadBenchmark() {
    try {
      const benchmark = await fetchCropBenchmarksApi(cropSelect.value);
      if (benchmark && benchmark.historical_price) {
        historyInput.value = benchmark.historical_price;
      }
    } catch {}
  }

  cropSelect.addEventListener('change', loadBenchmark);
  loadBenchmark();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerText = 'Calculating Market Rate...';
    resultDiv.style.display = 'none';

    const payload = {
      crop_type: cropSelect.value,
      season: container.querySelector('#price-season').value,
      location: container.querySelector('#price-location').value.trim(),
      historical_price: parseFloat(historyInput.value),
      demand: parseFloat(container.querySelector('#price-demand').value),
      production_quantity: parseFloat(container.querySelector('#price-quantity').value),
    };

    try {
      const res = await predictCropPriceApi(payload);
      submitBtn.disabled = false;
      submitBtn.innerText = 'Calculate Estimated Price';
      resultDiv.style.display = 'block';

      resultDiv.innerHTML = `
        <div style="background: var(--bg-surface); border: 1px solid var(--primary-border); border-radius: var(--radius-lg); padding: 24px; text-align: center;">
          <span style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">
            AI Suggested Farm-Gate Price
          </span>
          <div style="font-size: 38px; font-weight: 800; color: #34d399; margin: 8px 0;">
            ₹${res.predicted_price.toFixed(2)} <span style="font-size: 16px; font-weight: 500; color: var(--text-muted);">/ ${res.unit || 'kg'}</span>
          </div>
          <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 16px;">
            Equivalent Mandi Benchmark: <strong>₹${(res.predicted_price * 100).toFixed(2)} / quintal</strong>
          </div>

          <!-- Model Evaluation Metrics Card -->
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; text-align: center; margin-bottom: 16px;">
            <div>
              <span style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Holdout MAE</span>
              <div style="font-size: 15px; font-weight: 700; color: #ffffff;">±₹1.84 / kg</div>
              <span style="font-size: 10px; color: var(--text-muted);">(±₹183.80/qtl)</span>
            </div>
            <div>
              <span style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Holdout RMSE</span>
              <div style="font-size: 15px; font-weight: 700; color: #ffffff;">±₹3.00 / kg</div>
              <span style="font-size: 10px; color: var(--text-muted);">(±₹300.36/qtl)</span>
            </div>
            <div>
              <span style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">R² Score</span>
              <div style="font-size: 15px; font-weight: 700; color: #34d399;">0.9635</div>
              <span style="font-size: 10px; color: var(--text-muted);">(52 records)</span>
            </div>
          </div>

          ${
            preselectedPricingCrop
              ? `
              <div style="margin: 16px 0;">
                <button id="btn-adopt-price" class="btn btn-primary" style="padding: 10px 24px; font-size: 14px;">
                  ✓ Adopt & Save ₹${res.predicted_price.toFixed(2)}/kg to Crop #${preselectedPricingCrop.crop_id}
                </button>
              </div>
              `
              : ''
          }

          <p style="font-size: 12px; color: var(--text-muted); max-width: 550px; margin: 0 auto 16px; line-height: 1.5;">
            * Note: Predictions are indicative benchmark estimates. Farmers retain independent authority to set their final selling price upon crop registration.
          </p>

          <div style="display: inline-flex; gap: 16px; font-size: 12px; color: var(--text-dim); border-top: 1px solid var(--border-color); padding-top: 12px; flex-wrap: wrap; justify-content: center;">
            <span>Model: ${res.model_name || 'Random Forest Regressor'}</span> &bull;
            <span>Currency: INR (₹)</span> &bull;
            <span>Date: ${res.prediction_date || 'Today'}</span>
          </div>
        </div>
      `;

      if (preselectedPricingCrop) {
        resultDiv.querySelector('#btn-adopt-price')?.addEventListener('click', async () => {
          const btn = resultDiv.querySelector('#btn-adopt-price');
          btn.disabled = true;
          btn.innerText = 'Saving Price to Crop...';
          try {
            const token = getToken();
            await updateFarmerPriceApi(preselectedPricingCrop.crop_id, res.predicted_price, token);
            toast.success(`Farm-gate price saved for Crop #${preselectedPricingCrop.crop_id} at ₹${Number(res.predicted_price).toFixed(2)}/kg!`, 'Farm-Gate Price Saved');
            preselectedPricingCrop = null;
            setTimeout(() => {
              activeSubTab = 'my-crops';
              renderFarmerView(parentContainer);
            }, 600);
          } catch (err) {
            btn.disabled = false;
            btn.innerText = 'Adopt & Save Price';
            toast.error('Failed to update crop price: ' + err.message, 'Price Save Error');
          }
        });
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Calculate Estimated Price';
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `
        <div style="background: var(--danger-subtle); border: 1px solid var(--danger-border); border-radius: var(--radius-md); padding: 14px; color: #fca5a5; font-size: 14px;">
          ${err.message || 'Prediction failed. Check backend connectivity.'}
        </div>
      `;
    }
  });
}

function renderFarmerTraceabilityView(container) {
  const initialId = preselectedTraceId || (cachedCrops[0] ? cachedCrops[0].crop_id : '');

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <div class="card-header">
        <div>
          <h3>Trace Harvest Provenance</h3>
          <p>Inspect the complete supply-chain journey and blockchain verification status</p>
        </div>
      </div>
      <div style="display: flex; gap: 10px; max-width: 500px;">
        <input type="number" id="farmer-trace-input" class="form-control" placeholder="Enter Crop ID (e.g. 1)" value="${initialId}" />
        <button id="farmer-btn-do-trace" class="btn btn-primary" style="white-space: nowrap;">
          ${icons.search} <span>Trace</span>
        </button>
      </div>
    </div>
    <div id="farmer-trace-result"></div>
  `;

  const traceInput = container.querySelector('#farmer-trace-input');
  const traceBtn = container.querySelector('#farmer-btn-do-trace');
  const resultDiv = container.querySelector('#farmer-trace-result');

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
