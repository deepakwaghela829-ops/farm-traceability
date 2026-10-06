<script setup lang="ts">
import { ref, onMounted, computed, defineAsyncComponent } from 'vue'
import { 
  fetchCrops, 
  fetchCurrentUser,
  fetchSystemUsers,
  type CropRecord, 
  type UserProfile
} from './api'
import { quickCheckGanache, GANACHE_RPC, CONTRACT_ADDRESS, REQUIRED_CHAIN_ID } from './blockchainService'

// Dedicated Role Portal Components (Code Split via defineAsyncComponent)
import LoginPage from './components/common/LoginPage.vue'
const FarmerDashboard = defineAsyncComponent(() => import('./components/farmer/FarmerDashboard.vue'))
const SupplierDashboard = defineAsyncComponent(() => import('./components/supplier/SupplierDashboard.vue'))
const RetailerDashboard = defineAsyncComponent(() => import('./components/retailer/RetailerDashboard.vue'))
const ConsumerPortal = defineAsyncComponent(() => import('./components/consumer/ConsumerPortal.vue'))
const AdminDashboard = defineAsyncComponent(() => import('./components/admin/AdminDashboard.vue'))

// Role & Session State
type RoleType = 'FARMER' | 'SUPPLIER' | 'RETAILER' | 'CONSUMER' | 'ADMIN'
const currentUser = ref<UserProfile | null>(null)
const authToken = ref<string>(localStorage.getItem('agritrace_token') || '')
const isPublicGuest = ref<boolean>(false)

// Blockchain Constants & Connection
const contractAddress = CONTRACT_ADDRESS
const requiredChainId = REQUIRED_CHAIN_ID

const walletAddress = ref('')
const walletConnected = ref(false)

// Data State
const crops = ref<CropRecord[]>([])
const loadingCrops = ref(false)
const cropsError = ref('')
const systemUsers = ref<UserProfile[]>([])
const loadingUsers = ref(false)
const targetTraceCropId = ref<string | number | undefined>(undefined)

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

// Current User Role
const activeRole = computed<RoleType | 'GUEST' | 'NONE'>(() => {
  if (currentUser.value?.role) {
    return currentUser.value.role as RoleType
  }
  if (isPublicGuest.value) {
    return 'GUEST'
  }
  return 'NONE'
})

// Authentication Handlers
function handleLoginSuccess(data: { user: UserProfile; token: string }) {
  currentUser.value = data.user
  authToken.value = data.token
  isPublicGuest.value = false
  localStorage.setItem('agritrace_token', data.token)
  
  if (data.user.wallet_address) {
    walletAddress.value = data.user.wallet_address
  }

  // Update hash route based on role
  const roleSlug = data.user.role.toLowerCase()
  window.location.hash = `#/${roleSlug}`

  showToast(`Welcome back, ${data.user.full_name || data.user.username} (${data.user.role})!`, 'success')

  loadCropRecords()
  connectGanache()

  if (data.user.role === 'ADMIN') {
    loadSystemUsers()
  }
}

function handleLogout() {
  currentUser.value = null
  authToken.value = ''
  isPublicGuest.value = false
  crops.value = []
  systemUsers.value = []
  localStorage.removeItem('agritrace_token')
  window.location.hash = '#/login'
  showToast('Logged out successfully.', 'info')
}

function handleGuestAccess() {
  isPublicGuest.value = true
  currentUser.value = null
  window.location.hash = '#/consumer'
}

function handleOpenLogin() {
  isPublicGuest.value = false
  currentUser.value = null
  window.location.hash = '#/login'
}

// Fetch Crops from API
async function loadCropRecords() {
  loadingCrops.value = true
  cropsError.value = ''
  try {
    crops.value = await fetchCrops()
  } catch (err: any) {
    cropsError.value = err.message || 'Unable to connect to FastAPI backend.'
  } finally {
    loadingCrops.value = false
  }
}

// Fetch Admin Users
async function loadSystemUsers() {
  if (!authToken.value) return
  loadingUsers.value = true
  try {
    systemUsers.value = await fetchSystemUsers(authToken.value)
  } catch {
    systemUsers.value = []
  } finally {
    loadingUsers.value = false
  }
}

// Blockchain connection (Lightweight JSON-RPC probe)
async function connectGanache() {
  try {
    const res = await quickCheckGanache(GANACHE_RPC)
    if (res.connected && res.accounts.length > 0) {
      if (!walletAddress.value) {
        walletAddress.value = res.accounts[0]
      }
      walletConnected.value = true
    } else {
      walletConnected.value = false
    }
  } catch {
    walletConnected.value = false
  }
}

// Session validation on load
async function checkAuthSession() {
  if (authToken.value) {
    try {
      const user = await fetchCurrentUser(authToken.value)
      currentUser.value = user
      if (user.wallet_address) {
        walletAddress.value = user.wallet_address
      }
      if (user.role === 'ADMIN') {
        loadSystemUsers()
      }
    } catch {
      localStorage.removeItem('agritrace_token')
      authToken.value = ''
      currentUser.value = null
    }
  }
}

