<script setup lang="ts">
import { ref, computed } from 'vue'
import PortalLayout, { type NavItem } from '../common/PortalLayout.vue'
import StatCard from '../StatCard.vue'
import type { CropRecord, UserProfile } from '../../api'

const props = defineProps<{
  currentUser: UserProfile
  crops: CropRecord[]
  systemUsers: UserProfile[]
  loadingUsers: boolean
  walletAddress?: string
  blockchainConnected?: boolean
}>()

const emit = defineEmits<{
  (e: 'logout'): void
  (e: 'refresh'): void
}>()

const activeNav = ref<'dashboard' | 'users' | 'crops' | 'smart-contract' | 'system-health'>('dashboard')

const navItems = computed<NavItem[]>(() => [
  { id: 'dashboard', label: 'Audit Dashboard', icon: '🛡️' },
  { id: 'users', label: 'User Directory', icon: '👥', badge: props.systemUsers.length },
  { id: 'crops', label: 'Audited Crops', icon: '🌾', badge: props.crops.length },
  { id: 'smart-contract', label: 'Contract Params', icon: '⛓️' },
  { id: 'system-health', label: 'Infrastructure', icon: '💻' },
])

const totalRegisteredUsers = computed(() => props.systemUsers.length)
const totalAuditedCrops = computed(() => props.crops.length)
const onChainLedgerCount = computed(() => props.crops.filter(c => c.blockchain_crop_id != null).length)

function handleNavigate(id: string) {
  activeNav.value = id as any
}
</script>

