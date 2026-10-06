<script setup lang="ts">
import { ref, computed } from 'vue'
import PortalLayout, { type NavItem } from '../common/PortalLayout.vue'
import StatCard from '../StatCard.vue'
import SupplierRetailer from '../SupplierRetailer.vue'
import ConsumerTraceability from '../ConsumerTraceability.vue'
import CropDetailsModal from '../CropDetailsModal.vue'
import type { CropRecord, UserProfile } from '../../api'

const props = defineProps<{
  currentUser: UserProfile
  crops: CropRecord[]
  walletAddress?: string
  blockchainConnected?: boolean
}>()

const emit = defineEmits<{
  (e: 'logout'): void
  (e: 'refresh'): void
}>()

const activeNav = ref<'dashboard' | 'incoming' | 'custody-transfer' | 'traceability'>('dashboard')
const selectedCustodyCropId = ref<number | string | undefined>(undefined)
const selectedInspectCropId = ref<number | string | null>(null)
const selectedTraceCropId = ref<number | string | undefined>(undefined)

const navItems = computed<NavItem[]>(() => [
  { id: 'dashboard', label: 'Supplier Dashboard', icon: '📊' },
  { id: 'incoming', label: 'Incoming Shipments', icon: '📥', badge: props.crops.length },
  { id: 'custody-transfer', label: 'Custody Handover', icon: '🚚' },
  { id: 'traceability', label: 'Traceability Audit', icon: '🔍' },
])

// Filter crops by status
const onChainCrops = computed(() => {
  return props.crops.filter((c) => c.blockchain_crop_id != null)
})

// Top 4 Metrics for Supplier
const incomingShipmentsCount = computed(() => props.crops.length)
const verifiedBatchesCount = computed(() => onChainCrops.value.length)
const pendingTransfersCount = computed(() => {
  return props.crops.filter((c) => c.blockchain_crop_id != null).length
})
const totalVolumeHandled = computed(() => {
  const sum = props.crops.reduce((acc, c) => acc + Number(c.quantity || 0), 0)
  return sum.toLocaleString('en-IN', { maximumFractionDigits: 1 })
})

function handleNavigate(id: string) {
  activeNav.value = id as any
}

function handleInspectCrop(cropId: number | string) {
  selectedInspectCropId.value = cropId
}

function handleAcceptCustody(crop: CropRecord) {
  selectedCustodyCropId.value = crop.blockchain_crop_id ?? crop.crop_id
  activeNav.value = 'custody-transfer'
}

function handleTransferCustody(crop: CropRecord) {
  selectedCustodyCropId.value = crop.blockchain_crop_id ?? crop.crop_id
  activeNav.value = 'custody-transfer'
}

function handleTraceCrop(cropId: number | string) {
  selectedTraceCropId.value = cropId
  activeNav.value = 'traceability'
}
</script>

