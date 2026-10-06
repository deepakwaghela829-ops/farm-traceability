<script setup lang="ts">
import { ref, computed } from 'vue'
import PortalLayout, { type NavItem } from '../common/PortalLayout.vue'
import StatCard from '../StatCard.vue'
import CropsTable from '../CropsTable.vue'
import CropEntryForm from '../CropEntryForm.vue'
import CropDetailsModal from '../CropDetailsModal.vue'
import AiPricePrediction from '../AiPricePrediction.vue'
import ConsumerTraceability from '../ConsumerTraceability.vue'
import type { CropRecord, UserProfile } from '../../api'

const props = defineProps<{
  currentUser: UserProfile
  crops: CropRecord[]
  loadingCrops: boolean
  cropsError: string
  walletAddress?: string
  blockchainConnected?: boolean
}>()

const emit = defineEmits<{
  (e: 'logout'): void
  (e: 'refreshCrops'): void
  (e: 'cropCreated', crop: CropRecord): void
}>()

const activeNav = ref<'dashboard' | 'my-crops' | 'register' | 'ai-pricing' | 'traceability'>('dashboard')
const showRegisterModal = ref(false)
const selectedCropId = ref<number | string | null>(null)
const traceabilityTargetId = ref<number | string | undefined>(undefined)

const searchQuery = ref('')
const selectedType = ref('')

const navItems = computed<NavItem[]>(() => [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'my-crops', label: 'My Crops', icon: '🌾', badge: props.crops.length },
  { id: 'register', label: 'Register Crop', icon: '➕' },
  { id: 'ai-pricing', label: 'Price Forecast', icon: '📈' },
  { id: 'traceability', label: 'Traceability', icon: '🔍' },
])

// Metrics computed from real data
const totalCrops = computed(() => props.crops.length)
const totalQuantity = computed(() => {
  const sum = props.crops.reduce((acc, c) => acc + Number(c.quantity || 0), 0)
  return sum.toLocaleString('en-IN', { maximumFractionDigits: 1 })
})

const harvestReadyCount = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return props.crops.filter(c => {
    if (!c.expected_harvest_date) return false
    const d = new Date(`${c.expected_harvest_date}T00:00:00`)
    d.setHours(0, 0, 0, 0)
    return d <= today
  }).length
})

const activeCultivationCount = computed(() => {
  return Math.max(0, totalCrops.value - harvestReadyCount.value)
})

const blockchainSyncedCount = computed(() => {
  return props.crops.filter(c => c.blockchain_crop_id != null).length
})

const upcomingHarvests = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return props.crops
    .slice()
    .sort((a, b) => new Date(a.expected_harvest_date).getTime() - new Date(b.expected_harvest_date).getTime())
    .slice(0, 5)
})

function handleNavigate(id: string) {
  if (id === 'register') {
    showRegisterModal.value = true
  } else {
    activeNav.value = id as any
  }
}

function handleCropCreated(crop: CropRecord) {
  showRegisterModal.value = false
  emit('cropCreated', crop)
}

function handleViewTraceability(id: number | string) {
  selectedCropId.value = null
  traceabilityTargetId.value = id
  activeNav.value = 'traceability'
}
</script>

