<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { fetchCropById, fetchCropTransactions, fetchCropPrediction, type CropRecord, type SupplyChainTransaction, type PricePredictionResult } from '../api'
import StatusBadge from './StatusBadge.vue'
import QRCodeGenerator from './QRCodeGenerator.vue'

const props = defineProps<{
  cropId: number | string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'viewTraceability', id: number | string): void
}>()

const loading = ref(true)
const error = ref('')
const crop = ref<CropRecord | null>(null)
const transactions = ref<SupplyChainTransaction[]>([])
const prediction = ref<PricePredictionResult | null>(null)

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const cropData = await fetchCropById(props.cropId)
    crop.value = cropData

    const targetId = cropData.blockchain_crop_id || cropData.crop_id

    // Fetch transactions & prediction in parallel
    const [txs, pred] = await Promise.allSettled([
      fetchCropTransactions(targetId),
      fetchCropPrediction(targetId),
    ])

    if (txs.status === 'fulfilled') {
      transactions.value = txs.value
    }
    if (pred.status === 'fulfilled') {
      prediction.value = pred.value
    }
  } catch (err: any) {
    error.value = err.message || 'Unable to load crop details.'
  } finally {
    loading.value = false
  }
}

function formatDate(val: string) {
  if (!val) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(val.includes('T') ? val : `${val}T00:00:00`))
}