<template>
  <PortalLayout
    portal-title="AgriTrace Supplier"
    portal-subtitle="Supplier Logistics Portal · Wholesale Custody & Distribution"
    portal-icon="🚚"
    role="SUPPLIER"
    :current-user="currentUser"
    :active-nav="activeNav"
    :nav-items="navItems"
    :wallet-address="walletAddress"
    :blockchain-connected="blockchainConnected"
    @navigate="handleNavigate"
    @logout="emit('logout')"
  >
    <template #top-actions>
      <button
        type="button"
        class="btn-action-primary"
        @click="activeNav = 'custody-transfer'"
      >
        🚚 Custody Handover
      </button>
      <button
        type="button"
        class="btn-action-secondary"
        @click="emit('refresh')"
      >
        ↻ Refresh Shipments
      </button>
    </template>

    <!-- TAB 1: SUPPLIER DASHBOARD -->
    <div v-if="activeNav === 'dashboard'" class="supplier-view">
      <div class="view-intro">
        <h2>Wholesale Agricultural Logistics &amp; Custody</h2>
        <p>
          Inspect incoming farm shipments, verify on-chain provenance, transfer possession on Ethereum Ganache, and trace supply routes.
        </p>
      </div>

      <!-- 4 Top KPI Cards -->
      <div class="metrics-grid">
        <StatCard
          title="Incoming Shipments"
          :value="incomingShipmentsCount"
          subtitle="Catalogued in database"
          icon="📥"
          trend="Real-Time Data"
          trend-type="positive"
        />
        <StatCard
          title="Verified Shipments"
          :value="verifiedBatchesCount"
          subtitle="Mined on Ganache EVM"
          icon="🛡️"
          trend="100% Provenance"
          trend-type="positive"
        />
        <StatCard
          title="Pending Transfers"
          :value="pendingTransfersCount"
          subtitle="Awaiting intermediary handover"
          icon="🚚"
          trend="Active Pipeline"
          trend-type="neutral"
        />
        <StatCard
          title="Total Volume Handled"
          :value="`${totalVolumeHandled} kg`"
          subtitle="Across farm consignments"
          icon="📦"
          trend="Audited Weight"
          trend-type="positive"
        />
      </div>

      <!-- Incoming Shipments Table -->
      <div class="portal-panel">
        <div class="panel-header">
          <div>
            <h3>Incoming Agricultural Shipments</h3>
            <p class="panel-desc">
              All harvest consignments catalogued in PostgreSQL with cryptographic provenance status.
            </p>
          </div>
          <span class="sub-count">{{ crops.length }} consignments</span>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Crop Batch</th>
                <th>DB Crop ID</th>
                <th>Blockchain ID</th>
                <th>Origin</th>
                <th>Quantity</th>
                <th>Current Custodian</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in crops" :key="c.crop_id">
                <td>
                  <strong>{{ c.crop_name }}</strong>
                  <span class="crop-cat-tag">{{ c.crop_type }}</span>
                </td>
                <td><span class="tag-db">#{{ c.crop_id }}</span></td>
                <td>
                  <span v-if="c.blockchain_crop_id" class="tag-onchain">
                    #{{ c.blockchain_crop_id }}
                  </span>
                  <span v-else class="tag-offchain">
                    Off-Chain
                  </span>
                </td>
                <td>{{ c.location }}</td>
                <td>{{ c.quantity }} {{ c.unit }}</td>
                <td>
                  <code>{{ c.blockchain_farmer_address ? c.blockchain_farmer_address.slice(0, 8) + '...' : c.farmer_id }}</code>
                </td>
                <td>
                  <span
                    class="status-pill"
                    :class="c.blockchain_crop_id ? 'status-verified' : 'status-db'"
                  >
                    {{ c.blockchain_crop_id ? '✓ On-Chain Verified' : 'Database Record' }}
                  </span>
                </td>
                <td class="actions-cell">
                  <button
                    type="button"
                    class="btn-action-inspect"
                    @click="handleInspectCrop(c.crop_id)"
                  >
                    Inspect
                  </button>
                  <button
                    type="button"
                    class="btn-action-custody"
                    @click="handleAcceptCustody(c)"
                  >
                    {{ c.blockchain_crop_id ? 'Accept Custody' : 'Custody Details' }}
                  </button>
                  <button
                    type="button"
                    class="btn-action-trace"
                    @click="handleTraceCrop(c.crop_id)"
                  >
                    Trace
                  </button>
                </td>
              </tr>
              <tr v-if="crops.length === 0">
                <td colspan="8" class="empty-cell">
                  No incoming shipments found in the system.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: INCOMING SHIPMENTS LIST -->
    <div v-else-if="activeNav === 'incoming'" class="supplier-view">
      <div class="view-intro">
        <h2>Incoming Farm Consignments</h2>
        <p>Complete manifest of farm produce awaiting logistics processing.</p>
      </div>

      <div class="portal-panel">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>DB ID</th>
                <th>Blockchain ID</th>
                <th>Farmer Account</th>
                <th>Crop Name</th>
                <th>Quantity</th>
                <th>Origin Location</th>
                <th>Harvest Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in crops" :key="c.crop_id">
                <td>#{{ c.crop_id }}</td>
                <td>
                  <span v-if="c.blockchain_crop_id" class="tag-onchain">#{{ c.blockchain_crop_id }}</span>
                  <span v-else class="tag-offchain">Off-Chain</span>
                </td>
                <td><code>{{ c.farmer_id }}</code></td>
                <td><strong>{{ c.crop_name }}</strong> ({{ c.crop_type }})</td>
                <td>{{ c.quantity }} {{ c.unit }}</td>
                <td>{{ c.location }}</td>
                <td>{{ c.expected_harvest_date }}</td>
                <td>
                  <button
                    type="button"
                    class="btn-action-custody"
                    @click="handleTransferCustody(c)"
                  >
                    Handover ➔
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 3: CUSTODY TRANSFER MODULE -->
    <div v-else-if="activeNav === 'custody-transfer'" class="supplier-view">
      <SupplierRetailer
        :initial-crop-id="selectedCustodyCropId"
        :crops="crops"
        role="SUPPLIER"
        @back-to-incoming="activeNav = 'incoming'"
      />
    </div>

    <!-- TAB 4: TRACEABILITY -->
    <div v-else-if="activeNav === 'traceability'" class="supplier-view">
      <ConsumerTraceability
        :initial-crop-id="selectedTraceCropId"
      />
    </div>

    <!-- Inspection Modal -->
    <CropDetailsModal
      v-if="selectedInspectCropId !== null"
      :crop-id="selectedInspectCropId"
      @close="selectedInspectCropId = null"
    />
  </PortalLayout>
</template>

<style scoped>
.supplier-view {
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

.panel-desc {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  color: #94a3b8;
}

.sub-count {
  font-size: 0.8rem;
  color: #94a3b8;
}

.table-responsive {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.88rem;
}

.data-table th {
  background: #0b1329;
  padding: 0.85rem 1.25rem;
  color: #94a3b8;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.data-table td {
  padding: 0.9rem 1.25rem;
  border-bottom: 1px solid #1e293b;
  color: #cbd5e1;
  vertical-align: middle;
}

.crop-cat-tag {
  display: inline-block;
  margin-left: 0.4rem;
  font-size: 0.72rem;
  color: #94a3b8;
  background: #1e293b;
  padding: 2px 6px;
  border-radius: 4px;
}

.tag-db {
  font-family: monospace;
  font-weight: 700;
  color: #38bdf8;
}

.tag-onchain {
  font-family: monospace;
  font-weight: 700;
  color: #10b981;
}

.tag-offchain {
  font-size: 0.75rem;
  color: #94a3b8;
  font-style: italic;
}

.status-pill {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
}

.status-verified {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.status-db {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.actions-cell {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.btn-action-inspect {
  background: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-action-inspect:hover {
  background: #334155;
  color: #f8fafc;
}

.btn-action-custody {
  background: #2563eb;
  color: #ffffff;
  border: none;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-action-custody:hover {
  background: #1d4ed8;
}

.btn-action-trace {
  background: transparent;
  border: 1px solid #059669;
  color: #34d399;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-action-trace:hover {
  background: rgba(5, 150, 105, 0.15);
}

.empty-cell {
  text-align: center;
  padding: 2.5rem;
  color: #64748b;
}

.btn-action-primary {
  background: #2563eb;
  color: #ffffff;
  border: none;
  padding: 0.55rem 1rem;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-action-primary:hover {
  background: #1d4ed8;
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

.btn-action-secondary:hover {
  background: #334155;
  color: #f8fafc;
}
</style>
