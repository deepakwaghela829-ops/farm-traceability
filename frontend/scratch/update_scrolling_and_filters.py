# update_scrolling_and_filters.py
import re

# 1. Update farmer.js
farmer_path = r"C:\Projects\farm-traceability\frontend\js\farmer.js"
with open(farmer_path, "r", encoding="utf-8") as f:
    farmer = f.read().replace("\r\n", "\n")

old_farmer_mycrops = """  const rows = cachedCrops.map((c) => {
    const isChain = c.blockchain_crop_id != null;
    return `
      <tr>
        <td><strong style="color: var(--primary);">#${c.crop_id}</strong></td>
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

      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Batch ID</th>
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
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;"""

new_farmer_mycrops = """  const categories = [...new Set(cachedCrops.map((c) => c.crop_type).filter(Boolean))];

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
  statusSelect.addEventListener('change', filterFarmerRows);"""

farmer = farmer.replace(old_farmer_mycrops, new_farmer_mycrops)
with open(farmer_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(farmer)
print("Updated farmer.js successfully!")

# 2. Update supplier.js (table scrolling & dropdown format)
supplier_path = r"C:\Projects\farm-traceability\frontend\js\supplier.js"
with open(supplier_path, "r", encoding="utf-8") as f:
    supplier = f.read().replace("\r\n", "\n")

# Dropdown format in supplier.js
old_crop_options = """  const cropOptions = cachedCrops
    .map(
      (c) =>
        `<option value="${c.crop_id}" ${String(c.crop_id) === String(preselectedCropId) ? 'selected' : ''}>
          #${c.crop_id} - ${c.crop_name} (${c.quantity} ${c.unit}) ${c.blockchain_crop_id ? '[On-Chain #' + c.blockchain_crop_id + ']' : '[Off-Chain]'}
        </option>`
    )
    .join('');"""

new_crop_options = """  const cropOptions = cachedCrops
    .map((c) => {
      const batchCode = c.batch_number || `BATCH-2026-${String(c.crop_id).padStart(5, '0')}`;
      const chainLabel = c.blockchain_crop_id ? `On-chain #${c.blockchain_crop_id}` : 'Off-chain';
      // Format: Mango — BATCH-2026-00134 — 50 kg — On-chain #18
      const displayLabel = `${c.crop_name} — ${batchCode} — ${c.quantity} ${c.unit} — ${chainLabel}`;
      return `<option value="${c.crop_id}" data-search="${c.crop_name.toLowerCase()} ${batchCode.toLowerCase()} #${c.crop_id}" ${String(c.crop_id) === String(preselectedCropId) ? 'selected' : ''}>${displayLabel}</option>`;
    })
    .join('');"""
supplier = supplier.replace(old_crop_options, new_crop_options)

# Quick filter input for transfer dropdown in supplier.js
old_transfer_select = """        <!-- Step 1: Select Crop -->
        <div class="form-group">
          <label class="form-label" for="transfer-crop-id">1. Select Consignment <span style="color:var(--danger)">*</span></label>
          <select id="transfer-crop-id" class="form-control" required>
            <option value="">-- Choose Crop Consignment --</option>
            ${cropOptions}
          </select>
        </div>"""

new_transfer_select = """        <!-- Step 1: Select Crop -->
        <div class="form-group">
          <label class="form-label" for="transfer-crop-id">1. Select Consignment <span style="color:var(--danger)">*</span></label>
          <input type="text" id="transfer-crop-quicksearch" class="form-control" placeholder="Quick filter consignment options (type name, batch, ID)..." style="margin-bottom: 8px; height: 36px; font-size: 13px;" />
          <select id="transfer-crop-id" class="form-control" required>
            <option value="">-- Choose Crop Consignment --</option>
            ${cropOptions}
          </select>
        </div>"""
supplier = supplier.replace(old_transfer_select, new_transfer_select)

# Quick search event in supplier.js
old_supplier_form_bind = """  cropSelect.addEventListener('change', updateSummary);
  roleSelect.addEventListener('change', updateSummary);
  addressSelect.addEventListener('change', updateSummary);"""

new_supplier_form_bind = """  const cropQuickSearch = container.querySelector('#transfer-crop-quicksearch');
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
  addressSelect.addEventListener('change', updateSummary);"""
supplier = supplier.replace(old_supplier_form_bind, new_supplier_form_bind)

# Table scrollable container and toolbar in supplier.js renderIncomingCropsView
old_supplier_table = """    <!-- Table Card -->
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
                  <th>Batch ID</th>
                  <th>Crop Name</th>
                  <th>Quantity</th>
                  <th>Pricing Breakdown</th>
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
    </div>"""

new_supplier_table = """    <!-- Table Card -->
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
    </div>"""
supplier = supplier.replace(old_supplier_table, new_supplier_table)

# In supplier.js row mapping, add class & data attributes
old_supplier_row = """      <tr>
        <td>
          <div style="font-family: var(--font-mono); font-weight: 700; color: var(--primary); font-size: 13px;">${batchCode}</div>
          <div style="font-size: 11px; color: var(--text-dim);">DB #${c.crop_id} ${isChain ? `&bull; Chain #${c.blockchain_crop_id}` : ''}</div>
        </td>"""
new_supplier_row = """      <tr class="supplier-crop-row" 
          data-name="${(c.crop_name || '').toLowerCase()}" 
          data-batch="${batchCode.toLowerCase()}" 
          data-dbid="${c.crop_id}" 
          data-chainid="${c.blockchain_crop_id || ''}">
        <td>
          <div style="font-family: var(--font-mono); font-weight: 700; color: var(--primary); font-size: 13px;">${batchCode}</div>
          <div style="font-size: 11px; color: var(--text-dim);">DB #${c.crop_id} ${isChain ? `&bull; Chain #${c.blockchain_crop_id}` : ''}</div>
        </td>"""
supplier = supplier.replace(old_supplier_row, new_supplier_row)

# Add search filtering in supplier.js
old_supplier_buttons_bind = """  // Bind Buttons
  container.querySelectorAll('.supplier-btn-trace-crop').forEach((btn) => {"""

new_supplier_buttons_bind = """  // Bind Live Search in Supplier Incoming Crops
  const suppSearch = container.querySelector('#supplier-crop-search');
  const suppCount = container.querySelector('#supplier-crop-count');
  const suppRows = container.querySelectorAll('.supplier-crop-row');
  if (suppSearch) {
    suppSearch.addEventListener('input', () => {
      const q = (suppSearch.value || '').trim().toLowerCase();
      let count = 0;
      suppRows.forEach((tr) => {
        const name = tr.getAttribute('data-name');
        const batch = tr.getAttribute('data-batch');
        const dbId = tr.getAttribute('data-dbid');
        const chainId = tr.getAttribute('data-chainid');
        const show = !q || name.includes(q) || batch.includes(q) || dbId === q || (q.startsWith('#') && dbId === q.slice(1)) || chainId === q;
        tr.style.display = show ? '' : 'none';
        if (show) count++;
      });
      if (suppCount) suppCount.innerText = `Showing ${count} of ${cachedCrops.length} crops`;
    });
  }

  // Bind Buttons
  container.querySelectorAll('.supplier-btn-trace-crop').forEach((btn) => {"""
supplier = supplier.replace(old_supplier_buttons_bind, new_supplier_buttons_bind)

with open(supplier_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(supplier)
print("Updated supplier.js successfully!")

# 3. Update retailer.js (table scrolling & toolbar)
retailer_path = r"C:\Projects\farm-traceability\frontend\js\retailer.js"
with open(retailer_path, "r", encoding="utf-8") as f:
    retailer = f.read().replace("\r\n", "\n")

# In retailer.js row mapping, add data attributes
old_retailer_row = """      <tr style="${!isAvailable ? 'opacity: 0.65; background: rgba(0,0,0,0.15);' : ''}">
        <td>
          <div style="font-family: var(--font-mono); font-weight: 700; color: var(--primary); font-size: 13px;">${batchCode}</div>"""

new_retailer_row = """      <tr class="retailer-crop-row" 
          data-name="${(c.crop_name || '').toLowerCase()}" 
          data-batch="${batchCode.toLowerCase()}" 
          data-dbid="${c.crop_id}" 
          data-chainid="${c.blockchain_crop_id || ''}" 
          data-received="${isReceived ? 'received' : 'unreceived'}" 
          data-price="${isConfirmed ? 'confirmed' : 'pending'}" 
          data-available="${isAvailable ? 'active' : 'archived'}" 
          style="${!isAvailable ? 'opacity: 0.65; background: rgba(0,0,0,0.15);' : ''}">
        <td>
          <div style="font-family: var(--font-mono); font-weight: 700; color: var(--primary); font-size: 13px;">${batchCode}</div>"""
retailer = retailer.replace(old_retailer_row, new_retailer_row)

old_retailer_table = """          <div class="table-responsive">
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
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>"""

new_retailer_table = """          <!-- Retailer Crop Browsing Toolbar -->
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
          </div>"""
retailer = retailer.replace(old_retailer_table, new_retailer_table)

# Add event listeners for retailer live search
old_retailer_qr_bind = """  // Bind Generate QR
  container.querySelectorAll('.retailer-btn-qr').forEach((btn) => {"""

new_retailer_qr_bind = """  // Bind Live Search in Retailer Inventory
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
  container.querySelectorAll('.retailer-btn-qr').forEach((btn) => {"""
retailer = retailer.replace(old_retailer_qr_bind, new_retailer_qr_bind)

with open(retailer_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(retailer)
print("Updated retailer.js successfully!")

# 4. Update consumer.js (text input for batch code & crop id)
consumer_path = r"C:\Projects\farm-traceability\frontend\js\consumer.js"
with open(consumer_path, "r", encoding="utf-8") as f:
    consumer = f.read().replace("\r\n", "\n")

old_consumer_input = """            <input
              type="number"
              id="consumer-crop-input"
              class="form-control"
              placeholder="Enter Crop ID (e.g. 1)"
              value="${initialCropId || ''}"
              style="height: 50px; font-size: 16px; padding: 12px 18px;"
              required
              min="1"
            />"""

new_consumer_input = """            <input
              type="text"
              id="consumer-crop-input"
              class="form-control"
              placeholder="Enter Batch Code (e.g. BATCH-2026-00134) or Crop ID (e.g. 1)"
              value="${initialCropId || ''}"
              style="height: 50px; font-size: 15px; padding: 12px 18px;"
              required
            />"""

consumer = consumer.replace(old_consumer_input, new_consumer_input)
with open(consumer_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(consumer)
print("Updated consumer.js successfully!")
