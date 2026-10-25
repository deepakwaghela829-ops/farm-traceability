// consumer.js - Public Consumer Verification Portal for AgriTrace OS
import { resolveCropProvenance, renderTraceabilityHTML } from './traceability.js';
import { icons } from './icons.js';

export async function initConsumerView(container, directCropId = null) {
  renderConsumerShell(container, directCropId);
}

function renderConsumerShell(container, initialCropId = null) {
  container.innerHTML = `
    <!-- Consumer Welcome & Search Shell (Section 14) -->
    <div style="max-width: 860px; margin: 20px auto 40px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background: var(--primary-subtle); border: 2px solid var(--primary-border); border-radius: 50%; color: var(--primary); font-size: 28px; margin-bottom: 16px;">
          ${icons.shieldCheck}
        </div>
        <h1 style="font-size: 32px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 8px;">
          Verify Your Product
        </h1>
        <p style="color: var(--text-muted); font-size: 16px; max-width: 580px; margin: 0 auto; line-height: 1.5;">
          Check where your agricultural product came from and follow its journey from cultivation to retail shelf.
        </p>
      </div>

      <!-- Search Card -->
      <div class="card" style="box-shadow: var(--shadow-lg); border-color: rgba(255,255,255,0.1); margin-bottom: 32px;">
        <form id="consumer-search-form" style="display: flex; gap: 12px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 240px; position: relative;">
            <input
              type="number"
              id="consumer-crop-input"
              class="form-control"
              placeholder="Enter Crop ID (e.g. 1)"
              value="${initialCropId || ''}"
              style="height: 50px; font-size: 16px; padding: 12px 18px;"
              required
              min="1"
            />
          </div>
          <button type="submit" id="consumer-btn-verify" class="btn btn-primary" style="height: 50px; padding: 12px 28px; font-size: 16px;">
            ${icons.search} <span>Verify Product</span>
          </button>
        </form>

        <div style="display: flex; gap: 10px; align-items: center; margin-top: 14px; font-size: 13px; color: var(--text-muted); flex-wrap: wrap;">
          <span style="font-weight: 600;">Sample Batches:</span>
          <a href="#/consumer/trace/1" class="quick-link btn btn-secondary btn-sm" style="padding: 4px 10px; font-size: 12px;">Crop #1</a>
          <a href="#/consumer/trace/2" class="quick-link btn btn-secondary btn-sm" style="padding: 4px 10px; font-size: 12px;">Crop #2</a>
          <a href="#/consumer/trace/3" class="quick-link btn btn-secondary btn-sm" style="padding: 4px 10px; font-size: 12px;">Crop #3</a>
          <span style="color: var(--text-dim); margin-left: auto;">Supported by Ganache Blockchain & FastAPI</span>
        </div>
      </div>

      <!-- Verification Result Container -->
      <div id="consumer-trace-output"></div>
    </div>
  `;

  const form = container.querySelector('#consumer-search-form');
  const input = container.querySelector('#consumer-crop-input');
  const output = container.querySelector('#consumer-trace-output');

  // Handle Quick Sample links
  container.querySelectorAll('.quick-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = link.getAttribute('href');
      const id = href.split('/').pop();
      input.value = id;
      window.location.hash = href;
      performVerification(id, output);
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = input.value.trim();
    if (id) {
      window.location.hash = `#/consumer/trace/${id}`;
      performVerification(id, output);
    }
  });

  if (initialCropId) {
    performVerification(initialCropId, output);
  }
}

async function performVerification(cropId, outputContainer) {
  outputContainer.innerHTML = `
    <div class="card" style="text-align: center; padding: 48px 16px;">
      <div style="display: inline-block; width: 40px; height: 40px; border: 3px solid var(--primary-border); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 16px;"></div>
      <h3 style="font-size: 18px; margin-bottom: 6px;">Verifying Origin & Provenance...</h3>
      <p style="color: var(--text-muted); font-size: 14px;">Querying agricultural ledger and smart contract for Crop #${cropId}...</p>
    </div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
  `;

  try {
    const result = await resolveCropProvenance(cropId);
    outputContainer.innerHTML = renderTraceabilityHTML(result);
  } catch (err) {
    outputContainer.innerHTML = `
      <div class="card" style="border-color: var(--danger-border); text-align: center; padding: 36px 16px;">
        <div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
        <h3 style="color: var(--danger); margin-bottom: 6px;">Verification Error</h3>
        <p style="color: var(--text-muted); font-size: 14px;">${err.message || 'Unable to complete verification inquiry.'}</p>
      </div>
    `;
  }
}
