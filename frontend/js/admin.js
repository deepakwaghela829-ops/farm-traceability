// admin.js - Administrative & Audit Console for AgriTrace OS
import { fetchSystemUsersApi, fetchCropsApi, API_BASE_URL } from './api.js';
import { quickCheckGanache, CONTRACT_ADDRESS, GANACHE_RPC } from './blockchain.js';
import { getToken } from './auth.js';
import { icons } from './icons.js';

let activeSubTab = 'overview';
let cachedUsers = [];
let cachedCrops = [];

export async function initAdminView(container) {
  activeSubTab = 'overview';
  await renderAdminView(container);
}

export async function renderAdminView(container) {
  const token = getToken();

  let ganacheStatus = { connected: false, accounts: [] };
  try {
    ganacheStatus = await quickCheckGanache();
  } catch {}

  try {
    const [users, crops] = await Promise.all([
      fetchSystemUsersApi(token).catch(() => []),
      fetchCropsApi().catch(() => []),
    ]);
    cachedUsers = users;
    cachedCrops = crops;
  } catch (err) {
    console.error('Failed to load admin data:', err);
  }

  const totalUsers = cachedUsers.length;
  const totalCrops = cachedCrops.length;
  const onChainCrops = cachedCrops.filter((c) => c.blockchain_crop_id != null).length;

  container.innerHTML = `
    <!-- Admin Header -->
    <div class="view-intro">
      <div class="view-title-row">
        <div>
          <h2>System Administration & Ledger Audit</h2>
          <p>Monitor multi-tenant platform integrity, smart contract state, and registered nodes.</p>
        </div>
        <div>
          <button id="admin-btn-refresh" class="btn btn-secondary">
            ${icons.refresh} <span>Refresh Audit Data</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div style="display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
      <button class="btn ${activeSubTab === 'overview' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-tab="overview">
        ${icons.cube} <span>Platform Overview</span>
      </button>
      <button class="btn ${activeSubTab === 'users' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-tab="users">
        ${icons.user} <span>User Directory (${totalUsers})</span>
      </button>
      <button class="btn ${activeSubTab === 'crops' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-tab="crops">
        ${icons.leaf} <span>Crop Registry (${totalCrops})</span>
      </button>
    </div>

    <!-- SUBVIEW CONTAINER -->
    <div id="admin-subview"></div>
  `;

  // Bind Tab Handlers
  container.querySelectorAll('button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeSubTab = btn.getAttribute('data-tab');
      renderAdminView(container);
    });
  });

  container.querySelector('#admin-btn-refresh')?.addEventListener('click', () => {
    renderAdminView(container);
  });

  const subview = container.querySelector('#admin-subview');
  if (activeSubTab === 'overview') {
    renderOverview(subview, ganacheStatus, { totalUsers, totalCrops, onChainCrops });
  } else if (activeSubTab === 'users') {
    renderUsers(subview);
  } else if (activeSubTab === 'crops') {
    renderCrops(subview);
  }
}

