// app.js - Master Application Controller & Hash Router for AgriTrace OS
import { checkSession, getCurrentUser, login, logout, getToken } from './auth.js';
import { initFarmerView } from './farmer.js';
import { initSupplierView } from './supplier.js';
import { initRetailerView } from './retailer.js';
import { initConsumerView } from './consumer.js';
import { initAdminView } from './admin.js';
import { icons } from './icons.js';

const appState = {
  currentRoute: '',
  currentUser: null,
};

// Global Unified Notification & Modal Dialog System
export { showToast, toast, showConfirmDialog, showPrerequisiteDialog } from './notifications.js';
import { showToast, toast, showConfirmDialog, showPrerequisiteDialog } from './notifications.js';

// Route Definition & Controller
async function handleRouting() {
  const hash = window.location.hash || '#/consumer';
  appState.currentRoute = hash;

  // Sync user session state
  const user = getCurrentUser();
  appState.currentUser = user;
  updateTopNav(user);

  // Close mobile sidebar if open
  const sidebar = document.getElementById('app-sidebar');
  if (sidebar) sidebar.classList.remove('open');

  // Hide all view panels
  const views = ['login', 'farmer', 'supplier', 'retailer', 'consumer', 'admin'];
  views.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = 'none';
  });

  // If login view, hide sidebar for centered two-column auth experience
  if (hash === '#/login') {
    if (sidebar) sidebar.style.display = 'none';
    if (user) {
      redirectToRolePortal(user.role);
      return;
    }
    showView('login');
    renderLoginView();
    return;
  }

  // Restore sidebar for all other views
  if (sidebar) sidebar.style.display = 'flex';

  // Update Sidebar Navigation based on current view / role
  updateSidebarNav(hash, user);

  // Handle direct crop/batch query string (e.g. ?batch=BATCH-2026-00017, ?crop_id=12, ?cropId=12, ?id=12, ?chain_id=7)
  const urlSearch = new URLSearchParams(window.location.search);
  let directTarget = null;
  let directType = null;

  if (urlSearch.get('batch') || urlSearch.get('batch_number')) {
    directTarget = urlSearch.get('batch') || urlSearch.get('batch_number');
    directType = 'batch';
  } else if (urlSearch.get('chain_id') || urlSearch.get('chainId')) {
    directTarget = urlSearch.get('chain_id') || urlSearch.get('chainId');
    directType = 'blockchain';
  } else if (urlSearch.get('crop_id') || urlSearch.get('cropId') || urlSearch.get('id')) {
    directTarget = urlSearch.get('crop_id') || urlSearch.get('cropId') || urlSearch.get('id');
    directType = 'db';
  }

  if (!directTarget && hash.includes('?')) {
    const hashParams = new URLSearchParams(hash.split('?')[1]);
    if (hashParams.get('batch') || hashParams.get('batch_number')) {
      directTarget = hashParams.get('batch') || hashParams.get('batch_number');
      directType = 'batch';
    } else if (hashParams.get('chain_id') || hashParams.get('chainId')) {
      directTarget = hashParams.get('chain_id') || hashParams.get('chainId');
      directType = 'blockchain';
    } else if (hashParams.get('crop_id') || hashParams.get('cropId') || hashParams.get('id')) {
      directTarget = hashParams.get('crop_id') || hashParams.get('cropId') || hashParams.get('id');
      directType = 'db';
    }
  }

  if (directTarget && (hash.startsWith('#/consumer') || !window.location.hash || hash === '#/')) {
    const cleanTarget = decodeURIComponent(directTarget.trim());
    showView('consumer');
    const container = document.getElementById('view-consumer');
    await initConsumerView(container, cleanTarget, directType);
    return;
  }

  // Handle Hash Matching (supports string batch numbers like BATCH-2026-00017, numeric IDs, and type hints)
  if (hash.startsWith('#/consumer/trace/') || hash.startsWith('#trace-')) {
    const rawPath = hash.startsWith('#trace-')
      ? hash.replace('#trace-', '')
      : hash.replace('#/consumer/trace/', '');
    
    let rawTarget = rawPath;
    let explicitType = null;
    if (rawPath.includes('?')) {
      const parts = rawPath.split('?');
      rawTarget = parts[0];
      const hParams = new URLSearchParams(parts[1]);
      explicitType = hParams.get('type') || hParams.get('id_type');
    }

    let cleanTarget = decodeURIComponent(rawTarget).trim();

    // Check for explicit namespace prefixes (e.g. chain:7, chain-7, db:17, db-17, batch:BATCH-...)
    if (/^chain[-:]/i.test(cleanTarget)) {
      explicitType = 'blockchain';
      cleanTarget = cleanTarget.replace(/^chain[-:]/i, '');
    } else if (/^db[-:]/i.test(cleanTarget)) {
      explicitType = 'db';
      cleanTarget = cleanTarget.replace(/^db[-:]/i, '');
    } else if (/^batch:/i.test(cleanTarget)) {
      explicitType = 'batch';
      cleanTarget = cleanTarget.replace(/^batch:/i, '');
    }

    showView('consumer');
    const container = document.getElementById('view-consumer');
    await initConsumerView(container, cleanTarget || null, explicitType);
    return;
  }

  if (hash === '#/consumer') {
    showView('consumer');
    const container = document.getElementById('view-consumer');
    await initConsumerView(container);
    return;
  }

  // Protected Views
  if (!user) {
    window.location.hash = '#/login';
    return;
  }

  if (hash === '#/farmer') {
    showView('farmer');
    const container = document.getElementById('view-farmer');
    await initFarmerView(container);
  } else if (hash === '#/supplier') {
    showView('supplier');
    const container = document.getElementById('view-supplier');
    await initSupplierView(container);
  } else if (hash === '#/retailer') {
    showView('retailer');
    const container = document.getElementById('view-retailer');
    await initRetailerView(container);
  } else if (hash === '#/admin') {
    showView('admin');
    const container = document.getElementById('view-admin');
    await initAdminView(container);
  } else {
    redirectToRolePortal(user.role);
  }
}