function formatAddress(addr?: string | null) {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <div class="header-left">
          <div class="header-badge">Crop Record #{{ cropId }}</div>
          <h2>{{ crop?.crop_name || 'Loading Crop Details...' }}</h2>
        </div>
        <button class="close-btn" @click="emit('close')">&times;</button>
      </div>

      <div class="modal-body">
        <div v-if="loading" class="state-container">
          <div class="spinner"></div>
          <p>Loading crop records from database and blockchain...</p>
        </div>

        <div v-else-if="error" class="state-container error">
          <span class="icon">⚠️</span>
          <p>{{ error }}</p>
          <button class="btn-retry" @click="loadData">Try Again</button>
        </div>

        <div v-else-if="crop" class="modal-content">
          <!-- Overview Cards -->
          <div class="overview-grid">
            <div class="info-tile">
              <span class="label">Crop Type</span>
              <span class="value">{{ crop.crop_type }}</span>
            </div>
            <div class="info-tile">
              <span class="label">Total Quantity</span>
              <span class="value highlight">{{ crop.quantity }} {{ crop.unit }}</span>
            </div>
            <div class="info-tile">
              <span class="label">Farmer ID</span>
              <span class="value font-mono">{{ crop.farmer_id }}</span>
            </div>
            <div class="info-tile">
              <span class="label">Farm Location</span>
              <span class="value">{{ crop.location }}</span>
            </div>
          </div>

          <!-- Dates & Status Banner -->
          <div class="status-banner">
            <div class="date-group">
              <div class="date-item">
                <span class="subtext">Cultivation Date</span>
                <strong>{{ formatDate(crop.cultivation_date) }}</strong>
              </div>
              <div class="arrow-divider">➔</div>
              <div class="date-item">
                <span class="subtext">Expected Harvest</span>
                <strong>{{ formatDate(crop.expected_harvest_date) }}</strong>
              </div>
            </div>
            <div class="badge-wrapper">
              <StatusBadge 
                :cultivationDate="crop.cultivation_date" 
                :expectedHarvestDate="crop.expected_harvest_date" 
              />
            </div>
          </div>

          <!-- Blockchain Verification Badge -->
          <div class="blockchain-box">
            <div class="blockchain-title">
              <span class="chain-icon">⛓️</span>
              <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong>Ethereum Blockchain Sync</strong>
                  <span 
                    class="badge" 
                    :class="crop.blockchain_crop_id && crop.blockchain_tx_hash ? 'badge-success' : 'badge-neutral'"
                  >
                    {{ crop.blockchain_crop_id && crop.blockchain_tx_hash ? '✓ FULLY SYNCHRONIZED' : 'DATABASE VERIFIED (OFF-CHAIN)' }}
                  </span>
                </div>
                <p class="chain-sub">Decentralized ledger verification state</p>
              </div>
            </div>
            <div class="chain-details">
              <div class="chain-col">
                <span class="chain-label">Blockchain Crop ID:</span>
                <span class="chain-val">#{{ crop.blockchain_crop_id ?? 'Pending / Off-chain' }}</span>
              </div>
              <div class="chain-col">
                <span class="chain-label">Contract Address:</span>
                <span class="chain-val font-mono">{{ formatAddress(crop.blockchain_contract_address) }}</span>
              </div>
              <div class="chain-col" v-if="crop.blockchain_tx_hash">
                <span class="chain-label">Registration Tx:</span>
                <span class="chain-val font-mono">{{ formatAddress(crop.blockchain_tx_hash) }}</span>
              </div>
            </div>
          </div>

          <!-- AI Prediction Forecast (if available) -->
          <div v-if="prediction" class="ai-box">
            <div class="ai-header">
              <span class="ai-badge">AI Price Intelligence</span>
              <span class="ai-model">{{ prediction.model_name }}</span>
            </div>
            <div class="ai-body">
              <div>
                <span class="ai-label">Predicted Fair Market Price:</span>
                <div class="ai-price">{{ prediction.currency }} {{ Number(prediction.predicted_price).toFixed(2) }} / {{ prediction.unit }}</div>
              </div>
              <div class="ai-meta">
                <span>Historical Baseline: ₹{{ prediction.historical_price }}</span>
                <span>Demand Index: {{ prediction.demand }}</span>
              </div>
            </div>
          </div>

          <!-- Consumer Traceability Packaging QR Code -->
          <div class="qr-section">
            <QRCodeGenerator 
              :cropId="crop.blockchain_crop_id || crop.crop_id" 
              :cropName="crop.crop_name" 
            />
          </div>

          <!-- Supply Chain Provenance Timeline -->
          <div class="timeline-section">
            <h3>Supply Chain Journey</h3>
            <p class="timeline-sub">Verified custody steps recorded on the ledger</p>

            <div class="timeline-flow">
              <div class="flow-item completed">
                <div class="step-circle">🌾</div>
                <div class="step-content">
                  <div class="step-role">FARMER (Harvest Origin)</div>
                  <div class="step-desc">Crop registered and cultivated at {{ crop.location }}</div>
                  <div class="step-time">{{ formatDate(crop.cultivation_date) }}</div>
                </div>
              </div>

              <!-- Registered database transactions if any -->
              <div 
                v-for="(tx, idx) in transactions" 
                :key="tx.id" 
                class="flow-item completed"
              >
                <div class="step-circle">🚚</div>
                <div class="step-content">
                  <div class="step-role">{{ tx.role.toUpperCase() }} HANDOVER</div>
                  <div class="step-desc font-mono">To: {{ formatAddress(tx.to_address) }}</div>
                  <div class="step-time">{{ formatDate(tx.timestamp) }} (Tx: {{ formatAddress(tx.tx_hash) }})</div>
                </div>
              </div>

              <!-- Next stages pending -->
              <div v-if="transactions.length === 0" class="flow-item pending">
                <div class="step-circle">🏢</div>
                <div class="step-content">
                  <div class="step-role">SUPPLIER / DISTRIBUTOR</div>
                  <div class="step-desc">Awaiting wholesale transfer & quality check</div>
                </div>
              </div>

              <div class="flow-item pending">
                <div class="step-circle">🛒</div>
                <div class="step-content">
                  <div class="step-role">RETAILER & CONSUMER</div>
                  <div class="step-desc">Consumer QR verification & final sale</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button 
          v-if="crop" 
          class="btn-primary" 
          @click="emit('viewTraceability', crop.blockchain_crop_id || crop.crop_id)"
        >
          View Full Public Traceability ➔
        </button>
        <button class="btn-secondary" @click="emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 1000;
  animation: fadeIn 0.15s ease-out;
}

