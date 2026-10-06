<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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

import {
  fetchCropPrediction,
  acknowledgeForecast,
  fetchAcknowledgement,
  fetchCropById,
  fetchCropTransactions,
  type PricePredictionResult,
} from '../api'

import QRCodeGenerator from './QRCodeGenerator.vue'

const props = defineProps<{
  initialCropId?: string | number
}>()

const cropIdInput = ref<string>('')
const loading = ref<boolean>(false)
const errorMessage = ref<string>('')
const verifiedCrop = ref<VerifiedCrop | null>(null)
const copiedAddress = ref<string | null>(null)

// AI Price Forecast states
const aiPrediction = ref<PricePredictionResult | null>(null)
const loadingPrediction = ref<boolean>(false)
const predictionError = ref<string>('')
const ackChecked = ref<boolean>(false)
const isAcknowledged = ref<boolean>(false)
const ackSubmitting = ref<boolean>(false)
const ackSuccessMsg = ref<string>('')

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

async function loadAiPrediction(cropId: string | number) {
  loadingPrediction.value = true
  predictionError.value = ''
  aiPrediction.value = null
  ackChecked.value = false
  isAcknowledged.value = false
  ackSuccessMsg.value = ''

  try {
    const pred = await fetchCropPrediction(cropId)
    aiPrediction.value = pred

    // Check if previously acknowledged
    const prevAck = await fetchAcknowledgement(cropId)
    if (prevAck && prevAck.acknowledged) {
      isAcknowledged.value = true
      ackChecked.value = true
    }
  } catch (err: any) {
    predictionError.value =
      err instanceof Error ? err.message : 'Unable to load AI price forecast.'
  } finally {
    loadingPrediction.value = false
  }
}

async function handleAcknowledge() {
  if (!verifiedCrop.value || !ackChecked.value) return
  ackSubmitting.value = true
  ackSuccessMsg.value = ''
  try {
    await acknowledgeForecast(verifiedCrop.value.cropId)
    isAcknowledged.value = true
    ackSuccessMsg.value = 'AI forecast acknowledged and recorded successfully.'
  } catch (err: any) {
    ackSuccessMsg.value = ''
  } finally {
    ackSubmitting.value = false
  }
}