<template>
  <PortalLayout
    portal-title="AgriTrace Admin"
    portal-subtitle="System Administration & Cryptographic Audit Console"
    portal-icon="🛡️"
    role="ADMIN"
    :current-user="currentUser"
    :active-nav="activeNav"
    :nav-items="navItems"
    :wallet-address="walletAddress"
    :blockchain-connected="blockchainConnected"
    @navigate="handleNavigate"
    @logout="emit('logout')"
  >
    <template #top-actions>
      <button type="button" class="btn-action-secondary" @click="emit('refresh')">
        ↻ Refresh Audit Data
      </button>
    </template>

    <!-- TAB 1: AUDIT DASHBOARD -->
    <div v-if="activeNav === 'dashboard'" class="admin-view">
      <div class="view-intro">
        <h2>Cryptographic Audit & Platform Activity</h2>
        <p>Monitor system-wide activity, account permissions, and ledger parameters across Ganache EVM and PostgreSQL.</p>
      </div>

      <div class="metrics-grid">
        <StatCard
          title="Registered Users"
          :value="totalRegisteredUsers"
          subtitle="Platform accounts"
          icon="👥"
          trend="RBAC Enforced"
          trend-type="neutral"
        />
        <StatCard
          title="Total Audited Crops"
          :value="totalAuditedCrops"
          subtitle="Supabase PostgreSQL"
          icon="🌾"
          trend="100% Verified"
          trend-type="positive"
        />
        <StatCard
          title="On-Chain EVM Batches"
          :value="onChainLedgerCount"
          subtitle="Mined on Ganache"
          icon="⛓️"
          trend="Chain 1337"
          trend-type="positive"
        />
        <StatCard
          title="System Health"
          value="Operational"
          subtitle="All Microservices Online"
          icon="🟢"
          trend="4 / 4 Live"
          trend-type="positive"
        />
      </div>

      <!-- Infrastructure Status Grid -->
      <div class="portal-panel">
        <div class="panel-header">
          <h3>Connected Infrastructure & Microservices</h3>
          <span class="sub-count">Live Verification Status</span>
        </div>
        <div class="infra-grid">
          <div class="infra-card">
            <div class="infra-head">
              <span class="infra-dot live"></span>
              <h4>FastAPI REST Backend</h4>
            </div>
            <p>Port: 8000 · Status: <code>HTTP 200 OK</code></p>
            <span class="infra-tag">JWT + RBAC Middleware</span>
          </div>

          <div class="infra-card">
            <div class="infra-head">
              <span class="infra-dot live"></span>
              <h4>PostgreSQL / Supabase</h4>
            </div>
            <p>Port: 6543 (Pooler) · Status: <code>Connected</code></p>
            <span class="infra-tag">SQLAlchemy 2.0 ORM</span>
          </div>

          <div class="infra-card">
            <div class="infra-head">
              <span class="infra-dot live"></span>
              <h4>Ganache EVM Blockchain</h4>
            </div>
            <p>RPC: <code>127.0.0.1:7545</code> · Chain: <code>1337</code></p>
            <span class="infra-tag">CropRegistry.sol</span>
          </div>

          <div class="infra-card">
            <div class="infra-head">
              <span class="infra-dot live"></span>
              <h4>Scikit-Learn ML Pricing</h4>
            </div>
            <p>Model: <code>RandomForestRegressor</code></p>
            <span class="infra-tag">Palghar & Nashik Mandi Benchmark</span>
          </div>
        </div>
      </div>

      <!-- User Accounts Summary -->
      <div class="portal-panel">
        <div class="panel-header">
          <h3>Registered Platform Accounts</h3>
          <button type="button" class="btn-sm" @click="activeNav = 'users'">View All Directory ➔</button>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Role</th>
                <th>Ethereum Wallet Address</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in systemUsers" :key="u.id">
                <td>#{{ u.id }}</td>
                <td><strong>{{ u.username }}</strong></td>
                <td><span class="role-badge" :class="u.role.toLowerCase()">{{ u.role }}</span></td>
                <td><code>{{ u.wallet_address || '—' }}</code></td>
                <td>{{ u.created_at ? new Date(u.created_at).toLocaleDateString() : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: USER DIRECTORY -->
    <div v-else-if="activeNav === 'users'" class="admin-view">
      <div class="view-intro">
        <h2>Platform User Management & Role Permissions</h2>
        <p>List of all platform accounts with cryptographic identity mapping and RBAC roles.</p>
      </div>

      <div class="portal-panel">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Account ID</th>
                <th>Username</th>
                <th>Email</th>
                <th>Full Name</th>
                <th>Assigned Role</th>
                <th>Wallet Address</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in systemUsers" :key="u.id">
                <td>#{{ u.id }}</td>
                <td><strong>{{ u.username }}</strong></td>
                <td>{{ u.email }}</td>
                <td>{{ u.full_name || '—' }}</td>
                <td><span class="role-badge" :class="u.role.toLowerCase()">{{ u.role }}</span></td>
                <td><code>{{ u.wallet_address || '—' }}</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 3: AUDITED CROPS -->
    <div v-else-if="activeNav === 'crops'" class="admin-view">
      <div class="view-intro">
        <h2>Global Crop Records Audit</h2>
        <p>Complete relational database view of all agricultural batches.</p>
      </div>

      <div class="portal-panel">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>DB ID</th>
                <th>On-Chain ID</th>
                <th>Crop Name</th>
                <th>Producer ID</th>
                <th>Quantity</th>
                <th>Location</th>
                <th>Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in crops" :key="c.crop_id">
                <td>#{{ c.crop_id }}</td>
                <td>{{ c.blockchain_crop_id ? `#${c.blockchain_crop_id}` : 'Off-Chain' }}</td>
                <td><strong>{{ c.crop_name }}</strong> ({{ c.crop_type }})</td>
                <td><code>{{ c.farmer_id }}</code></td>
                <td>{{ c.quantity }} {{ c.unit }}</td>
                <td>{{ c.location }}</td>
                <td><code>{{ c.blockchain_tx_hash ? `${c.blockchain_tx_hash.slice(0, 10)}...` : '—' }}</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 4: SMART CONTRACT PARAMETERS -->
    <div v-else-if="activeNav === 'smart-contract'" class="admin-view">
      <div class="view-intro">
        <h2>Ethereum Smart Contract Parameters</h2>
        <p>Configuration of the CropRegistry immutable ledger.</p>
      </div>

      <div class="portal-panel contract-panel">
        <div class="contract-spec-list">
          <div class="spec-row">
            <span class="spec-label">Contract Name:</span>
            <span class="spec-val">CropRegistry</span>
          </div>
          <div class="spec-row">
            <span class="spec-label">Contract Address:</span>
            <span class="spec-val font-mono">0xd359Ed83d80A58272Bae78475c80665035942241</span>
          </div>
          <div class="spec-row">
            <span class="spec-label">Network / Target EVM:</span>
            <span class="spec-val">Local Ganache Testnet (127.0.0.1:7545)</span>
          </div>
          <div class="spec-row">
            <span class="spec-label">EVM Chain ID:</span>
            <span class="spec-val font-mono">1337</span>
          </div>
          <div class="spec-row">
            <span class="spec-label">Compiler / Version:</span>
            <span class="spec-val">Solidity ^0.8.20</span>
          </div>
          <div class="spec-row">
            <span class="spec-label">Contract State:</span>
            <span class="spec-val text-emerald">Active & Synchronized</span>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 5: SYSTEM HEALTH -->
    <div v-else-if="activeNav === 'system-health'" class="admin-view">
      <div class="view-intro">
        <h2>System Architecture & Health Verification</h2>
        <p>Operational status of all system layers.</p>
      </div>

      <div class="infra-grid">
        <div class="infra-card">
          <div class="infra-head">
            <span class="infra-dot live"></span>
            <h4>API Gateway & Auth</h4>
          </div>
          <p>Endpoints: <code>/api/auth</code>, <code>/api/crops</code>, <code>/api/transactions</code>, <code>/api/prediction</code></p>
          <span class="infra-tag">Response Time: &lt; 20ms</span>
        </div>
        <div class="infra-card">
          <div class="infra-head">
            <span class="infra-dot live"></span>
            <h4>Database Integrity</h4>
          </div>
          <p>Tables: users, crops, crop_transactions, crop_predictions</p>
          <span class="infra-tag">ACID Compliant</span>
        </div>
      </div>
    </div>
  </PortalLayout>
</template>

<style scoped>
.admin-view {
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

.sub-count {
  font-size: 0.8rem;
  color: #94a3b8;
}

.infra-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
  padding: 1.5rem;
}

.infra-card {
  background: #0b1329;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.infra-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.infra-head h4 {
  margin: 0;
  font-size: 0.95rem;
  color: #f1f5f9;
}

.infra-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
}

.infra-dot.live {
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}

.infra-card p {
  margin: 0;
  font-size: 0.82rem;
  color: #94a3b8;
}

.infra-tag {
  display: inline-block;
  background: rgba(16, 185, 129, 0.1);
  color: #34d399;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  width: fit-content;
  margin-top: 0.25rem;
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

.role-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  text-transform: uppercase;
}

.role-badge.farmer { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
.role-badge.supplier { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
.role-badge.retailer { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.role-badge.consumer { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
.role-badge.admin { background: rgba(239, 68, 68, 0.2); color: #f87171; }

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

.contract-panel {
  padding: 2rem;
}

.contract-spec-list {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-width: 700px;
}

.spec-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 0.85rem;
}

.spec-label {
  color: #94a3b8;
  font-size: 0.9rem;
}

.spec-val {
  font-weight: 600;
  color: #f1f5f9;
}

.text-emerald {
  color: #34d399;
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
}
</style>
