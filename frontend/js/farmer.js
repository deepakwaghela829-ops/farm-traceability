// farmer.js - Farmer Portal Logic for AgriTrace OS
import { fetchCropsApi, createCropApi, predictCropPriceApi, fetchCropBenchmarksApi } from './api.js';
import { registerCropOnChain, getAccounts } from './blockchain.js';
import { resolveCropProvenance, renderTraceabilityHTML } from './traceability.js';
import { getToken, getCurrentUser } from './auth.js';
import { icons } from './icons.js';

let activeSubTab = 'dashboard';
let cachedCrops = [];
let preselectedTraceId = null;

export async function initFarmerView(container) {
  activeSubTab = 'dashboard';
  preselectedTraceId = null;
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
          <p>Register and track your agricultural products from cultivation to market.</p>
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
    renderPricingView(subviewContainer);
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
          <button class="btn btn-secondary btn-sm farmer-btn-trace-crop" data-id="${c.crop_id}">Trace</button>
          <button class="btn btn-primary btn-sm farmer-btn-price-crop" data-crop="${c.crop_type}" data-qty="${c.quantity}" data-loc="${c.location}">Price AI</button>
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

      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Crop Name & Type</th>
              <th>Quantity</th>
              <th>Cultivation Date</th>
              <th>Expected Harvest</th>
              <th>Location</th>
              <th>Blockchain Status</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Bind Trace
  container.querySelectorAll('.farmer-btn-trace-crop').forEach((btn) => {
    btn.addEventListener('click', () => {
      preselectedTraceId = btn.getAttribute('data-id');
      activeSubTab = 'traceability';
      renderFarmerView(parentContainer);
    });
  });

  // Bind Price AI
  container.querySelectorAll('.farmer-btn-price-crop').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeSubTab = 'pricing';
      renderFarmerView(parentContainer);
    });
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
            <label class="form-label" for="reg-crop-name">Crop / Product Name <span style="color:var(--danger)">*</span></label>
            <input type="text" id="reg-crop-name" class="form-control" placeholder="e.g. Organic Alphonso Mango" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-crop-type">Crop Type / Category <span style="color:var(--danger)">*</span></label>
            <select id="reg-crop-type" class="form-control" required>
              <option value="Mango">Mango</option>
              <option value="Banana">Banana</option>
              <option value="Tomato">Tomato</option>
              <option value="Rice">Rice</option>
              <option value="Wheat">Wheat</option>
              <option value="Apple">Apple</option>
              <option value="Potato">Potato</option>
              <option value="Other">Other</option>
            </select>
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

      <div id="reg-error-msg" style="display:none; padding:10px 14px; border-radius:6px; font-size:13px; margin-bottom:16px; background:var(--danger-subtle); border:1px solid var(--danger-border); color:#fca5a5;"></div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px; border-top:1px solid var(--border-color); padding-top:16px;">
        <button type="button" id="reg-cancel-btn" class="btn btn-secondary">Cancel</button>
        <button type="submit" id="reg-submit-btn" class="btn btn-primary" style="padding:10px 24px;">
          Register Crop
        </button>
      </div>
    </form>
  `;

  const form = body.querySelector('#farmer-register-form');
  const errorMsg = body.querySelector('#reg-error-msg');
  const submitBtn = body.querySelector('#reg-submit-btn');

  body.querySelector('#reg-cancel-btn').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerText = 'Creating Digital Identity...';
    errorMsg.style.display = 'none';

    const cropName = body.querySelector('#reg-crop-name').value.trim();
    const cropType = body.querySelector('#reg-crop-type').value.trim();
    const quantity = parseFloat(body.querySelector('#reg-crop-quantity').value);
    const unit = body.querySelector('#reg-crop-unit').value.trim();
    const cultivationDate = body.querySelector('#reg-cultivation-date').value;
    const expectedHarvest = body.querySelector('#reg-expected-harvest').value;
    const location = body.querySelector('#reg-location').value.trim();

    if (new Date(expectedHarvest) < new Date(cultivationDate)) {
      errorMsg.style.display = 'block';
      errorMsg.innerText = 'Expected harvest date cannot be earlier than cultivation date.';
      submitBtn.disabled = false;
      submitBtn.innerText = 'Register Crop';
      return;
    }

    try {
      const user = getCurrentUser();
      const token = getToken();

      // On-chain registration
      let chainRes = null;
      try {
        submitBtn.innerText = 'Broadcasting to Blockchain...';
        const accounts = await getAccounts();
        const signer = accounts[0] || user?.wallet_address;
        if (signer) {
          chainRes = await registerCropOnChain(
            {
              crop_name: cropName,
              crop_type: cropType,
              quantity,
              unit,
              cultivation_date: cultivationDate,
              expected_harvest_date: expectedHarvest,
              location,
            },
            signer
          );
        }
      } catch (err) {
        console.warn('Smart contract registration bypass/fallback:', err);
      }

      // Save in PostgreSQL Database
      submitBtn.innerText = 'Saving Crop Record...';
      const payload = {
        crop_name: cropName,
        crop_type: cropType,
        quantity,
        unit,
        cultivation_date: cultivationDate,
        expected_harvest_date: expectedHarvest,
        location,
        farmer_id: user?.username || 'farmer1',
        ...(chainRes
          ? {
              blockchain_crop_id: chainRes.blockchainCropId,
              blockchain_tx_hash: chainRes.txHash,
              blockchain_block_number: chainRes.blockNumber,
              blockchain_farmer_address: (await getAccounts())[0],
            }
          : {}),
      };

      const created = await createCropApi(payload, token);

      // Render Clean Success Card
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
              <span style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Blockchain Status</span>
              <div>
                ${
                  created.blockchain_crop_id
                    ? `<span class="badge badge-success">✓ On-Chain #${created.blockchain_crop_id}</span>`
                    : `<span class="badge badge-warning">• Database Record</span>`
                }
              </div>
            </div>
            <div style="grid-column: span 2; margin-top: 6px; border-top: 1px solid var(--border-color); padding-top: 10px;">
              <span style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Crop Name & Quantity</span>
              <div style="font-weight: 600;">${created.crop_name} (${created.quantity} ${created.unit})</div>
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