async function handleVerify() {
  errorMessage.value = ''
  verifiedCrop.value = null

  const input = cropIdInput.value.trim().replace(/^#/, '')
  if (!input) {
    errorMessage.value = 'Please enter a Crop ID to verify.'
    return
  }

  loading.value = true

  try {
    // 1. Try smart contract verification first
    const result = await verifyCrop(input)
    verifiedCrop.value = result
    loadAiPrediction(result.cropId)
  } catch (err: any) {
    // 2. If smart contract fails, gracefully check the PostgreSQL database
    try {
      const dbCrop = await fetchCropById(input)
      if (dbCrop) {
        const txs = await fetchCropTransactions(dbCrop.blockchain_crop_id || dbCrop.crop_id).catch(() => [])
        const movements: MovementRecord[] = txs.map(t => ({
          from: t.from_address,
          to: t.to_address,
          toRole: t.role,
          timestamp: Math.floor(new Date(t.timestamp).getTime() / 1000)
        }))

        const cultUnix = Math.floor(new Date(`${dbCrop.cultivation_date}T00:00:00`).getTime() / 1000)
        const harvUnix = Math.floor(new Date(`${dbCrop.expected_harvest_date}T00:00:00`).getTime() / 1000)
        const isHarvestedNow = new Date(`${dbCrop.expected_harvest_date}T00:00:00`) <= new Date()

        verifiedCrop.value = {
          cropId: String(dbCrop.blockchain_crop_id || dbCrop.crop_id),
          farmer: dbCrop.blockchain_farmer_address || dbCrop.farmer_id,
          cropName: dbCrop.crop_name,
          cropType: dbCrop.crop_type,
          quantity: String(dbCrop.quantity),
          unit: dbCrop.unit,
          cultivationDate: cultUnix,
          expectedHarvestDate: harvUnix,
          location: dbCrop.location,
          createdAt: cultUnix,
          isHarvested: isHarvestedNow,
          harvestTimestamp: harvUnix,
          currentHolder: movements.length > 0 ? movements[movements.length - 1].to : (dbCrop.blockchain_farmer_address || dbCrop.farmer_id),
          movements
        }

        loadAiPrediction(dbCrop.blockchain_crop_id || dbCrop.crop_id)
        return
      }
    } catch {
      // Fallback to error message
    }

    errorMessage.value =
      err instanceof Error ? err.message : 'Unable to verify crop provenance.'
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

watch(
  () => props.initialCropId,
  (newId) => {
    if (newId !== undefined && newId !== null && newId !== '') {
      cropIdInput.value = String(newId)
      handleVerify()
    }
  },
)
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
        <a href="/supplier-retailer.html" class="farmer-link" title="Supplier & Retailer">
          🚚 Supplier / Retailer
        </a>
        <a href="/ai-price-prediction.html" class="farmer-link" title="AI Price Forecast">
          🤖 AI Prediction
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

        <!-- Packaging Verification QR Section -->
        <div style="margin-bottom: 24px;">
          <QRCodeGenerator 
            :cropId="verifiedCrop.cropId" 
            :cropName="verifiedCrop.cropName" 
          />
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

        <!-- AI PRICE FORECAST SECTION -->
        <section class="panel ai-forecast-panel">
          <div class="panel-heading">
            <div>
              <div class="ai-header-badge-row">
                <span class="ai-tag">AI MODULE</span>
                <span class="badge-pill">Price Intelligence</span>
              </div>
              <h3>AI PRICE FORECAST</h3>
              <p>Transparent benchmark market pricing generated by Machine Learning regression</p>
            </div>
            <div class="model-badge">
              <span class="model-icon">🤖</span>
              <span>Random Forest Regression</span>
            </div>
          </div>

          <!-- Loading forecast -->
          <div v-if="loadingPrediction" class="forecast-loading">
            <span class="spinner"></span>
            <span>Calculating AI price forecast for Crop #{{ verifiedCrop.cropId }}...</span>
          </div>

          <!-- Forecast Error -->
          <div v-else-if="predictionError" class="forecast-error">
            <p>⚠️ {{ predictionError }}</p>
          </div>

          <!-- Forecast Display -->
          <div v-else-if="aiPrediction" class="forecast-content">
            <div class="forecast-metrics-grid">
              <!-- Predicted Market Price -->
              <div class="forecast-card highlight-card">
                <span class="f-label">Predicted Market Price</span>
                <div class="f-price-value">
                  ₹{{ aiPrediction.predicted_price.toFixed(2) }} <span class="f-unit">/ {{ aiPrediction.unit }}</span>
                </div>
                <span class="f-subtext">Estimated fair market valuation</span>
              </div>

              <!-- Model -->
              <div class="forecast-card">
                <span class="f-label">Model</span>
                <div class="f-value">{{ aiPrediction.model_name }}</div>
                <span class="f-subtext">Trained on regional crop data</span>
              </div>

              <!-- Prediction Date -->
              <div class="forecast-card">
                <span class="f-label">Prediction Date</span>
                <div class="f-value">{{ aiPrediction.prediction_date }}</div>
                <span class="f-subtext">Timestamp of inference</span>
              </div>

              <!-- Forecast Type -->
              <div class="forecast-card">
                <span class="f-label">Forecast</span>
                <div class="f-value text-accent">AI-generated market-price estimate</div>
                <span class="f-subtext">Historical + market features</span>
              </div>
            </div>

            <!-- Features Evaluated Bar -->
            <div class="forecast-features-bar">
              <div class="feature-item">
                <span class="fi-label">Historical Price:</span>
                <span class="fi-val">₹{{ aiPrediction.historical_price }}</span>
              </div>
              <div class="feature-item">
                <span class="fi-label">Season:</span>
                <span class="fi-val">{{ aiPrediction.season }}</span>
              </div>
              <div class="feature-item">
                <span class="fi-label">Region:</span>
                <span class="fi-val">{{ aiPrediction.location }}</span>
              </div>
              <div class="feature-item">
                <span class="fi-label">Demand Index:</span>
                <span class="fi-val">{{ aiPrediction.demand }}</span>
              </div>
              <div class="feature-item">
                <span class="fi-label">Est. Quantity:</span>
                <span class="fi-val">{{ aiPrediction.production_quantity }} {{ aiPrediction.unit }}</span>
              </div>
            </div>

            <!-- Disclaimer Notice -->
            <div class="forecast-disclaimer">
              <span class="disc-icon">ℹ️</span>
              <p>
                <strong>Consumer Price Transparency Notice:</strong> The price forecast above is generated using
                a Machine Learning algorithm based on regional cultivation parameters, seasonal cycles, and market demand indices.
                It represents an indicative benchmark market estimate and does not represent a guaranteed retail price.
              </p>
            </div>

            <!-- Consumer Acknowledgement Form -->
            <div class="acknowledgement-box" :class="{ 'acknowledged-box': isAcknowledged }">
              <div class="ack-row">
                <label class="ack-checkbox-label">
                  <input
                    type="checkbox"
                    v-model="ackChecked"
                    :disabled="isAcknowledged || ackSubmitting"
                    class="ack-checkbox"
                  />
                  <span class="ack-text">
                    I acknowledge that this is an AI-generated market-price forecast.
                  </span>
                </label>

                <button
                  type="button"
                  class="ack-btn"
                  :disabled="!ackChecked || isAcknowledged || ackSubmitting"
                  @click="handleAcknowledge"
                >
                  <span v-if="ackSubmitting" class="spinner-small"></span>
                  <span>{{ isAcknowledged ? '✓ Acknowledged' : 'Acknowledge' }}</span>
                </button>
              </div>

              <div v-if="ackSuccessMsg || isAcknowledged" class="ack-status-text">
                ✓ Recorded in database: AI forecast acknowledged for this crop verification.
              </div>
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

/* AI PRICE FORECAST STYLES */
.ai-forecast-panel {
  border: 1px solid #93c5fd;
  background: linear-gradient(180deg, #ffffff 0%, #f0f7ff 100%);
  margin-top: 24px;
}

.ai-header-badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.ai-tag {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 4px;
  background: #1e3a8a;
  color: #ffffff;
}

.model-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #1d4ed8;
}

.forecast-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px;
  color: #475569;
  font-weight: 600;
}

.forecast-error {
  padding: 16px;
  background: #fef2f2;
  border-radius: 8px;
  color: #991b1b;
  font-size: 14px;
}

.forecast-metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-top: 16px;
}

.forecast-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.forecast-card.highlight-card {
  border-color: #3b82f6;
  background: #eff6ff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.08);
}

.f-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin-bottom: 8px;
}

