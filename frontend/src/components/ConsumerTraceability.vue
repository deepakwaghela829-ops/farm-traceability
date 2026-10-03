<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  verifyCrop,
  formatDate,
  formatDateTime,
  truncateAddress,
  type VerifiedCrop,
  type MovementRecord,
  GANACHE_RPC,
  CONTRACT_ADDRESS,
} from '../consumerTraceability'

const props = defineProps<{
  initialCropId?: string | number
}>()

const cropIdInput = ref<string>('')
const loading = ref<boolean>(false)
const errorMessage = ref<string>('')
const verifiedCrop = ref<VerifiedCrop | null>(null)
const copiedAddress = ref<string | null>(null)

// Find supplier movement if present
const supplierMovement = computed<MovementRecord | undefined>(() => {
  if (!verifiedCrop.value) return undefined
  return verifiedCrop.value.movements.find((m) =>
    m.toRole.trim().toLowerCase().includes('supplier'),
  )
})

// Find retailer movement if present
const retailerMovement = computed<MovementRecord | undefined>(() => {
  if (!verifiedCrop.value) return undefined
  return verifiedCrop.value.movements.find((m) =>
    m.toRole.trim().toLowerCase().includes('retailer'),
  )
})

// Current holder role description
const currentHolderRole = computed<string>(() => {
  if (!verifiedCrop.value) return ''
  const holder = verifiedCrop.value.currentHolder.toLowerCase()
  const farmer = verifiedCrop.value.farmer.toLowerCase()

  if (holder === farmer) {
    return 'Farmer (Original Producer)'
  }

  // Find most recent movement matching the holder
  const matchingMovement = [...verifiedCrop.value.movements]
    .reverse()
    .find((m) => m.to.toLowerCase() === holder)

  if (matchingMovement) {
    return `${matchingMovement.toRole} (Current Custodian)`
  }

  return 'Authorized Custodian'
})

async function handleVerify() {
  errorMessage.value = ''
  verifiedCrop.value = null

  const input = cropIdInput.value.trim()
  if (!input) {
    errorMessage.value = 'Please enter a Crop ID to verify.'
    return
  }

  loading.value = true

  try {
    const result = await verifyCrop(input)
    verifiedCrop.value = result
  } catch (err: any) {
    errorMessage.value =
      err instanceof Error ? err.message : 'Unable to verify crop.'
  } finally {
    loading.value = false
  }
}

function copyToClipboard(text: string) {
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
    copiedAddress.value = text
    setTimeout(() => {
      if (copiedAddress.value === text) {
        copiedAddress.value = null
      }
    }, 2000)
  }
}

onMounted(() => {
  // Check URL query parameters for cropId (e.g. ?cropId=1)
  const urlParams = new URLSearchParams(window.location.search)
  const urlCropId = urlParams.get('cropId') || urlParams.get('id')

  if (props.initialCropId) {
    cropIdInput.value = String(props.initialCropId)
    handleVerify()
  } else if (urlCropId) {
    cropIdInput.value = urlCropId
    handleVerify()
  }
})
</script>