.modal-card {
  background: #ffffff;
  border-radius: 20px;
  max-width: 750px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.modal-header {
  padding: 24px 28px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid #e2e8f0;
}

.header-badge {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #059669;
  margin-bottom: 4px;
}

.modal-header h2 {
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
}

.close-btn {
  font-size: 28px;
  line-height: 1;
  color: #94a3b8;
  cursor: pointer;
  transition: color 0.15s;
}

.close-btn:hover {
  color: #0f172a;
}

.modal-body {
  padding: 24px 28px;
  overflow-y: auto;
  flex: 1;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.info-tile {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
}

.info-tile .label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 4px;
}

.info-tile .value {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.info-tile .value.highlight {
  color: #059669;
}

.status-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f1f5f9;
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 20px;
}

.date-group {
  display: flex;
  align-items: center;
  gap: 16px;
}

.date-item {
  display: flex;
  flex-direction: column;
}

.date-item .subtext {
  font-size: 11px;
  color: #64748b;
}

.date-item strong {
  font-size: 14px;
  color: #0f172a;
}

.arrow-divider {
  color: #94a3b8;
  font-size: 14px;
}

.blockchain-box {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 20px;
}

.blockchain-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.chain-icon {
  font-size: 20px;
}

.chain-sub {
  font-size: 12px;
  color: #64748b;
  margin: 0;
}

.chain-details {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  font-size: 13px;
  border-top: 1px solid #e2e8f0;
  padding-top: 12px;
}

.chain-col {
  display: flex;
  flex-direction: column;
}

.chain-label {
  font-size: 11px;
  color: #64748b;
}

.chain-val {
  font-weight: 600;
  color: #0f172a;
}

.font-mono {
  font-family: monospace;
}

.ai-box {
  background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%);
  border: 1px solid #a7f3d0;
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 20px;
}

.ai-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.ai-badge {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  color: #047857;
}

.ai-model {
  font-size: 12px;
  color: #059669;
  background: #ffffff;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid #a7f3d0;
}

.ai-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ai-label {
  font-size: 12px;
  color: #065f46;
}

.ai-price {
  font-size: 24px;
  font-weight: 800;
  color: #047857;
}

.ai-meta {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: #047857;
  text-align: right;
}

.qr-section {
  margin-bottom: 24px;
}

.timeline-section h3 {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 2px;
}

.timeline-sub {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 16px;
}

.timeline-flow {
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: relative;
  padding-left: 8px;
}

.flow-item {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  position: relative;
}

.flow-item:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 36px;
  left: 17px;
  bottom: -14px;
  width: 2px;
  background-color: #e2e8f0;
}

.flow-item.completed:not(:last-child)::after {
  background-color: #10b981;
}

.step-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  background: #ffffff;
  border: 2px solid #e2e8f0;
  z-index: 1;
}

.flow-item.completed .step-circle {
  border-color: #10b981;
  background: #ecfdf5;
}

.flow-item.pending .step-circle {
  border-style: dashed;
  opacity: 0.6;
}

.step-content {
  flex: 1;
}

.step-role {
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
}

.flow-item.pending .step-role {
  color: #94a3b8;
}

.step-desc {
  font-size: 13px;
  color: #475569;
}

.step-time {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

.modal-footer {
  padding: 16px 28px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-primary {
  padding: 10px 18px;
  background: #047857;
  color: #ffffff;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  transition: background 0.15s;
}

.btn-primary:hover {
  background: #065f46;
}

.btn-secondary {
  padding: 10px 18px;
  background: #ffffff;
  color: #475569;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
}

.btn-secondary:hover {
  background: #f1f5f9;
}

.state-container {
  padding: 48px;
  text-align: center;
  color: #64748b;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e2e8f0;
  border-top-color: #10b981;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