// Hash Routing Synchronization & Protection
function handleHashRoute() {
  const hash = window.location.hash

  // Public QR Traceability deep link e.g. #trace-1 or #/consumer/trace/1
  if (hash.startsWith('#trace-')) {
    targetTraceCropId.value = hash.replace('#trace-', '')
    isPublicGuest.value = true
    return
  }
  if (hash.startsWith('#/consumer/trace/')) {
    targetTraceCropId.value = hash.replace('#/consumer/trace/', '')
    isPublicGuest.value = true
    return
  }

  // Consumer direct route
  if (hash === '#/consumer' || hash === '#consumer') {
    isPublicGuest.value = true
    return
  }

  // Explicit login route
  if (hash === '#/login' || hash === '#login') {
    isPublicGuest.value = false
    return
  }

  // If authenticated user enters a hash, enforce authorization
  if (currentUser.value) {
    const userRole = currentUser.value.role.toLowerCase()

    // If visiting root or login, redirect to role portal
    if (!hash || hash === '#/' || hash === '#/login') {
      window.location.hash = `#/${userRole}`
      return
    }

    // Role Route Protection (e.g. Supplier cannot access #/farmer)
    const roleRoutes: Record<string, string> = {
      '#/farmer': 'FARMER',
      '#/supplier': 'SUPPLIER',
      '#/retailer': 'RETAILER',
      '#/admin': 'ADMIN',
      '#admin': 'ADMIN',
    }

    for (const [routePrefix, requiredRole] of Object.entries(roleRoutes)) {
      if (hash.startsWith(routePrefix) && currentUser.value.role !== requiredRole) {
        // Redirect back to user's authorized role dashboard
        showToast(`Access restricted: ${currentUser.value.role} cannot view ${requiredRole} portal.`, 'error')
        window.location.hash = `#/${userRole}`
        return
      }
    }
  } else if (!isPublicGuest.value) {
    // Unauthenticated user attempting to visit internal dashboard
    if (hash && hash !== '#/login') {
      window.location.hash = '#/login'
    }
  }
}

function handleCropCreated(newCrop: CropRecord) {
  showToast(`Crop "${newCrop.crop_name}" registered & synced successfully!`, 'success')
  loadCropRecords()
}

onMounted(async () => {
  await checkAuthSession()
  handleHashRoute()
  window.addEventListener('hashchange', handleHashRoute)

  // Only load crops and connect Ganache if authenticated in an internal role
  if (currentUser.value) {
    loadCropRecords()
    connectGanache()
  }
})
</script>

<template>
  <div class="app-root">
    <!-- Toast Notification -->
    <transition name="toast-fade">
      <div v-if="toast" :class="['toast-banner', toast.type]">
        <span class="toast-icon">
          {{ toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ' }}
        </span>
        <span>{{ toast.message }}</span>
      </div>
    </transition>

    <!-- 1. LOGIN SCREEN -->
    <LoginPage
      v-if="activeRole === 'NONE'"
      @login-success="handleLoginSuccess"
      @guest-access="handleGuestAccess"
    />

    <!-- 2. FARMER PORTAL -->
    <FarmerDashboard
      v-else-if="activeRole === 'FARMER' && currentUser"
      :current-user="currentUser"
      :crops="crops"
      :loading-crops="loadingCrops"
      :crops-error="cropsError"
      :wallet-address="walletAddress"
      :blockchain-connected="walletConnected"
      @logout="handleLogout"
      @refresh-crops="loadCropRecords"
      @crop-created="handleCropCreated"
    />

    <!-- 3. SUPPLIER PORTAL -->
    <SupplierDashboard
      v-else-if="activeRole === 'SUPPLIER' && currentUser"
      :current-user="currentUser"
      :crops="crops"
      :wallet-address="walletAddress"
      :blockchain-connected="walletConnected"
      @logout="handleLogout"
      @refresh="loadCropRecords"
    />

    <!-- 4. RETAILER PORTAL -->
    <RetailerDashboard
      v-else-if="activeRole === 'RETAILER' && currentUser"
      :current-user="currentUser"
      :crops="crops"
      :wallet-address="walletAddress"
      :blockchain-connected="walletConnected"
      @logout="handleLogout"
      @refresh="loadCropRecords"
    />

    <!-- 5. CONSUMER PUBLIC PORTAL -->
    <ConsumerPortal
      v-else-if="activeRole === 'CONSUMER' || activeRole === 'GUEST'"
      :initial-crop-id="targetTraceCropId"
      @open-login="handleOpenLogin"
    />

    <!-- 6. ADMIN PORTAL -->
    <AdminDashboard
      v-else-if="activeRole === 'ADMIN' && currentUser"
      :current-user="currentUser"
      :crops="crops"
      :system-users="systemUsers"
      :loading-users="loadingUsers"
      :wallet-address="walletAddress"
      :blockchain-connected="walletConnected"
      @logout="handleLogout"
      @refresh="() => { loadCropRecords(); loadSystemUsers(); }"
    />
  </div>
</template>

<style>
/* Global Layout Foundation */
body, html {
  margin: 0;
  padding: 0;
  background-color: #020617;
  color: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.app-root {
  min-height: 100vh;
  position: relative;
}

/* Toast Notification Styles */
.toast-banner {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.25rem;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
}

.toast-banner.success {
  background: rgba(6, 78, 59, 0.95);
  border: 1px solid #10b981;
  color: #ecfdf5;
}

.toast-banner.error {
  background: rgba(127, 29, 29, 0.95);
  border: 1px solid #ef4444;
  color: #fef2f2;
}

.toast-banner.info {
  background: rgba(30, 58, 138, 0.95);
  border: 1px solid #3b82f6;
  color: #eff6ff;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
