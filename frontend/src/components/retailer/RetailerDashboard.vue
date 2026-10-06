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

const activeNav = ref<'dashboard' | 'inventory' | 'custody-receive' | 'traceability'>('dashboard')
const selectedCropId = ref<number | string | null>(null)
const traceabilityTargetId = ref<number | string | undefined>(undefined)
const selectedCustodyCropId = ref<number | string | undefined>(undefined)

function handleReceiveCustody(crop: CropRecord) {
  selectedCustodyCropId.value = crop.blockchain_crop_id ?? crop.crop_id
  activeNav.value = 'custody-receive'
}

const navItems = computed<NavItem[]>(() => [
  { id: 'dashboard', label: 'Store Dashboard', icon: '🏪' },
  { id: 'inventory', label: 'Retail Inventory', icon: '📦', badge: props.crops.length },
  { id: 'custody-receive', label: 'Receive Shipments', icon: '📥' },
  { id: 'traceability', label: 'Verify Provenance', icon: '🔍' },
])

// Retailer real metrics
const totalInventoryItems = computed(() => props.crops.length)
const totalVolume = computed(() => {
  const sum = props.crops.reduce((acc, c) => acc + Number(c.quantity || 0), 0)
  return sum.toLocaleString('en-IN', { maximumFractionDigits: 1 })
})
const verifiedProvenanceCount = computed(() => {
  return props.crops.filter(c => c.blockchain_crop_id != null).length
})

function handleNavigate(id: string) {
  activeNav.value = id as any
}

function handleVerifyProduct(cropId: number | string) {
  traceabilityTargetId.value = cropId
  activeNav.value = 'traceability'
}
</script>