function showView(viewName) {
  const el = document.getElementById(`view-${viewName}`);
  if (el) {
    el.style.display = 'block';
  }
}

function redirectToRolePortal(role) {
  const normRole = (role || '').toUpperCase();
  if (normRole === 'FARMER') {
    window.location.hash = '#/farmer';
  } else if (normRole === 'SUPPLIER') {
    window.location.hash = '#/supplier';
  } else if (normRole === 'RETAILER') {
    window.location.hash = '#/retailer';
  } else if (normRole === 'ADMIN') {
    window.location.hash = '#/admin';
  } else {
    window.location.hash = '#/consumer';
  }
}

function updateTopNav(user) {
  const userContainer = document.getElementById('header-user-status');
  if (!userContainer) return;

  if (user) {
    userContainer.innerHTML = `
      <div style="text-align: right; line-height: 1.2;">
        <div style="font-weight: 600; font-size: 14px; color: #ffffff;">${user.username}</div>
        <span class="badge ${user.role === 'FARMER' ? 'badge-success' : user.role === 'ADMIN' ? 'badge-danger' : 'badge-info'} badge-role" style="margin-top: 2px;">
          ${user.role}
        </span>
      </div>
      <button id="btn-sign-out" class="btn btn-secondary btn-sm" title="Sign Out">
        ${icons.logout}
        <span>Sign Out</span>
      </button>
    `;

    const signoutBtn = userContainer.querySelector('#btn-sign-out');
    if (signoutBtn) {
      signoutBtn.addEventListener('click', () => {
        logout();
        showToast('Signed out successfully.', 'info');
        handleRouting();
      });
    }
  } else {
    userContainer.innerHTML = `
      <a href="#/login" class="btn btn-primary btn-sm">
        ${icons.user}
        <span>Sign In</span>
      </a>
    `;
  }
}

