<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ethers } from 'ethers'
import { 
  fetchCrops, 
  fetchCurrentUser,
  fetchSystemUsers,
  type CropRecord, 
  type BlockchainCropPayload,
  type UserProfile
} from './api'
import deploymentInfo from './blockchain/deployment-info.json'
import abi from './blockchain/CropRegistry.abi.json'

import StatCard from './components/StatCard.vue'
import CropsTable from './components/CropsTable.vue'
import CropEntryForm from './components/CropEntryForm.vue'
import CropDetailsModal from './components/CropDetailsModal.vue'
import ConsumerTraceability from './components/ConsumerTraceability.vue'
import SupplierRetailer from './components/SupplierRetailer.vue'
import AiPricePrediction from './components/AiPricePrediction.vue'
import AuthModal from './components/AuthModal.vue'

// Role & Session State
type RoleType = 'FARMER' | 'SUPPLIER' | 'RETAILER' | 'CONSUMER' | 'ADMIN'
const currentUser = ref<UserProfile | null>(null)
const authToken = ref<string>(localStorage.getItem('agritrace_token') || '')
const showLoginModal = ref<boolean>(false)

// Active Module Tab
type TabType = 'dashboard' | 'crops' | 'traceability' | 'custody' | 'ai-pricing' | 'admin'
const activeTab = ref<TabType>('dashboard')

// Farmer & Blockchain Constants
const DEMO_FARMER_ID = 'DEMO-FARMER-001'
const GANACHE_RPC = 'http://127.0.0.1:7545'
const contractAddress = deploymentInfo.contractAddress
const requiredChainId = BigInt(deploymentInfo.chainId)

// State
const crops = ref<CropRecord[]>([])
const loadingCrops = ref(false)
const cropsError = ref('')
const systemUsers = ref<UserProfile[]>([])
const loadingUsers = ref(false)

// Form & Modal State
const showAddForm = ref(false)
const selectedCropId = ref<number | string | null>(null)
const traceabilityTargetId = ref<number | string | undefined>(undefined)

// Search & Filter
const searchQuery = ref('')
const selectedType = ref('')

// Web3 / Ganache State
const walletAddress = ref('')
const connectingWallet = ref(false)
const walletConnected = ref(false)
let provider: ethers.JsonRpcProvider | null = null
let signer: ethers.JsonRpcSigner | null = null
let registry: ethers.Contract | null = null

// Notification Toast State
const toast = ref<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
let toastTimeout: any = null

function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  if (toastTimeout) clearTimeout(toastTimeout)
  toast.value = { message, type }
  toastTimeout = setTimeout(() => {
    toast.value = null
  }, 4000)
}

// Compute Metrics
const totalCropsCount = computed(() => crops.value.length)

const totalQuantitySum = computed(() => {
  const sum = crops.value.reduce((acc, c) => acc + Number(c.quantity || 0), 0)
  return sum.toLocaleString('en-IN', { maximumFractionDigits: 1 })
})

const harvestReadyCount = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return crops.value.filter(c => {
    if (!c.expected_harvest_date) return false
    const harvest = new Date(`${c.expected_harvest_date}T00:00:00`)
    harvest.setHours(0, 0, 0, 0)
    return harvest <= today
  }).length
})

const activeGrowingCount = computed(() => {
  return Math.max(0, totalCropsCount.value - harvestReadyCount.value)
})

const blockchainSyncedCount = computed(() => {
  return crops.value.filter(c => c.blockchain_crop_id != null).length
})

// Shortened wallet format
const shortWallet = computed(() => {
  if (!walletAddress.value) return 'Connect Ganache'
  return `${walletAddress.value.slice(0, 6)}...${walletAddress.value.slice(-4)}`
})

// Role Permissions
const userRole = computed<RoleType>(() => {
  return (currentUser.value?.role as RoleType) || 'CONSUMER'
})

const canAccessCrops = computed(() => {
  return !currentUser.value || ['FARMER', 'ADMIN'].includes(userRole.value)
})

const canRegisterCrop = computed(() => {
  return !currentUser.value || ['FARMER', 'ADMIN'].includes(userRole.value)
})

const canAccessCustody = computed(() => {
  return !currentUser.value || ['FARMER', 'SUPPLIER', 'RETAILER', 'ADMIN'].includes(userRole.value)
})