<template>
  <PortalLayout
    portal-title="AgriTrace Retailer"
    portal-subtitle="Retailer Store Portal · Shelf Inventory & Provenance Verification"
    portal-icon="🏪"
    role="RETAILER"
    :current-user="currentUser"
    :active-nav="activeNav"
    :nav-items="navItems"
    :wallet-address="walletAddress"
    :blockchain-connected="blockchainConnected"
    @navigate="handleNavigate"
    @logout="emit('logout')"
  >
    <template #top-actions>
      <button type="button" class="btn-action-primary" @click="activeNav = 'traceability'">
        🔍 Verify Product Provenance
      </button>
      <button type="button" class="btn-action-secondary" @click="emit('refresh')">
        ↻ Refresh Inventory
      </button>
    </template>

    <!-- TAB 1: RETAILER DASHBOARD -->
    <div v-if="activeNav === 'dashboard'" class="retailer-view">
      <div class="view-intro">
        <h2>Store Inventory & Verified Shelf Stock</h2>
        <p>Inspect incoming shipments delivered by distributors, verify tamper-proof origins, and provide customer transparency.</p>
      </div>

      <div class="metrics-grid">
        <StatCard
          title="Products Received"
          :value="totalInventoryItems"
          subtitle="Audited in inventory"
          icon="📦"
          trend="In Store"
          trend-type="positive"
        />
        <StatCard
          title="Total Stock Volume"
          :value="`${totalVolume} kg`"
          subtitle="Active shelf inventory"
          icon="⚖️"
          trend="Fresh Produce"
          trend-type="positive"
        />
        <StatCard
          title="Blockchain Verified"
          :value="verifiedProvenanceCount"
          subtitle="CropRegistry smart contract"
          icon="🛡️"
          trend="Tamper-Proof"
          trend-type="positive"
        />
        <StatCard
          title="Retail Verification Mode"
          value="QR Active"
          subtitle="Consumer packaging scans"
          icon="📱"
          trend="Public Ready"
          trend-type="positive"
        />
      </div>

      <!-- Inventory Highlights -->
      <div class="portal-panel">
        <div class="panel-header">
          <div>
            <h3>Current Retail Stock & Provenance Status</h3>
            <p class="panel-desc">Products ready for consumers with authentic farm origins.</p>
          </div>
          <span class="sub-count">{{ crops.length }} items catalogued</span>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Batch #</th>
                <th>Produce Name</th>
                <th>Quantity</th>
                <th>Farm Origin</th>
                <th>Harvested / Stock Date</th>
                <th>Provenance Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in crops.slice(0, 8)" :key="c.crop_id">
                <td><span class="tag-batch">#{{ c.crop_id }}</span></td>
                <td><strong>{{ c.crop_name }}</strong> ({{ c.crop_type }})</td>
                <td>{{ c.quantity }} {{ c.unit }}</td>
                <td>{{ c.location }}</td>
                <td>{{ c.expected_harvest_date }}</td>
                <td>
                  <span v-if="c.blockchain_crop_id" class="badge-verified">
                    ✓ On-Chain Verified (Block #{{ c.blockchain_block_number || 'OK' }})
                  </span>
                  <span v-else class="badge-db">
                    Database Verified
                  </span>
                </td>
                <td>
                  <button type="button" class="btn-sm" @click="selectedCropId = c.crop_id">Inspect</button>
                  <button type="button" class="btn-sm receive" @click="handleReceiveCustody(c)">Receive</button>
                  <button type="button" class="btn-sm verify" @click="handleVerifyProduct(c.crop_id)">Verify Provenance</button>
                </td>
              </tr>
              <tr v-if="crops.length === 0">
                <td colspan="7" class="empty-cell">No inventory currently recorded.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: FULL INVENTORY -->
    <div v-else-if="activeNav === 'inventory'" class="retailer-view">
      <div class="view-intro">
        <h2>Full Store Inventory</h2>
        <p>Complete shelf and storage stock across all produce categories.</p>
      </div>

      <div class="portal-panel">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Produce</th>
                <th>Quantity</th>
                <th>Farm Origin</th>
                <th>Harvest Date</th>
                <th>Custody Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in crops" :key="c.crop_id">
                <td>#{{ c.crop_id }}</td>
                <td><strong>{{ c.crop_name }}</strong> ({{ c.crop_type }})</td>
                <td>{{ c.quantity }} {{ c.unit }}</td>
                <td>{{ c.location }}</td>
                <td>{{ c.expected_harvest_date }}</td>
                <td>{{ c.blockchain_crop_id ? 'On-Chain Ledger Sealed' : 'Local Stock' }}</td>
                <td>
                  <button type="button" class="btn-sm" @click="selectedCropId = c.crop_id">Inspect</button>
                  <button type="button" class="btn-sm verify" @click="handleVerifyProduct(c.crop_id)">Verify</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 3: RECEIVE SHIPMENTS / CUSTODY TRANSFER -->
    <div v-else-if="activeNav === 'custody-receive'" class="retailer-view">
      <SupplierRetailer
        :initial-crop-id="selectedCustodyCropId"
        :crops="crops"
        role="RETAILER"
      />
    </div>

    <!-- TAB 4: TRACEABILITY -->
    <div v-else-if="activeNav === 'traceability'" class="retailer-view">
      <ConsumerTraceability :initial-crop-id="traceabilityTargetId" />
    </div>

    <!-- Modal -->
    <CropDetailsModal
      v-if="selectedCropId"
      :crop-id="selectedCropId"
      @close="selectedCropId = null"
      @view-traceability="handleVerifyProduct"
    />
  </PortalLayout>
</template>

<style scoped>
.retailer-view {
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
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #1e293b;
  color: #cbd5e1;
}

.tag-batch {
  font-family: monospace;
  font-weight: 700;
  color: #f59e0b;
}

.badge-verified {
  color: #10b981;
  font-size: 0.8rem;
  font-weight: 600;
}

.badge-db {
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
}

.btn-sm:hover {
  background: #334155;
  color: #f8fafc;
}

.btn-sm.verify {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.4);
  color: #fcd34d;
}

.btn-sm.verify:hover {
  background: #f59e0b;
  color: #000000;
}

.empty-cell {
  text-align: center;
  padding: 2.5rem;
  color: #64748b;
}

.btn-action-primary {
  background: #f59e0b;
  color: #000000;
  border: none;
  padding: 0.55rem 1rem;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-action-primary:hover {
  background: #d97706;
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
</style>