<template>
  <PortalLayout
    portal-title="AgriTrace Farmer"
    portal-subtitle="Farmer Management Portal · Harvest & Fair Pricing"
    portal-icon="🌾"
    role="FARMER"
    :current-user="currentUser"
    :active-nav="activeNav"
    :nav-items="navItems"
    :wallet-address="walletAddress"
    :blockchain-connected="blockchainConnected"
    @navigate="handleNavigate"
    @logout="emit('logout')"
  >
    <template #top-actions>
      <button type="button" class="btn-action-primary" @click="showRegisterModal = true">
        ➕ Register Harvest Batch
      </button>
      <button type="button" class="btn-action-secondary" @click="emit('refreshCrops')">
        ↻ Refresh Crops
      </button>
    </template>

    <!-- TAB 1: FARMER DASHBOARD -->
    <div v-if="activeNav === 'dashboard'" class="farmer-view">
      <!-- Section Kicker -->
      <div class="view-intro">
        <h2>Farm Overview & Yield Metrics</h2>
        <p>Monitor your active farm batches, upcoming harvest dates, and blockchain synchronization status.</p>
      </div>

      <!-- Real Data KPI Grid -->
      <div class="metrics-grid">
        <StatCard
          title="Total Registered Crops"
          :value="totalCrops"
          subtitle="Batches stored in Supabase"
          icon="🌱"
          trend="+100% Verified"
          trend-type="positive"
        />
        <StatCard
          title="Active Cultivation"
          :value="activeCultivationCount"
          subtitle="Currently maturing on farms"
          icon="🌿"
          trend="Monitored"
          trend-type="neutral"
        />
        <StatCard
          title="Ready For Harvest"
          :value="harvestReadyCount"
          subtitle="Expected date reached"
          icon="📦"
          trend="Harvest Ready"
          trend-type="positive"
        />
        <StatCard
          title="On-Chain Synced"
          :value="blockchainSyncedCount"
          subtitle="Ganache CropRegistry verified"
          icon="⛓️"
          trend="Chain 1337"
          trend-type="positive"
        />
      </div>

      <!-- Quick Action Cards -->
      <div class="quick-cards-grid">
        <div class="quick-card" @click="showRegisterModal = true">
          <div class="quick-icon">➕</div>
          <div class="quick-info">
            <h3>Register New Crop</h3>
            <p>Broadcast harvest batch to Ganache smart contract and sync to PostgreSQL.</p>
          </div>
        </div>

        <div class="quick-card" @click="activeNav = 'ai-pricing'">
          <div class="quick-icon">📈</div>
          <div class="quick-info">
            <h3>AI Mandi Price Forecast</h3>
            <p>Predict fair market prices using trained Random Forest ML regression.</p>
          </div>
        </div>

        <div class="quick-card" @click="activeNav = 'my-crops'">
          <div class="quick-icon">📋</div>
          <div class="quick-info">
            <h3>Manage Crop Catalog</h3>
            <p>View, filter, and inspect lifecycle data for all registered batches.</p>
          </div>
        </div>
      </div>

      <!-- Upcoming Harvest Timeline Card -->
      <div class="portal-panel">
        <div class="panel-header">
          <h3>Upcoming Harvest Batches</h3>
          <span class="sub-count">{{ upcomingHarvests.length }} nearest harvests</span>
        </div>
        <div class="table-responsive">
          <table class="harvest-table">
            <thead>
              <tr>
                <th>Crop ID</th>
                <th>Crop Name</th>
                <th>Quantity</th>
                <th>Expected Harvest</th>
                <th>Location</th>
                <th>Blockchain Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in upcomingHarvests" :key="c.crop_id">
                <td><span class="id-tag">#{{ c.crop_id }}</span></td>
                <td><strong>{{ c.crop_name }}</strong> ({{ c.crop_type }})</td>
                <td>{{ c.quantity }} {{ c.unit }}</td>
                <td>{{ c.expected_harvest_date }}</td>
                <td>{{ c.location }}</td>
                <td>
                  <span v-if="c.blockchain_crop_id" class="badge-synced">
                    ⛓️ Block #{{ c.blockchain_block_number || 'OK' }}
                  </span>
                  <span v-else class="badge-offchain">Off-Chain</span>
                </td>
                <td>
                  <button type="button" class="btn-sm" @click="selectedCropId = c.crop_id">Inspect</button>
                  <button type="button" class="btn-sm trace" @click="handleViewTraceability(c.crop_id)">Trace</button>
                </td>
              </tr>
              <tr v-if="upcomingHarvests.length === 0">
                <td colspan="7" class="empty-cell">No registered crop batches found.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: MY CROPS CATALOG -->
    <div v-else-if="activeNav === 'my-crops'" class="farmer-view">
      <div class="view-intro">
        <h2>My Registered Crops</h2>
        <p>Complete audited list of crops originating from your farm holdings.</p>
      </div>

      <CropsTable
        :crops="crops"
        :loading="loadingCrops"
        :error="cropsError"
        v-model:search-query="searchQuery"
        v-model:selected-type="selectedType"
        @select-crop="selectedCropId = $event"
        @view-traceability="handleViewTraceability($event)"
        @retry="emit('refreshCrops')"
      />
    </div>

    <!-- TAB 3: AI PRICE FORECAST -->
    <div v-else-if="activeNav === 'ai-pricing'" class="farmer-view">
      <div class="view-intro">
        <h2>AI Market Price Forecast</h2>
        <p>Pre-fill features from your registered harvest batches to forecast mandi market rates.</p>
      </div>
      <AiPricePrediction />
    </div>

    <!-- TAB 4: TRACEABILITY INSPECTOR -->
    <div v-else-if="activeNav === 'traceability'" class="farmer-view">
      <ConsumerTraceability :initial-crop-id="traceabilityTargetId" />
    </div>

    <!-- Modals -->
    <div v-if="showRegisterModal" class="modal-backdrop" @click.self="showRegisterModal = false">
      <div class="modal-dialog">
        <CropEntryForm
          farmer-id="DEMO-FARMER-001"
          :wallet-address="walletAddress"
          @success="handleCropCreated"
          @cancel="showRegisterModal = false"
        />
      </div>
    </div>

    <CropDetailsModal
      v-if="selectedCropId"
      :crop-id="selectedCropId"
      @close="selectedCropId = null"
      @view-traceability="handleViewTraceability"
    />
  </PortalLayout>