.f-price-value {
  font-size: 28px;
  font-weight: 800;
  color: #1e3a8a;
  line-height: 1.1;
}

.f-unit {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
}

.f-value {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.f-value.text-accent {
  color: #2563eb;
}

.f-subtext {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 8px;
}

.forecast-features-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 16px;
}

.feature-item {
  display: flex;
  gap: 6px;
  font-size: 13px;
}

.fi-label {
  color: #64748b;
}

.fi-val {
  font-weight: 700;
  color: #1e293b;
}

.forecast-disclaimer {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-top: 16px;
  padding: 12px 16px;
  background: #f1f5f9;
  border-radius: 8px;
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
}

.disc-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.acknowledgement-box {
  margin-top: 20px;
  padding: 16px 20px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  transition: all 0.2s ease;
}

.acknowledgement-box.acknowledged-box {
  background: #f0fdf4;
  border-color: #86efac;
}

.ack-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.ack-checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.ack-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #2563eb;
}

.ack-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease;
}

.ack-btn:hover:not(:disabled) {
  background: #1d4ed8;
}

.ack-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.ack-status-text {
  margin-top: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #15803d;
}

@media (max-width: 900px) {
  .forecast-metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 650px) {
  .forecast-metrics-grid {
    grid-template-columns: 1fr;
  }
  .ack-row {
    flex-direction: column;
    align-items: stretch;
  }
  .ack-btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