const canAccessAiPricing = computed(() => {
  return !currentUser.value || ['FARMER', 'ADMIN'].includes(userRole.value)
})

const canAccessAdmin = computed(() => {
  return userRole.value === 'ADMIN'
})

// Fetch crops from PostgreSQL / FastAPI
async function loadCropRecords() {
  loadingCrops.value = true
  cropsError.value = ''
  try {
    const data = await fetchCrops()
    crops.value = data
  } catch (err: any) {
    cropsError.value = err.message || 'Unable to connect to FastAPI backend.'
  } finally {
    loadingCrops.value = false
  }
}

// Fetch admin users list
async function loadSystemUsers() {
  if (!authToken.value || userRole.value !== 'ADMIN') return
  loadingUsers.value = true
  try {
    systemUsers.value = await fetchSystemUsers(authToken.value)
  } catch {
    systemUsers.value = []
  } finally {
    loadingUsers.value = false
  }
}

// Ganache Connection
async function connectGanache(silent = false) {
  connectingWallet.value = true
  try {
    provider = new ethers.JsonRpcProvider(GANACHE_RPC)
    const network = await provider.getNetwork()
    if (network.chainId === requiredChainId) {
      const accounts = await provider.send('eth_accounts', [])
      if (accounts && accounts.length > 0) {
        walletAddress.value = accounts[0]
        signer = await provider.getSigner(accounts[0])
        registry = new ethers.Contract(contractAddress, abi, signer)
        walletConnected.value = true
        if (!silent) {
          showToast(`Connected to Ganache: ${shortWallet.value}`, 'success')
        }
      }
    }
  } catch (err) {
    walletConnected.value = false
    if (!silent) {
      showToast('Ganache node offline. Operating in direct database mode.', 'info')
    }
  } finally {
    connectingWallet.value = false
  }
}

// Authentication Handlers
function handleLoginSuccess(data: { user: UserProfile; token: string }) {
  currentUser.value = data.user
  authToken.value = data.token
  localStorage.setItem('agritrace_token', data.token)
  showLoginModal.value = false
  showToast(`Welcome back, ${data.user.full_name || data.user.username} (${data.user.role})!`, 'success')

  // Set wallet address from account if user has one
  if (data.user.wallet_address) {
    walletAddress.value = data.user.wallet_address
  }

  // Adjust active tab based on role
  if (data.user.role === 'CONSUMER') {
    activeTab.value = 'traceability'
  } else if (['SUPPLIER', 'RETAILER'].includes(data.user.role)) {
    activeTab.value = 'custody'
  } else if (data.user.role === 'ADMIN') {
    loadSystemUsers()
  }
}

function handleLogout() {
  currentUser.value = null
  authToken.value = ''
  localStorage.removeItem('agritrace_token')
  showToast('Signed out. Switched to public guest mode.', 'info')
}

// Check session on startup
async function checkAuthSession() {
  if (authToken.value) {
    try {
      const res = await fetchCurrentUser(authToken.value)
      currentUser.value = res
      if (res.wallet_address) {
        walletAddress.value = res.wallet_address
      }
      if (res.role === 'ADMIN') loadSystemUsers()
    } catch {
      localStorage.removeItem('agritrace_token')
      authToken.value = ''
      currentUser.value = null
    }
  }
}

// Action Handlers
function handleCropCreated(createdCrop: CropRecord) {
  showAddForm.value = false
  showToast(`Crop "${createdCrop.crop_name}" registered successfully!`, 'success')
  loadCropRecords()
}

function handleSelectCrop(cropId: number | string) {
  selectedCropId.value = cropId
}