function updateSidebarNav(hash, user) {
  const sidebar = document.getElementById('app-sidebar');
  if (!sidebar) return;

  const isConsumer = hash.startsWith('#/consumer');
  const role = (user?.role || '').toUpperCase();

  let html = '';

  if (isConsumer || !user) {
    // Consumer Navigation
    html = `
      <div class="sidebar-heading">Public Verification</div>
      <a href="#/consumer" class="sidebar-nav-item active">
        <span class="sidebar-icon">${icons.search}</span>
        <span>Verify Product</span>
      </a>
      <a href="#/consumer" class="sidebar-nav-item" onclick="document.querySelector('#consumer-crop-input')?.focus();">
        <span class="sidebar-icon">${icons.qr}</span>
        <span>Scan / Enter ID</span>
      </a>
      <div class="sidebar-heading">Portals</div>
      <a href="#/login" class="sidebar-nav-item">
        <span class="sidebar-icon">${icons.user}</span>
        <span>Partner Sign In</span>
      </a>
    `;
  } else if (role === 'FARMER') {
    html = `
      <div class="sidebar-heading">Farmer Portal</div>
      <a href="#/farmer" class="sidebar-nav-item active" data-action="tab-dashboard">
        <span class="sidebar-icon">${icons.leaf}</span>
        <span>Dashboard</span>
      </a>
      <a href="#/farmer" class="sidebar-nav-item" data-action="tab-my-crops">
        <span class="sidebar-icon">${icons.store}</span>
        <span>My Crops</span>
      </a>
      <a href="#/farmer" class="sidebar-nav-item" data-action="open-register">
        <span class="sidebar-icon">${icons.plus}</span>
        <span>Register Crop</span>
      </a>
      <a href="#/farmer" class="sidebar-nav-item" data-action="tab-pricing">
        <span class="sidebar-icon">${icons.chart}</span>
        <span>Price Prediction</span>
      </a>
      <a href="#/farmer" class="sidebar-nav-item" data-action="tab-traceability">
        <span class="sidebar-icon">${icons.shieldCheck}</span>
        <span>Traceability</span>
      </a>
      <div class="sidebar-heading">Public</div>
      <a href="#/consumer" class="sidebar-nav-item">
        <span class="sidebar-icon">${icons.search}</span>
        <span>Consumer View</span>
      </a>
    `;
  } else if (role === 'SUPPLIER') {
    html = `
      <div class="sidebar-heading">Supplier Portal</div>
      <a href="#/supplier" class="sidebar-nav-item active" data-action="tab-crops">
        <span class="sidebar-icon">${icons.truck}</span>
        <span>Dashboard</span>
      </a>
      <a href="#/supplier" class="sidebar-nav-item" data-action="tab-crops">
        <span class="sidebar-icon">${icons.store}</span>
        <span>Incoming Crops</span>
      </a>
      <a href="#/supplier" class="sidebar-nav-item" data-action="tab-transfer">
        <span class="sidebar-icon">${icons.arrowRight}</span>
        <span>Custody Transfer</span>
      </a>
      <a href="#/supplier" class="sidebar-nav-item" data-action="tab-traceability">
        <span class="sidebar-icon">${icons.shieldCheck}</span>
        <span>Traceability</span>
      </a>
      <div class="sidebar-heading">Public</div>
      <a href="#/consumer" class="sidebar-nav-item">
        <span class="sidebar-icon">${icons.search}</span>
        <span>Consumer View</span>
      </a>
    `;
  } else if (role === 'RETAILER') {
    html = `
      <div class="sidebar-heading">Retailer Portal</div>
      <a href="#/retailer" class="sidebar-nav-item active" data-action="tab-inventory">
        <span class="sidebar-icon">${icons.store}</span>
        <span>Dashboard</span>
      </a>
      <a href="#/retailer" class="sidebar-nav-item" data-action="tab-inventory">
        <span class="sidebar-icon">${icons.leaf}</span>
        <span>Store Inventory</span>
      </a>
      <a href="#/retailer" class="sidebar-nav-item" data-action="tab-inventory">
        <span class="sidebar-icon">${icons.qr}</span>
        <span>Generate QR</span>
      </a>
      <a href="#/retailer" class="sidebar-nav-item" data-action="tab-traceability">
        <span class="sidebar-icon">${icons.shieldCheck}</span>
        <span>Traceability</span>
      </a>
      <div class="sidebar-heading">Public</div>
      <a href="#/consumer" class="sidebar-nav-item">
        <span class="sidebar-icon">${icons.search}</span>
        <span>Consumer View</span>
      </a>
    `;
  } else if (role === 'ADMIN') {
    html = `
      <div class="sidebar-heading">Administration</div>
      <a href="#/admin" class="sidebar-nav-item active" data-action="tab-overview">
        <span class="sidebar-icon">${icons.cube}</span>
        <span>Dashboard</span>
      </a>
      <a href="#/admin" class="sidebar-nav-item" data-action="tab-users">
        <span class="sidebar-icon">${icons.user}</span>
        <span>User Directory</span>
      </a>
      <a href="#/admin" class="sidebar-nav-item" data-action="tab-crops">
        <span class="sidebar-icon">${icons.leaf}</span>
        <span>Crop Registry</span>
      </a>
      <div class="sidebar-heading">Other Portals</div>
      <a href="#/farmer" class="sidebar-nav-item">
        <span class="sidebar-icon">${icons.leaf}</span>
        <span>Farmer Portal</span>
      </a>
      <a href="#/supplier" class="sidebar-nav-item">
        <span class="sidebar-icon">${icons.truck}</span>
        <span>Supplier Portal</span>
      </a>
      <a href="#/retailer" class="sidebar-nav-item">
        <span class="sidebar-icon">${icons.store}</span>
        <span>Retailer Portal</span>
      </a>
      <a href="#/consumer" class="sidebar-nav-item">
        <span class="sidebar-icon">${icons.search}</span>
        <span>Consumer View</span>
      </a>
    `;
  }

  sidebar.innerHTML = html;

  // Bind Sidebar Item Actions
  sidebar.querySelectorAll('.sidebar-nav-item[data-action]').forEach((item) => {
    item.addEventListener('click', (e) => {
      sidebar.querySelectorAll('.sidebar-nav-item').forEach((n) => n.classList.remove('active'));
      item.classList.add('active');

      const action = item.getAttribute('data-action');
      if (action === 'open-register') {
        const regBtn = document.getElementById('farmer-btn-open-register');
        if (regBtn) regBtn.click();
      } else if (action?.startsWith('tab-')) {
        const tabKey = action.replace('tab-', '');
        const targetBtn = document.querySelector(`button[data-tab="${tabKey}"]`);
        if (targetBtn) targetBtn.click();
      }
    });
  });
}