<template>
  <div class="consumer-app app-shell">
    <!-- Top Bar Header -->
    <header class="topbar">
      <div>
        <span class="eyebrow">FARM TRACEABILITY · CONSUMER PORTAL</span>
        <h1>Product Verification</h1>
        <p>
          Verify crop authenticity and trace the complete farm-to-table journey
          directly from the Ethereum blockchain.
        </p>
      </div>

      <div class="header-actions">
        <a href="/" class="farmer-link" title="Switch to Farmer Portal">
          🌾 Farmer Portal
        </a>
        <div class="network-chip">
          <span class="dot"></span>
          Ganache 1337
        </div>
      </div>
    </header>

    <main class="content">
      <!-- Search Verification Section -->
      <section class="hero-card search-card">
        <div class="search-intro">
          <span class="section-kicker">CONSUMER VERIFICATION</span>
          <h2>Verify a Product</h2>
          <p>
            Enter the unique Crop ID found on the product packaging or QR code.
          </p>
        </div>

        <form class="search-form" @submit.prevent="handleVerify">
          <div class="search-input-wrap">
            <span class="search-prefix">ID #</span>
            <input
              v-model="cropIdInput"
              type="text"
              class="search-input"
              placeholder="e.g. 1"
              autocomplete="off"
              :disabled="loading"
            />
          </div>

          <button
            type="submit"
            class="verify-btn"
            :disabled="loading || !cropIdInput.trim()"
          >
            <span v-if="loading" class="spinner"></span>
            <span>{{ loading ? 'Verifying...' : 'Verify Product' }}</span>
          </button>
        </form>
      </section>

      <!-- Loading State -->
      <section v-if="loading" class="panel state-panel loading-state">
        <div class="spinner-large"></div>
        <div class="state-text">
          <h3>Querying Ethereum Blockchain...</h3>
          <p>
            Reading crop registration, harvest status, and movement history from
            smart contract at <code>{{ truncateAddress(CONTRACT_ADDRESS) }}</code>.
          </p>
        </div>
      </section>

      <!-- Error State -->
      <section v-else-if="errorMessage" class="panel state-panel error-state">
        <div class="state-icon error-icon">✕</div>
        <div class="state-text">
          <h3>Verification Failed</h3>
          <p class="error-msg">{{ errorMessage }}</p>
          <p class="error-hint">
            Please ensure you have entered a valid registered Crop ID and that
            the Ganache blockchain is running at
            <code>{{ GANACHE_RPC }}</code>.
          </p>
        </div>
      </section>

      <!-- Verification Result -->
      <section v-else-if="verifiedCrop" class="verification-container">
        <!-- Verification Success Banner -->
        <div class="status-banner">
          <div class="status-badge-icon">✓</div>
          <div class="status-badge-info">
            <div class="badge-title-row">
              <span class="status-badge verified">Blockchain Verified</span>
              <span class="status-crop-id">Crop #{{ verifiedCrop.cropId }}</span>
            </div>
            <h2>{{ verifiedCrop.cropName }}</h2>
            <p>
              Authentic crop record verified on Ethereum (Chain ID: 1337). All
              history is immutably sealed on-chain.
            </p>
          </div>
          <div class="status-holder-preview">
            <span class="preview-label">Current Custody</span>
            <span class="preview-role">{{ currentHolderRole }}</span>
            <span class="preview-addr" :title="verifiedCrop.currentHolder">
              {{ truncateAddress(verifiedCrop.currentHolder) }}
            </span>
          </div>
        </div>

        <!-- 11 Key Crop Specifications Grid -->
        <div class="panel specs-panel">
          <div class="panel-heading">
            <div>
              <h3>Crop Specifications & Details</h3>
              <p>Authentic data read directly from the CropRegistry smart contract</p>
            </div>
            <span class="badge-pill">Smart Contract Data</span>
          </div>

          <div class="specs-grid">
            <!-- 1. Crop ID -->
            <div class="spec-card">
              <span class="spec-label">1. Crop ID</span>
              <span class="spec-value highlight">#{{ verifiedCrop.cropId }}</span>
            </div>

            <!-- 2. Crop Name -->
            <div class="spec-card">
              <span class="spec-label">2. Crop Name</span>
              <span class="spec-value">{{ verifiedCrop.cropName }}</span>
            </div>

            <!-- 3. Crop Type -->
            <div class="spec-card">
              <span class="spec-label">3. Crop Type</span>
              <span class="spec-value">{{ verifiedCrop.cropType }}</span>
            </div>

            <!-- 4. Quantity + Unit -->
            <div class="spec-card">
              <span class="spec-label">4. Quantity</span>
              <span class="spec-value">{{ verifiedCrop.quantity }} {{ verifiedCrop.unit }}</span>
            </div>

            <!-- 5. Farmer Address -->
            <div class="spec-card full-col">
              <span class="spec-label">5. Farmer Blockchain Address</span>
              <div class="address-copy-row">
                <span class="spec-value mono" :title="verifiedCrop.farmer">
                  {{ verifiedCrop.farmer }}
                </span>
                <button
                  type="button"
                  class="copy-btn"
                  @click="copyToClipboard(verifiedCrop.farmer)"
                  title="Copy Farmer Address"
                >
                  {{ copiedAddress === verifiedCrop.farmer ? 'Copied!' : 'Copy' }}
                </button>
              </div>
            </div>

            <!-- 6. Location -->
            <div class="spec-card">
              <span class="spec-label">6. Farm Location</span>
              <span class="spec-value">{{ verifiedCrop.location }}</span>
            </div>

            <!-- 7. Cultivation Date -->
            <div class="spec-card">
              <span class="spec-label">7. Cultivation Date</span>
              <span class="spec-value">{{ formatDate(verifiedCrop.cultivationDate) }}</span>
            </div>

            <!-- 8. Expected Harvest Date -->
            <div class="spec-card">
              <span class="spec-label">8. Expected Harvest Date</span>
              <span class="spec-value">{{ formatDate(verifiedCrop.expectedHarvestDate) }}</span>
            </div>

            <!-- 9. Harvest Status -->
            <div class="spec-card">
              <span class="spec-label">9. Harvest Status</span>
              <span
                class="status-pill"
                :class="verifiedCrop.isHarvested ? 'harvested' : 'pending'"
              >
                {{ verifiedCrop.isHarvested ? '✓ Harvested' : '⏳ In Cultivation' }}
              </span>
            </div>

            <!-- 10. Harvest Date When Available -->
            <div class="spec-card">
              <span class="spec-label">10. Harvest Date</span>
              <span class="spec-value">
                {{
                  verifiedCrop.isHarvested
                    ? formatDateTime(verifiedCrop.harvestTimestamp)
                    : 'Not yet harvested'
                }}
              </span>
            </div>

            <!-- 11. Current Holder -->
            <div class="spec-card full-col">
              <div class="label-with-role">
                <span class="spec-label">11. Current Holder Address</span>
                <span class="role-tag">{{ currentHolderRole }}</span>
              </div>
              <div class="address-copy-row">
                <span class="spec-value mono" :title="verifiedCrop.currentHolder">
                  {{ verifiedCrop.currentHolder }}
                </span>
                <button
                  type="button"
                  class="copy-btn"
                  @click="copyToClipboard(verifiedCrop.currentHolder)"
                  title="Copy Current Holder Address"
                >
                  {{ copiedAddress === verifiedCrop.currentHolder ? 'Copied!' : 'Copy' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 12. Complete Movement Timeline -->
        <section class="panel timeline-panel">
          <div class="panel-heading">
            <div>
              <span class="section-kicker">END-TO-END TRACEABILITY</span>
              <h3>12. Complete Crop Journey Timeline</h3>
              <p>Chronological chain-of-custody milestones verified on-chain</p>
            </div>
            <span class="scope-badge">Solidity Verified</span>
          </div>

          <!-- Structured Journey Flow: Farmer -> Crop Registered -> Harvested -> Supplier -> Retailer -->
          <div class="timeline-stepper">
            <!-- Step 1: Farmer -->
            <div class="stepper-item completed">
              <div class="stepper-marker">
                <span class="marker-icon">👨‍🌾</span>
              </div>
              <div class="stepper-content">
                <div class="stepper-header">
                  <h4>Farmer</h4>
                  <span class="step-badge completed">Origin Farm</span>
                </div>
                <p class="stepper-desc">
                  Cultivated at <strong>{{ verifiedCrop.location }}</strong>.
                </p>
                <div class="stepper-meta">
                  <span class="meta-item">
                    <strong>Farmer:</strong>
                    <code>{{ truncateAddress(verifiedCrop.farmer) }}</code>
                  </span>
                  <span class="meta-item">
                    <strong>Cultivation:</strong>
                    {{ formatDate(verifiedCrop.cultivationDate) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Arrow Down 1 -->
            <div class="stepper-arrow">
              <div class="arrow-line"></div>
              <span class="arrow-char">↓</span>
            </div>

            <!-- Step 2: Crop Registered -->
            <div class="stepper-item completed">
              <div class="stepper-marker">
                <span class="marker-icon">📜</span>
              </div>
              <div class="stepper-content">
                <div class="stepper-header">
                  <h4>Crop Registered</h4>
                  <span class="step-badge completed">On-Chain Sealed</span>
                </div>
                <p class="stepper-desc">
                  Registered <strong>{{ verifiedCrop.quantity }} {{ verifiedCrop.unit }}</strong> of
                  <strong>{{ verifiedCrop.cropName }}</strong> ({{ verifiedCrop.cropType }}).
                </p>
                <div class="stepper-meta">
                  <span class="meta-item">
                    <strong>Crop ID:</strong> #{{ verifiedCrop.cropId }}
                  </span>
                  <span class="meta-item">
                    <strong>Registered At:</strong>
                    {{ formatDateTime(verifiedCrop.createdAt) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Arrow Down 2 -->
            <div class="stepper-arrow">
              <div class="arrow-line"></div>
              <span class="arrow-char">↓</span>
            </div>

            <!-- Step 3: Harvested -->
            <div
              class="stepper-item"
              :class="verifiedCrop.isHarvested ? 'completed' : 'pending'"
            >
              <div class="stepper-marker">
                <span class="marker-icon">🌾</span>
              </div>
              <div class="stepper-content">
                <div class="stepper-header">
                  <h4>Harvested</h4>
                  <span
                    class="step-badge"
                    :class="verifiedCrop.isHarvested ? 'completed' : 'pending'"
                  >
                    {{ verifiedCrop.isHarvested ? 'Harvest Confirmed' : 'Pending Harvest' }}
                  </span>
                </div>
                <p class="stepper-desc">
                  <template v-if="verifiedCrop.isHarvested">
                    Crop successfully harvested and marked on the blockchain by farmer.
                  </template>
                  <template v-else>
                    Crop is currently cultivating in the field. Expected harvest date:
                    <strong>{{ formatDate(verifiedCrop.expectedHarvestDate) }}</strong>.
                  </template>
                </p>
                <div class="stepper-meta">
                  <span v-if="verifiedCrop.isHarvested" class="meta-item">
                    <strong>Harvest Timestamp:</strong>
                    {{ formatDateTime(verifiedCrop.harvestTimestamp) }}
                  </span>
                  <span v-else class="meta-item">
                    <strong>Expected:</strong>
                    {{ formatDate(verifiedCrop.expectedHarvestDate) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Arrow Down 3 -->
            <div class="stepper-arrow">
              <div class="arrow-line"></div>
              <span class="arrow-char">↓</span>
            </div>

            <!-- Step 4: Supplier -->
            <div
              class="stepper-item"
              :class="supplierMovement ? 'completed' : 'pending'"
            >
              <div class="stepper-marker">
                <span class="marker-icon">🚚</span>
              </div>
              <div class="stepper-content">
                <div class="stepper-header">
                  <h4>Supplier</h4>
                  <span
                    class="step-badge"
                    :class="supplierMovement ? 'completed' : 'pending'"
                  >
                    {{ supplierMovement ? 'Transferred to Supplier' : 'Pending Transfer' }}
                  </span>
                </div>

                <div v-if="supplierMovement" class="movement-details-box">
                  <div class="detail-row">
                    <span class="detail-label">From:</span>
                    <code class="detail-addr" :title="supplierMovement.from">
                      {{ truncateAddress(supplierMovement.from, 8, 6) }}
                    </code>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">To:</span>
                    <code class="detail-addr" :title="supplierMovement.to">
                      {{ truncateAddress(supplierMovement.to, 8, 6) }}
                    </code>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Role:</span>
                    <span class="detail-text bold">{{ supplierMovement.toRole }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Date/Time:</span>
                    <span class="detail-text">{{ formatDateTime(supplierMovement.timestamp) }}</span>
                  </div>
                </div>

                <p v-else class="stepper-desc pending-desc">
                  No transfer to supplier recorded on-chain yet. Product remains under farmer custody.
                </p>
              </div>
            </div>

            <!-- Arrow Down 4 -->
            <div class="stepper-arrow">
              <div class="arrow-line"></div>
              <span class="arrow-char">↓</span>
            </div>

            <!-- Step 5: Retailer -->
            <div
              class="stepper-item"
              :class="retailerMovement ? 'completed' : 'pending'"
            >
              <div class="stepper-marker">
                <span class="marker-icon">🏪</span>
              </div>
              <div class="stepper-content">
                <div class="stepper-header">
                  <h4>Retailer</h4>
                  <span
                    class="step-badge"
                    :class="retailerMovement ? 'completed' : 'pending'"
                  >
                    {{ retailerMovement ? 'Delivered to Retailer' : 'Pending Delivery' }}
                  </span>
                </div>

                <div v-if="retailerMovement" class="movement-details-box">
                  <div class="detail-row">
                    <span class="detail-label">From:</span>
                    <code class="detail-addr" :title="retailerMovement.from">
                      {{ truncateAddress(retailerMovement.from, 8, 6) }}
                    </code>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">To:</span>
                    <code class="detail-addr" :title="retailerMovement.to">
                      {{ truncateAddress(retailerMovement.to, 8, 6) }}
                    </code>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Role:</span>
                    <span class="detail-text bold">{{ retailerMovement.toRole }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Date/Time:</span>
                    <span class="detail-text">{{ formatDateTime(retailerMovement.timestamp) }}</span>
                  </div>
                </div>

                <p v-else class="stepper-desc pending-desc">
                  No transfer to retailer recorded on-chain yet.
                </p>
              </div>
            </div>
          </div>

          <!-- All Movement Transfers Log -->
          <div class="all-movements-section">
            <div class="panel-heading movements-heading">
              <div>
                <h4>All Recorded Product Movements ({{ verifiedCrop.movements.length }})</h4>
                <p>Granular custody transfer ledger from smart contract</p>
              </div>
            </div>

            <div v-if="verifiedCrop.movements.length === 0" class="empty-movements">
              <span class="empty-icon">ℹ️</span>
              <p>
                No intermediary movements recorded yet on the blockchain.
                The product is currently in the custody of the original Farmer:
                <code>{{ truncateAddress(verifiedCrop.farmer) }}</code>.
              </p>
            </div>

            <div v-else class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Role</th>
                    <th>Date / Time</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(movement, idx) in verifiedCrop.movements"
                    :key="idx"
                  >
                    <td>
                      <span class="movement-idx">{{ idx + 1 }}</span>
                    </td>
                    <td>
                      <div class="cell-addr">
                        <code :title="movement.from">{{ truncateAddress(movement.from) }}</code>
                        <button
                          type="button"
                          class="copy-icon-btn"
                          @click="copyToClipboard(movement.from)"
                          title="Copy address"
                        >
                          📋
                        </button>
                      </div>
                    </td>
                    <td>
                      <div class="cell-addr">
                        <code :title="movement.to">{{ truncateAddress(movement.to) }}</code>
                        <button
                          type="button"
                          class="copy-icon-btn"
                          @click="copyToClipboard(movement.to)"
                          title="Copy address"
                        >
                          📋
                        </button>
                      </div>
                    </td>
                    <td>
                      <span class="role-badge">{{ movement.toRole }}</span>
                    </td>
                    <td>
                      <span class="datetime-text">{{ formatDateTime(movement.timestamp) }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </section>
    </main>
  </div>
</template>

<style scoped>
.consumer-app {
  min-height: 100vh;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.farmer-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  color: white;
  text-decoration: none;
  font-size: 13px;
  font-weight: 700;
  transition: all 0.2s ease;
}

.farmer-link:hover {
  background: rgba(255, 255, 255, 0.22);
  transform: translateY(-1px);
}

.network-chip {
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  font-weight: 700;
  font-size: 13px;
  color: white;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

/* Search Card */
.search-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.search-intro h2 {
  margin: 6px 0;
  font-size: 26px;
  color: #0f172a;
}

.search-intro p {
  margin: 0;
  color: #64748b;
  font-size: 14px;
}

.search-form {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 340px;
}

.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
}

.search-prefix {
  position: absolute;
  left: 14px;
  font-weight: 800;
  color: #94a3b8;
  font-size: 14px;
  pointer-events: none;
}

.search-input {
  width: 100%;
  min-height: 48px;
  padding: 10px 14px 10px 48px;
  border: 1.5px solid #cbd5e1;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  background: #ffffff;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.search-input:focus {
  border-color: #0f172a;
  box-shadow: 0 0 0 4px rgba(15, 23, 42, 0.08);
}

.verify-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  padding: 12px 22px;
  background: #0f172a;
  color: #ffffff;
  border: 0;
  border-radius: 12px;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
  transition: transform 0.15s, background-color 0.15s;
  white-space: nowrap;
}

.verify-btn:hover:not(:disabled) {
  background: #1e293b;
  transform: translateY(-1px);
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-large {
  width: 38px;
  height: 38px;
  border: 3px solid #cbd5e1;
  border-top-color: #0f172a;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* State Panels */
.state-panel {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 32px;
  margin-top: 20px;
}

.state-panel.loading-state {
  background: #f8fafc;
}

.state-panel.error-state {
  background: #fef2f2;
  border-color: #fecaca;
}

.state-icon.error-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #fee2e2;
  color: #b91c1c;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 900;
  flex-shrink: 0;
}

.state-text h3 {
  margin: 0 0 6px;
  font-size: 18px;
  color: #0f172a;
}

.state-panel.error-state .state-text h3 {
  color: #991b1b;
}

.state-text p {
  margin: 0;
  font-size: 14px;
  color: #475569;
}

.state-text .error-msg {
  font-weight: 700;
  color: #b91c1c;
}

.state-text .error-hint {
  margin-top: 8px;
  font-size: 13px;
  color: #64748b;
}

.verification-container {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Status Banner */
.status-banner {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
  border-radius: 20px;
  background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%);
  color: #ffffff;
  box-shadow: 0 12px 30px rgba(6, 78, 59, 0.15);
}

.status-badge-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #34d399;
  color: #064e3b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 900;
  flex-shrink: 0;
}

.status-badge-info {
  flex: 1;
}

.badge-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.status-badge.verified {
  padding: 4px 10px;
  border-radius: 999px;
  background: #a7f3d0;
  color: #065f46;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-crop-id {
  font-weight: 800;
  font-size: 13px;
  color: #6ee7b7;
}

.status-badge-info h2 {
  margin: 4px 0 6px;
  font-size: 26px;
  line-height: 1.1;
}

.status-badge-info p {
  margin: 0;
  font-size: 13px;
  color: #d1fae5;
  max-width: 520px;
}

.status-holder-preview {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.2);
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  min-width: 170px;
}

.preview-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #a7f3d0;
  font-weight: 700;
}

.preview-role {
  font-weight: 800;
  font-size: 13px;
  color: #ffffff;
  margin: 2px 0;
}

.preview-addr {
  font-family: monospace;
  font-size: 12px;
  color: #d1fae5;
}

/* Specs Panel */
.specs-panel {
  padding: 24px;
}

.badge-pill {
  padding: 6px 12px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  font-size: 11px;
  font-weight: 700;
}

.specs-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.spec-card {
  padding: 14px 16px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.spec-card.full-col {
  grid-column: span 2;
}

.spec-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.spec-value {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  word-break: break-all;
}

.spec-value.highlight {
  color: #047857;
  font-size: 18px;
}

.spec-value.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
}

.address-copy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.copy-btn {
  padding: 4px 10px;
  border-radius: 6px;
  background: #e2e8f0;
  color: #1e293b;
  font-size: 11px;
  font-weight: 700;
  border: 0;
  cursor: pointer;
  flex-shrink: 0;
}

.copy-btn:hover {
  background: #cbd5e1;
}

.label-with-role {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.role-tag {
  font-size: 11px;
  font-weight: 800;
  color: #0369a1;
  background: #e0f2fe;
  padding: 2px 8px;
  border-radius: 999px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  width: fit-content;
}

.status-pill.harvested {
  background: #dcfce7;
  color: #15803d;
}

.status-pill.pending {
  background: #fef3c7;
  color: #b45309;
}

/* Timeline Panel */
.timeline-panel {
  padding: 26px;
}

.timeline-stepper {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
}

.stepper-item {
  display: flex;
  gap: 20px;
  padding: 16px 20px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  transition: border-color 0.2s;
}

.stepper-item.completed {
  border-color: #bbf7d0;
  background: #fcfdfc;
}

.stepper-item.pending {
  border-color: #e2e8f0;
  background: #fbfbfc;
  opacity: 0.85;
}

.stepper-marker {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: #f1f5f9;
  flex-shrink: 0;
}

.stepper-item.completed .stepper-marker {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
}

.stepper-content {
  flex: 1;
}

.stepper-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.stepper-header h4 {
  margin: 0;
  font-size: 17px;
  color: #0f172a;
}

.step-badge {
  font-size: 11px;
  font-weight: 800;
  padding: 3px 9px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.step-badge.completed {
  background: #dcfce7;
  color: #166534;
}

.step-badge.pending {
  background: #f1f5f9;
  color: #64748b;
}

.stepper-desc {
  margin: 4px 0 10px;
  font-size: 14px;
  color: #475569;
}

.stepper-desc.pending-desc {
  color: #94a3b8;
  font-style: italic;
}

.stepper-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 12px;
  color: #64748b;
}

.meta-item strong {
  color: #334155;
}

.meta-item code {
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.stepper-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 4px 0 4px 22px;
  width: 44px;
  color: #10b981;
}

.arrow-line {
  width: 2px;
  height: 18px;
  background: #86efac;
}

.arrow-char {
  font-size: 18px;
  line-height: 1;
  font-weight: 900;
  margin-top: -2px;
}

/* Movement details box inside stepper */
.movement-details-box {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.detail-label {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  min-width: 75px;
}

.detail-addr {
  font-family: monospace;
  font-size: 12px;
  color: #0f172a;
  background: #ffffff;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}

.detail-text {
  color: #334155;
}

.detail-text.bold {
  font-weight: 800;
  color: #1d4ed8;
}

/* All Movements Section */
.all-movements-section {
  margin-top: 36px;
  padding-top: 24px;
  border-top: 1px solid #e2e8f0;
}

.movements-heading {
  margin-bottom: 16px;
}

.movements-heading h4 {
  margin: 0 0 4px;
  font-size: 16px;
  color: #0f172a;
}

.movements-heading p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.empty-movements {
  padding: 24px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  display: flex;
  align-items: center;
  gap: 12px;
  color: #475569;
  font-size: 13px;
}

.empty-movements code {
  font-family: monospace;
  background: #ffffff;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}

.cell-addr {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cell-addr code {
  font-family: monospace;
  font-size: 12px;
}

.copy-icon-btn {
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 2px;
  font-size: 13px;
}

.role-badge {
  padding: 3px 8px;
  border-radius: 6px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.datetime-text {
  font-size: 13px;
  color: #475569;
}

.movement-idx {
  font-weight: 800;
  color: #64748b;
  font-size: 12px;
}

@media (max-width: 900px) {
  .specs-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .spec-card.full-col {
    grid-column: span 2;
  }
  .status-banner {
    flex-direction: column;
    align-items: flex-start;
  }
  .status-holder-preview {
    align-items: flex-start;
    width: 100%;
  }
}

@media (max-width: 650px) {
  .search-card {
    flex-direction: column;
    align-items: stretch;
  }
  .search-form {
    min-width: 100%;
    flex-direction: column;
  }
  .verify-btn {
    width: 100%;
  }
  .specs-grid {
    grid-template-columns: 1fr;
  }
  .spec-card.full-col {
    grid-column: auto;
  }
  .header-actions {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