</template>

<style scoped>
.farmer-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.view-intro h2 {
  margin: 0;
  font-size: 1.35rem;
  color: #f8fafc;
}

.view-intro p {
  margin: 0.25rem 0 0;
  color: #94a3b8;
  font-size: 0.88rem;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.quick-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.quick-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 10px;
  padding: 1.25rem;
  display: flex;
  gap: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-card:hover {
  background: #1e293b;
  border-color: #10b981;
  transform: translateY(-2px);
}

.quick-icon {
  font-size: 1.8rem;
}

.quick-info h3 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  color: #f1f5f9;
}

.quick-info p {
  margin: 0;
  font-size: 0.82rem;
  color: #94a3b8;
  line-height: 1.4;
}

.portal-panel {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 10px;
  overflow: hidden;
}

.panel-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #1e293b;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h3 {
  margin: 0;
  font-size: 1.05rem;
  color: #f8fafc;
}

.sub-count {
  font-size: 0.8rem;
  color: #94a3b8;
}

.table-responsive {
  overflow-x: auto;
}

.harvest-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.88rem;
}

.harvest-table th {
  background: #0b1329;
  padding: 0.85rem 1.25rem;
  color: #94a3b8;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.harvest-table td {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #1e293b;
  color: #cbd5e1;
}

.id-tag {
  font-family: monospace;
  font-weight: 700;
  color: #38bdf8;
}

.badge-synced {
  color: #34d399;
  font-size: 0.8rem;
  font-weight: 600;
}

.badge-offchain {
  color: #94a3b8;
  font-size: 0.8rem;
}

.btn-sm {
  background: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  margin-right: 0.4rem;
  transition: all 0.15s;
}

.btn-sm:hover {
  background: #334155;
  color: #f8fafc;
}

.btn-sm.trace {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
}

.btn-sm.trace:hover {
  background: #10b981;
  color: #022c22;
}

.empty-cell {
  text-align: center;
  padding: 2.5rem;
  color: #64748b;
}

.btn-action-primary {
  background: #10b981;
  color: #022c22;
  border: none;
  padding: 0.55rem 1rem;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-action-primary:hover {
  background: #059669;
  color: #ffffff;
}

.btn-action-secondary {
  background: #1e293b;
  color: #cbd5e1;
  border: 1px solid #334155;
  padding: 0.55rem 0.9rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  margin-left: 0.5rem;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1.5rem;
}

.modal-dialog {
  width: 100%;
  max-width: 650px;
  max-height: 90vh;
  overflow-y: auto;
}
</style>