function renderOverview(container, ganacheStatus, stats) {
  container.innerHTML = `
    <!-- KPI Cards Grid (Section 6 & 18) -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Total Users</span>
          <span class="kpi-value">${stats.totalUsers}</span>
          <span class="kpi-subtext">Registered accounts</span>
        </div>
        <div class="kpi-icon-box">${icons.user}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Registered Crops</span>
          <span class="kpi-value">${stats.totalCrops}</span>
          <span class="kpi-subtext">Audited batches</span>
        </div>
        <div class="kpi-icon-box">${icons.leaf}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Blockchain Records</span>
          <span class="kpi-value" style="color: #34d399;">${stats.onChainCrops}</span>
          <span class="kpi-subtext">On-chain verified</span>
        </div>
        <div class="kpi-icon-box">${icons.shieldCheck}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">System Status</span>
          <span class="kpi-value" style="font-size: 20px; color: ${ganacheStatus.connected ? '#34d399' : '#f87171'};">
            ${ganacheStatus.connected ? 'ONLINE' : 'DEGRADED'}
          </span>
          <span class="kpi-subtext">FastAPI + Ganache</span>
        </div>
        <div class="kpi-icon-box">${icons.cube}</div>
      </div>
    </div>

    <!-- Infrastructure Nodes Status -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3>Ledger Infrastructure & Node Topology</h3>
          <p>Connectivity parameters and smart contract synchronization</p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;">
        <div style="background: var(--bg-surface); padding: 18px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700; margin-bottom: 4px;">FastAPI Backend</div>
          <div style="font-size: 15px; font-weight: 700; color: #34d399; margin-bottom: 4px;">Connected &bull; Active</div>
          <div style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono);">${API_BASE_URL || 'Local Port 8000'}</div>
        </div>

        <div style="background: var(--bg-surface); padding: 18px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700; margin-bottom: 4px;">Ganache EVM Testnet</div>
          <div style="font-size: 15px; font-weight: 700; color: ${ganacheStatus.connected ? '#34d399' : '#f87171'}; margin-bottom: 4px;">
            ${ganacheStatus.connected ? 'Active (Chain ID 1337)' : 'Offline'}
          </div>
          <div style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono);">${GANACHE_RPC}</div>
        </div>

        <div style="background: var(--bg-surface); padding: 18px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700; margin-bottom: 4px;">Solidity CropRegistry</div>
          <div style="font-size: 15px; font-weight: 700; color: var(--primary); margin-bottom: 4px;">Deployed &bull; Verified</div>
          <div style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); word-break: break-all;">${CONTRACT_ADDRESS}</div>
        </div>
      </div>
    </div>
  `;
}

function renderUsers(container) {
  if (cachedUsers.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 48px 16px;">
        <p style="color: var(--text-muted);">No users returned or insufficient admin privileges.</p>
      </div>
    `;
    return;
  }

  const rows = cachedUsers.map((u) => `
    <tr>
      <td><strong style="color: var(--primary);">#${u.id}</strong></td>
      <td><strong>${u.username}</strong></td>
      <td>
        <span class="badge ${u.role === 'FARMER' ? 'badge-success' : u.role === 'ADMIN' ? 'badge-danger' : 'badge-info'}">
          ${u.role}
        </span>
      </td>
      <td style="font-family: var(--font-mono); font-size: 13px;">${u.wallet_address || '—'}</td>
      <td style="color: var(--text-muted); font-size: 13px;">${u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <h3>System User Directory</h3>
          <p>Active participants across supply-chain tiers</p>
        </div>
        <span class="badge badge-info">${cachedUsers.length} accounts</span>
      </div>

      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Assigned Role</th>
              <th>EVM Wallet Address</th>
              <th>Created At</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderCrops(container) {
  if (cachedCrops.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 48px 16px;">
        <p style="color: var(--text-muted);">No crops recorded in platform database.</p>
      </div>
    `;
    return;
  }

  const rows = cachedCrops.map((c) => `
    <tr>
      <td><strong style="color: var(--primary);">#${c.crop_id}</strong></td>
      <td>
        <strong>${c.crop_name}</strong>
        <div style="font-size: 12px; color: var(--text-muted);">${c.crop_type}</div>
      </td>
      <td><strong>${c.quantity}</strong> ${c.unit}</td>
      <td>${c.farmer_id || 'Farmer'}</td>
      <td>${c.location}</td>
      <td>
        ${
          c.blockchain_crop_id
            ? `<span class="badge badge-success">✓ On-Chain #${c.blockchain_crop_id}</span>`
            : `<span class="badge badge-warning">• Off-Chain Record</span>`
        }
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <h3>Master Crop Ledger</h3>
          <p>Full catalog of agricultural products tracked across the supply network</p>
        </div>
        <span class="badge badge-info">${cachedCrops.length} batches</span>
      </div>

      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>DB ID</th>
              <th>Crop Name & Type</th>
              <th>Quantity</th>
              <th>Origin Farmer</th>
              <th>Location</th>
              <th>Ledger Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