function renderPricingView(container) {
  container.innerHTML = `
    <div class="card" style="max-width: 800px; margin: 0 auto;">
      <div class="card-header">
        <div>
          <h3>AI Price Prediction</h3>
          <p>Estimate fair market value for your harvest using historical trend analysis</p>
        </div>
        <span class="badge badge-info">${icons.chart} Random Forest Regressor</span>
      </div>

      <form id="farmer-pricing-form">
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label" for="price-crop-type">Crop Type</label>
            <select id="price-crop-type" class="form-control">
              <option value="Banana">Banana</option>
              <option value="Tomato">Tomato</option>
              <option value="Rice">Rice</option>
              <option value="Wheat">Wheat</option>
              <option value="Mango">Mango</option>
              <option value="Apple">Apple</option>
              <option value="Potato">Potato</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="price-season">Season</label>
            <select id="price-season" class="form-control">
              <option value="Monsoon">Monsoon</option>
              <option value="Winter">Winter</option>
              <option value="Summer">Summer</option>
            </select>
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label" for="price-location">Location / District</label>
            <input type="text" id="price-location" class="form-control" value="Nashik" required />
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
            <input type="number" id="price-quantity" class="form-control" value="500" required />
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

  // Auto-fill benchmark on crop select
  cropSelect.addEventListener('change', async () => {
    try {
      const benchmark = await fetchCropBenchmarksApi(cropSelect.value);
      if (benchmark && benchmark.historical_price) {
        historyInput.value = benchmark.historical_price;
      }
    } catch {}
  });

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
            AI Estimated Reference Price
          </span>
          <div style="font-size: 36px; font-weight: 800; color: #34d399; margin: 8px 0;">
            ₹${res.predicted_price.toFixed(2)} <span style="font-size: 16px; font-weight: 500; color: var(--text-muted);">/ ${res.unit || 'kg'}</span>
          </div>
          <p style="font-size: 13px; color: var(--text-muted); max-width: 500px; margin: 0 auto 16px;">
            Reference estimate based on historical and market-related inputs.
          </p>
          <div style="display: inline-flex; gap: 16px; font-size: 12px; color: var(--text-dim); border-top: 1px solid var(--border-color); padding-top: 12px;">
            <span>Model: ${res.model_name || 'Random Forest'}</span> &bull;
            <span>Currency: INR (₹)</span> &bull;
            <span>Date: ${res.prediction_date || 'Today'}</span>
          </div>
        </div>
      `;
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
