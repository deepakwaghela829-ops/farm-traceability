<script setup lang="ts">
import { ref, computed } from 'vue'
import PortalLayout, { type NavItem } from '../common/PortalLayout.vue'
import StatCard from '../StatCard.vue'
import SupplierRetailer from '../SupplierRetailer.vue'
import ConsumerTraceability from '../ConsumerTraceability.vue'
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

const navItems = computed<NavItem[]>(() => [
  { id: 'dashboard', label: 'Supplier Dashboard', icon: '📊' },
  { id: 'incoming', label: 'Incoming Crops', icon: '📥', badge: blockchainCrops.value.length },
  { id: 'custody-transfer', label: 'Custody Handover', icon: '🚚' },
  { id: 'traceability', label: 'Traceability Audit', icon: '🔍' },
])

// Crops that have blockchain registration ready for supply chain custody
const blockchainCrops = computed(() => {
  return props.crops.filter(c => c.blockchain_crop_id != null)
})

// Metrics for Supplier
const shipmentsInTransit = computed(() => blockchainCrops.value.length)
const verifiedBatches = computed(() => props.crops.length)
const totalVolumeTracked = computed(() => {
  const sum = blockchainCrops.value.reduce((acc, c) => acc + Number(c.quantity || 0), 0)
  return sum.toLocaleString('en-IN', { maximumFractionDigits: 1 })
})

function handleNavigate(id: string) {
  activeNav.value = id as any
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
      <button type="button" class="btn-action-primary" @click="activeNav = 'custody-transfer'">
        🚚 Execute Custody Handover
      </button>
      <button type="button" class="btn-action-secondary" @click="emit('refresh')">
        ↻ Refresh Shipments
      </button>
    </template>

    <!-- TAB 1: SUPPLIER DASHBOARD -->
    <div v-if="activeNav === 'dashboard'" class="supplier-view">
      <div class="view-intro">
        <h2>Wholesale Agricultural Logistics & Custody</h2>
        <p>Inspect incoming farm batches, transfer possession on Ethereum Ganache, and manage distribution routes.</p>
      </div>

      <div class="metrics-grid">
        <StatCard
          title="Batches in Transit"
          :value="shipmentsInTransit"
          subtitle="On-chain registered batches"
          icon="🚚"
          trend="Live Tracking"
          trend-type="positive"
        />
        <StatCard
          title="Total Volume Handled"
          :value="`${totalVolumeTracked} kg`"
          subtitle="Across registered crops"
          icon="📦"
          trend="Audited Volume"
          trend-type="positive"
        />
        <StatCard
          title="Verified Farm Origins"
          :value="verifiedBatches"
          subtitle="Database catalogued"
          icon="🛡️"
          trend="100% Provenance"
          trend-type="positive"
        />
        <StatCard
          title="Custody Network"
          value="Ganache EVM"
          subtitle="Smart Contract Settled"
          icon="⛓️"
          trend="Chain 1337"
          trend-type="neutral"
        />
      </div>

      <!-- Incoming Crops Waiting for Custody Acceptance -->
      <div class="portal-panel">
        <div class="panel-header">
          <div>
            <h3>Available Farm Batches For Logistics Transfer</h3>
            <p class="panel-desc">Batches registered by farmers on-chain, ready for wholesale custody handover.</p>
          </div>
          <span class="sub-count">{{ blockchainCrops.length }} on-chain batches</span>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>On-Chain ID</th>
                <th>Crop Batch</th>
                <th>Quantity</th>
                <th>Farm Origin</th>
                <th>Registered Block</th>
                <th>Handover Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in blockchainCrops" :key="c.crop_id">
                <td><span class="tag-onchain">#{{ c.blockchain_crop_id }}</span> (DB #{{ c.crop_id }})</td>
                <td><strong>{{ c.crop_name }}</strong> ({{ c.crop_type }})</td>
                <td>{{ c.quantity }} {{ c.unit }}</td>
                <td>{{ c.location }}</td>
                <td>Block #{{ c.blockchain_block_number || 'OK' }}</td>
                <td>
                  <button
                    type="button"
                    class="btn-transfer-action"
                    @click="activeNav = 'custody-transfer'"
                  >
                    Transfer Custody ➔
                  </button>
                </td>
              </tr>
              <tr v-if="blockchainCrops.length === 0">
                <td colspan="6" class="empty-cell">No on-chain farm batches available currently.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: INCOMING CROPS LIST -->
    <div v-else-if="activeNav === 'incoming'" class="supplier-view">
      <div class="view-intro">
        <h2>Incoming Farm Batches</h2>
        <p>Real-time crops dispatched from producers awaiting intermediary custody confirmation.</p>
      </div>

      <div class="portal-panel">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Crop ID</th>
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
                <td><code>{{ c.farmer_id }}</code></td>
                <td><strong>{{ c.crop_name }}</strong></td>
                <td>{{ c.quantity }} {{ c.unit }}</td>
                <td>{{ c.location }}</td>
                <td>{{ c.expected_harvest_date }}</td>
                <td>
                  <button type="button" class="btn-sm" @click="activeNav = 'custody-transfer'">
                    Accept Custody
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
      <SupplierRetailer />
    </div>

    <!-- TAB 4: TRACEABILITY -->
    <div v-else-if="activeNav === 'traceability'" class="supplier-view">
      <ConsumerTraceability />
    </div>
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
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #1e293b;
  color: #cbd5e1;
}

.tag-onchain {
  font-family: monospace;
  font-weight: 700;
  color: #38bdf8;
}

.btn-transfer-action {
  background: #2563eb;
  color: #ffffff;
  border: none;
  padding: 0.4rem 0.85rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-transfer-action:hover {
  background: #1d4ed8;
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
}

.btn-sm:hover {
  background: #334155;
  color: #f8fafc;
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
</style>