function handleViewTraceability(cropId: number | string) {
  selectedCropId.value = null
  traceabilityTargetId.value = cropId
  activeTab.value = 'traceability'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function navigateToTab(tab: TabType) {
  activeTab.value = tab
  if (tab === 'admin') loadSystemUsers()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Check Hash for Direct QR Scanning (#trace-1) and direct tab routing
function checkDirectScanHash() {
  const hash = window.location.hash
  if (hash && hash.startsWith('#trace-')) {
    const id = hash.replace('#trace-', '')
    if (id) {
      traceabilityTargetId.value = id
      activeTab.value = 'traceability'
    }
  } else if (hash === '#admin') {
    activeTab.value = 'admin'
    loadSystemUsers()
  } else if (hash === '#crops') {
    activeTab.value = 'crops'
  } else if (hash === '#custody') {
    activeTab.value = 'custody'
  } else if (hash === '#ai-pricing') {
    activeTab.value = 'ai-pricing'
  }
}

onMounted(async () => {
  await checkAuthSession()
  await loadCropRecords()
  await connectGanache(true)
  checkDirectScanHash()
  window.addEventListener('hashchange', checkDirectScanHash)
})
</script>

<template>
  <div class="app-container">
    <!-- Toast Notification -->
    <transition name="toast-fade">
      <div v-if="toast" :class="['toast-banner', toast.type]">
        <span class="toast-icon">
          {{ toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ' }}
        </span>
        <span>{{ toast.message }}</span>
      </div>
    </transition>

    <!-- Top Navigation Bar -->
    <header class="app-header">
      <div class="header-container">
        <div class="brand">
          <div class="brand-icon">🌱</div>
          <div class="brand-info">
            <span class="brand-title">AGRITRACE OS</span>
            <span class="brand-sub">Enterprise Farm Traceability System</span>
          </div>
        </div>

        <nav class="nav-links">
          <button 
            :class="['nav-item', { active: activeTab === 'dashboard' }]"
            @click="navigateToTab('dashboard')"
          >
            Dashboard
          </button>
          <button 
            v-if="canAccessCrops"
            :class="['nav-item', { active: activeTab === 'crops' }]"
            @click="navigateToTab('crops')"
          >
            Crop Management
          </button>
          <button 
            :class="['nav-item', { active: activeTab === 'traceability' }]"
            @click="navigateToTab('traceability')"
          >
            Consumer Traceability
          </button>
          <button 
            v-if="canAccessCustody"
            :class="['nav-item', { active: activeTab === 'custody' }]"
            @click="navigateToTab('custody')"
          >
            Custody Handover
          </button>
          <button 
            v-if="canAccessAiPricing"
            :class="['nav-item', { active: activeTab === 'ai-pricing' }]"
            @click="navigateToTab('ai-pricing')"
          >
            AI Price Forecast
          </button>
          <button 
            v-if="canAccessAdmin"
            :class="['nav-item', { active: activeTab === 'admin' }]"
            @click="navigateToTab('admin')"
          >
            System Audit
          </button>
        </nav>

        <div class="header-actions">
          <!-- User / Role Profile Widget -->
          <div v-if="currentUser" class="user-chip">
            <span class="role-tag" :class="currentUser.role.toLowerCase()">{{ currentUser.role }}</span>
            <span class="username">{{ currentUser.username }}</span>
            <button class="btn-logout" @click="handleLogout" title="Sign Out">✕</button>
          </div>
          <button 
            v-else 
            class="btn-login-trigger" 
            @click="showLoginModal = true"
          >
            Sign In / Roles
          </button>

          <!-- EVM Connection Widget -->
          <button 
            class="wallet-badge" 
            :class="{ connected: walletConnected }"
            @click="connectGanache(false)"
            :disabled="connectingWallet"
            :title="walletConnected ? 'Connected to Ganache EVM' : 'Click to connect Ganache EVM'"
          >
            <span class="status-dot"></span>
            <span>{{ walletConnected ? shortWallet : 'Connect Ganache' }}</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Subheader Hero Banner -->
    <section class="hero-strip">
      <div class="hero-container">
        <div>
          <div class="role-chip">
            PROVENANCE &amp; SUPPLY CHAIN · ACTIVE ROLE: {{ userRole }}
          </div>
          <h1>Farm Harvest &amp; Food Traceability Platform</h1>
          <p>
            Cryptographically verified agricultural lifecycle ledger. End-to-end tracking 
            from seed cultivation to consumer table with AI fair pricing and packaging QR codes.
          </p>
        </div>

        <div class="hero-actions">
          <button 
            v-if="!showAddForm && canRegisterCrop"
            class="btn-hero-primary" 
            @click="showAddForm = true; activeTab = 'crops'"
          >
            + Register New Crop
          </button>
          <button 
            class="btn-hero-secondary"
            @click="loadCropRecords" 
            :disabled="loadingCrops"
          >
            {{ loadingCrops ? 'Refreshing...' : '↻ Refresh Ledger' }}
          </button>
        </div>
      </div>
    </section>

    <!-- Main Workspace -->
    <main class="main-content">
      <!-- 1. DASHBOARD VIEW -->
      <div v-if="activeTab === 'dashboard'" class="tab-view animate-fade-in">
        <!-- Statistics KPI Cards -->
        <div class="kpi-grid">
          <StatCard 
            title="Total Registered Crops" 
            :value="totalCropsCount" 
            subtitle="Batches recorded in database"
            icon="🌾"
            trend="+100% Verified"
            trendType="positive"
          />
          <StatCard 
            title="Active In Cultivation" 
            :value="activeGrowingCount" 
            subtitle="Currently growing on farms"
            icon="🌱"
            trend="Monitored"
            trendType="neutral"
          />
          <StatCard 
            title="Harvest Ready Batches" 
            :value="harvestReadyCount" 
            subtitle="Expected harvest date met"
            icon="📦"
            trend="Ready for dispatch"
            trendType="positive"
          />
          <StatCard 
            title="Blockchain Ledger Synced" 
            :value="blockchainSyncedCount" 
            subtitle="Smart contract verified"
            icon="⛓️"
            trend="Ethereum EVM"
            trendType="positive"
          />
        </div>

        <!-- Quick Launch Action Bar -->
        <div class="quick-actions-bar">
          <div 
            v-if="canRegisterCrop"
            class="action-card" 
            @click="showAddForm = true; activeTab = 'crops'"
          >
            <div class="action-icon">➕</div>
            <div>
              <strong>Register Harvest</strong>
              <p>Add a new crop batch with geo-coordinates and dates</p>
            </div>
          </div>
          <div class="action-card" @click="navigateToTab('traceability')">
            <div class="action-icon">🔍</div>
            <div>
              <strong>Verify Traceability</strong>
              <p>Scan or inspect full crop provenance and packaging QR</p>
            </div>
          </div>
          <div 
            v-if="canAccessCustody"
            class="action-card" 
            @click="navigateToTab('custody')"
          >
            <div class="action-icon">🚚</div>
            <div>
              <strong>Transfer Custody</strong>
              <p>Hand over crop batch to Supplier or Retailer on-chain</p>
            </div>
          </div>
          <div 
            v-if="canAccessAiPricing"
            class="action-card" 
            @click="navigateToTab('ai-pricing')"
          >
            <div class="action-icon">📈</div>
            <div>
              <strong>AI Market Benchmark</strong>
              <p>Predict fair farmer mandi pricing via ML regression</p>
            </div>
          </div>
        </div>

        <!-- Section: Recent Registered Crops -->
        <div class="section-container">
          <div class="section-header">
            <div>
              <h2>Recent Crop Batches</h2>
              <p>Real-time records from PostgreSQL database &amp; Ethereum smart contract</p>
            </div>
            <button class="link-btn" @click="navigateToTab('crops')">
              View All Crops ({{ crops.length }}) ➔
            </button>
          </div>

          <CropsTable 
            :crops="crops.slice(0, 5)" 
            :loading="loadingCrops"
            :error="cropsError"
            :searchQuery="searchQuery"
            :selectedType="selectedType"
            @update:searchQuery="searchQuery = $event"
            @update:selectedType="selectedType = $event"
            @selectCrop="handleSelectCrop"
            @viewTraceability="handleViewTraceability"
            @retry="loadCropRecords"
          />
        </div>
      </div>

      <!-- 2. CROPS MANAGEMENT VIEW -->
      <div v-if="activeTab === 'crops'" class="tab-view animate-fade-in">
        <!-- Add Crop Inline Card -->
        <CropEntryForm 
          v-if="showAddForm"
          :farmerId="DEMO_FARMER_ID"
          :contractAddress="contractAddress"
          :chainId="Number(requiredChainId)"
          :walletAddress="walletAddress"
          @success="handleCropCreated"
          @cancel="showAddForm = false"
        />

        <div class="section-container">
          <div class="section-header">
            <div>
              <h2>Crop Inventory &amp; Production Management</h2>
              <p>Manage, filter, and inspect farm production records</p>
            </div>
            <button 
              v-if="!showAddForm && canRegisterCrop"
              class="btn-primary" 
              @click="showAddForm = true"
            >
              + Add Crop Batch
            </button>
          </div>

          <CropsTable 
            :crops="crops" 
            :loading="loadingCrops"
            :error="cropsError"
            :searchQuery="searchQuery"
            :selectedType="selectedType"
            @update:searchQuery="searchQuery = $event"
            @update:selectedType="selectedType = $event"
            @selectCrop="handleSelectCrop"
            @viewTraceability="handleViewTraceability"
            @retry="loadCropRecords"
          />
        </div>
      </div>

      <!-- 3. PUBLIC CONSUMER TRACEABILITY VIEW -->
      <div v-if="activeTab === 'traceability'" class="tab-view animate-fade-in">
        <ConsumerTraceability :initialCropId="traceabilityTargetId" />
      </div>

      <!-- 4. SUPPLY CHAIN / CUSTODY TRANSFER VIEW -->
      <div v-if="activeTab === 'custody'" class="tab-view animate-fade-in">
        <SupplierRetailer />
      </div>

      <!-- 5. AI PRICE PREDICTION VIEW -->
      <div v-if="activeTab === 'ai-pricing'" class="tab-view animate-fade-in">
        <AiPricePrediction />
      </div>

      <!-- 6. SYSTEM AUDIT / ADMIN VIEW -->
      <div v-if="activeTab === 'admin'" class="tab-view animate-fade-in">
        <div class="section-container">
          <div class="section-header">
            <div>
              <h2>System Audit &amp; User Accounts</h2>
              <p>Cryptographic access logs, registered roles, and smart contract parameters</p>
            </div>
          </div>

          <div class="admin-grid">
            <div class="panel">
              <h3 style="margin-bottom: 12px; font-size: 16px;">Platform Accounts</h3>
              <div v-if="loadingUsers" style="padding: 20px; text-align: center; color: #64748b;">
                Loading system accounts...
              </div>
              <div v-else class="table-responsive">
                <table class="modern-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Wallet Address</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="u in systemUsers" :key="u.id">
                      <td>#{{ u.id }}</td>
                      <td><strong>{{ u.username }}</strong></td>
                      <td><span class="role-tag" :class="u.role.toLowerCase()">{{ u.role }}</span></td>
                      <td class="font-mono">{{ u.wallet_address || '—' }}</td>
                      <td>{{ new Date(u.created_at).toLocaleDateString() }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="panel" style="padding: 24px;">
              <h3 style="margin-bottom: 12px; font-size: 16px;">Smart Contract Parameters</h3>
              <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px;">
                <div><strong>Contract Name:</strong> CropRegistry</div>
                <div><strong>Contract Address:</strong> <span class="font-mono">{{ contractAddress }}</span></div>
                <div><strong>Network:</strong> Local Ganache EVM</div>
                <div><strong>Chain ID:</strong> {{ requiredChainId.toString() }}</div>
                <div><strong>EVM State:</strong> {{ walletConnected ? 'Active & Synced' : 'Offline / Standby' }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Crop Details Inspection Modal -->
    <CropDetailsModal 
      v-if="selectedCropId !== null"
      :cropId="selectedCropId"
      @close="selectedCropId = null"
      @viewTraceability="handleViewTraceability"
    />

    <!-- Login Modal -->
    <AuthModal 
      v-if="showLoginModal"
      @loginSuccess="handleLoginSuccess"
      @continueAsGuest="showLoginModal = false"
    />

    <!-- Modern App Footer -->
    <footer class="app-footer">
      <div class="footer-container">
        <div>
          <span class="footer-brand">🌱 Farm Traceability System</span>
          <span class="footer-sub">Major Project Demonstration · FastAPI · Vue.js · Solidity · Supabase</span>
        </div>
        <div class="footer-meta">
          <span>Active Role: {{ userRole }}</span>
          <span>Farmer ID: {{ DEMO_FARMER_ID }}</span>
          <span>EVM Chain ID: {{ requiredChainId.toString() }}</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Header & Navigation */
.app-header {
  background: #0f172a;
  border-bottom: 1px solid #1e293b;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-container {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 24px;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-icon {
  font-size: 24px;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-info {
  display: flex;
  flex-direction: column;
}

.brand-title {
  color: #ffffff;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.brand-sub {
  color: #94a3b8;
  font-size: 11px;
}

.nav-links {
  display: flex;
  gap: 4px;
  background: rgba(30, 41, 59, 0.7);
  padding: 4px;
  border-radius: 12px;
}

.nav-item {
  color: #94a3b8;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.15s;
}

.nav-item:hover {
  color: #ffffff;
}

.nav-item.active {
  background: #10b981;
  color: #ffffff;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.08);
  padding: 4px 10px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.role-tag {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

.role-tag.farmer { background: #dcfce7; color: #166534; }
.role-tag.supplier { background: #e0f2fe; color: #075985; }
.role-tag.retailer { background: #fef3c7; color: #92400e; }
.role-tag.consumer { background: #f3e8ff; color: #6b21a8; }
.role-tag.admin { background: #fee2e2; color: #991b1b; }

.username {
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
}

.btn-logout {
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  padding: 0 4px;
}

.btn-logout:hover {
  color: #ffffff;
}

.btn-login-trigger {
  padding: 8px 14px;
  background: #059669;
  color: #ffffff;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-login-trigger:hover {
  background: #047857;
}

.wallet-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e2e8f0;
  transition: all 0.2s;
}

.wallet-badge:hover {
  background: rgba(255, 255, 255, 0.15);
}

.wallet-badge.connected {
  border-color: #059669;
  background: rgba(16, 185, 129, 0.12);
  color: #86efac;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
}

.wallet-badge.connected .status-dot {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

/* Hero Strip */
.hero-strip {
  background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
  color: #ffffff;
  padding: 36px 0 44px;
  border-bottom: 1px solid #334155;
}

.hero-container {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.role-chip {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: #34d399;
  margin-bottom: 6px;
}

.hero-strip h1 {
  font-size: 28px;
  font-weight: 800;
  margin-bottom: 8px;
}

.hero-strip p {
  color: #cbd5e1;
  font-size: 14px;
  max-width: 600px;
}

.hero-actions {
  display: flex;
  gap: 12px;
}

.btn-hero-primary {
  padding: 12px 22px;
  background: #10b981;
  color: #ffffff;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  transition: all 0.15s;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.btn-hero-primary:hover {
  background: #059669;
  transform: translateY(-1px);
}

.btn-hero-secondary {
  padding: 12px 18px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ffffff;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
}

.btn-hero-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* Main Content */
.main-content {
  flex: 1;
  max-width: 1240px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 24px 64px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  margin-bottom: 28px;
}

.quick-actions-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.action-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.action-card:hover {
  border-color: #10b981;
  transform: translateY(-2px);
  box-shadow: 0 8px 16px -2px rgba(16, 185, 129, 0.1);
}

.action-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: #ecfdf5;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.action-card strong {
  font-size: 14px;
  color: #0f172a;
  display: block;
  margin-bottom: 2px;
}

.action-card p {
  font-size: 11px;
  color: #64748b;
  margin: 0;
  line-height: 1.3;
}

.section-container {
  margin-bottom: 32px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 18px;
}

.section-header h2 {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 4px;
}

.section-header p {
  font-size: 13px;
  color: #64748b;
}

.link-btn {
  font-size: 13px;
  font-weight: 700;
  color: #059669;
}

.link-btn:hover {
  text-decoration: underline;
}

.btn-primary {
  padding: 10px 18px;
  background: #059669;
  color: #ffffff;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
}

.btn-primary:hover {
  background: #047857;
}

/* Toast Banner */
.toast-banner {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 1000;
  padding: 14px 20px;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
}

.toast-banner.success {
  background: #047857;
  color: #ffffff;
}

.toast-banner.error {
  background: #b91c1c;
  color: #ffffff;
}

.toast-banner.info {
  background: #1e293b;
  color: #ffffff;
}

.toast-icon {
  font-weight: 800;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

/* Footer */
.app-footer {
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  padding: 24px 0;
  margin-top: auto;
}

.footer-container {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
}

.footer-brand {
  font-weight: 700;
  color: #0f172a;
  display: block;
}

.footer-sub {
  color: #64748b;
  font-size: 12px;
}

.footer-meta {
  display: flex;
  gap: 16px;
  color: #64748b;
  font-size: 12px;
}

.admin-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
}

@media (max-width: 900px) {
  .header-container {
    height: auto;
    padding: 14px 20px;
    flex-direction: column;
    align-items: stretch;
  }
  .nav-links {
    overflow-x: auto;
  }
  .admin-grid {
    grid-template-columns: 1fr;
  }
}
</style>