function renderLoginView() {
  const container = document.getElementById('view-login');
  if (!container) return;

  container.innerHTML = `
    <div class="auth-split-wrapper">
      <!-- Left Hero Pane -->
      <div class="auth-hero-pane">
        <div>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
            <div class="brand-icon-box" style="width:48px;height:48px;font-size:24px;">
              ${icons.leaf}
            </div>
            <div>
              <h1 style="font-size:24px;margin:0;">AgriTrace <span class="brand-os">OS</span></h1>
              <span style="font-size:13px;color:var(--text-muted);">Decentralized Provenance Platform</span>
            </div>
          </div>
          <h2 style="font-size:22px;margin-bottom:12px;color:#ffffff;line-height:1.3;">
            Farm-to-Consumer Agricultural Traceability
          </h2>
          <p style="font-size:14px;color:var(--text-secondary);line-height:1.6;">
            A unified digital ecosystem linking farmers, suppliers, retailers, and consumers through cryptographic transparency and AI market analytics.
          </p>

          <ul class="auth-feature-list">
            <li class="auth-feature-item">
              <div class="auth-feature-check">✓</div>
              <div>
                <strong>Immutable Crop Traceability</strong>
                <div style="font-size:12px;color:var(--text-muted);">Verifiable journey from farm sowing to retail shelving</div>
              </div>
            </li>
            <li class="auth-feature-item">
              <div class="auth-feature-check">✓</div>
              <div>
                <strong>Blockchain Custody Verification</strong>
                <div style="font-size:12px;color:var(--text-muted);">Smart contract provenance recorded on Ethereum/Ganache</div>
              </div>
            </li>
            <li class="auth-feature-item">
              <div class="auth-feature-check">✓</div>
              <div>
                <strong>AI Price Prediction</strong>
                <div style="font-size:12px;color:var(--text-muted);">Machine learning reference estimates for fair farmer earnings</div>
              </div>
            </li>
          </ul>
        </div>

        <div style="font-size:12px;color:var(--text-dim);border-top:1px solid var(--border-color);padding-top:16px;">
          College Final Year Engineering Project &bull; Built with FastAPI, PostgreSQL, Ganache & Solidity
        </div>
      </div>

      <!-- Right Form Pane -->
      <div class="auth-form-pane">
        <div style="margin-bottom:24px;">
          <h2 style="font-size:22px;margin-bottom:4px;">Sign In</h2>
          <p style="font-size:13px;color:var(--text-muted);">Access your role-specific supply chain portal</p>
        </div>

        <form id="app-login-form">
          <div class="form-group">
            <label class="form-label" for="login-username">Username</label>
            <input type="text" id="login-username" class="form-control" placeholder="e.g. farmer1" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="login-password">Password</label>
            <input type="password" id="login-password" class="form-control" placeholder="••••••••" required />
          </div>

          <div id="login-error-msg" style="display: none; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; background: var(--danger-subtle); border: 1px solid var(--danger-border); color: #fca5a5;"></div>

          <button type="submit" id="login-submit-btn" class="btn btn-primary" style="width: 100%; height: 44px; font-size: 15px; margin-bottom: 24px;">
            Sign In to Portal
          </button>
        </form>

        <!-- Quick Demo Accounts -->
        <div style="border-top: 1px solid var(--border-color); padding-top: 20px;">
          <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 10px;">
            Quick Demo Accounts (Demo12345!):
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button class="btn btn-secondary btn-sm quick-login-btn" data-user="farmer1">
              ${icons.leaf} <span>Farmer</span>
            </button>
            <button class="btn btn-secondary btn-sm quick-login-btn" data-user="supplier1">
              ${icons.truck} <span>Supplier</span>
            </button>
            <button class="btn btn-secondary btn-sm quick-login-btn" data-user="retailer1">
              ${icons.store} <span>Retailer</span>
            </button>
            <button class="btn btn-secondary btn-sm quick-login-btn" data-user="admin1">
              ${icons.user} <span>Admin</span>
            </button>
          </div>

          <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px dashed var(--border-color);">
            <a href="#/consumer" style="font-size: 14px; font-weight: 500;">
              Consumer? <span style="color: var(--primary);">Continue to Public Verification &rarr;</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  `;

  const form = container.querySelector('#app-login-form');
  const userField = container.querySelector('#login-username');
  const passField = container.querySelector('#login-password');
  const errorMsg = container.querySelector('#login-error-msg');
  const submitBtn = container.querySelector('#login-submit-btn');

  // Quick buttons
  container.querySelectorAll('.quick-login-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      userField.value = btn.getAttribute('data-user');
      passField.value = 'Demo12345!';
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerText = 'Signing In...';
    errorMsg.style.display = 'none';

    try {
      const data = await login(userField.value.trim(), passField.value.trim());
      showToast(`Welcome back, ${data.user.username}!`, 'success');
      redirectToRolePortal(data.user.role);
    } catch (err) {
      errorMsg.style.display = 'block';
      errorMsg.innerText = err.message || 'Invalid username or password.';
      submitBtn.disabled = false;
      submitBtn.innerText = 'Sign In to Portal';
    }
  });
}

// Global App Initialization
window.addEventListener('DOMContentLoaded', async () => {
  // Mobile sidebar drawer toggle
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const sidebar = document.getElementById('app-sidebar');
      if (sidebar) sidebar.classList.toggle('open');
    });
  }

  // Check active session
  await checkSession();

  // Listen to hash changes
  window.addEventListener('hashchange', handleRouting);

  // Initial Route Dispatch
  await handleRouting();
});
