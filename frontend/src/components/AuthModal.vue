<script setup lang="ts">
import { ref, reactive } from 'vue'
import { loginUser, type UserProfile } from '../api'

const emit = defineEmits<{
  (e: 'loginSuccess', data: { user: UserProfile; token: string }): void
  (e: 'continueAsGuest'): void
}>()

const form = reactive({
  username: 'farmer1',
  password: 'farmer123',
})

const loading = ref(false)
const errorMessage = ref('')

// Predefined demo accounts for one-click testing during viva/evaluation
const demoAccounts = [
  { role: 'FARMER', username: 'farmer1', title: 'Lead Farmer', desc: 'Registers crops, harvest dates & views AI forecast' },
  { role: 'SUPPLIER', username: 'supplier1', title: 'Agro Logistics', desc: 'Inspects wholesale lots & transfers custody' },
  { role: 'RETAILER', username: 'retailer1', title: 'Fresh Retailer', desc: 'Receives batches & manages retail shelf custody' },
  { role: 'CONSUMER', username: 'consumer1', title: 'Food Consumer', desc: 'Verifies provenance, traceability & authentic origin' },
  { role: 'ADMIN', username: 'admin1', title: 'System Admin', desc: 'Audits ledger, accounts & all system transactions' },
]

function fillDemoAccount(acc: typeof demoAccounts[0]) {
  form.username = acc.username
  form.password = `${acc.username}23` // standard demo password formula
  errorMessage.value = ''
}

async function handleLogin() {
  if (!form.username || !form.password) {
    errorMessage.value = 'Please provide both username and password.'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const res = await loginUser(form.username, form.password)
    emit('loginSuccess', { user: res.user, token: res.access_token })
  } catch (err: any) {
    errorMessage.value = err.message || 'Authentication failed. Please verify credentials.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-wrapper">
    <div class="auth-card">
      <div class="brand-badge">
        <span class="icon">🌱</span>
        <span class="title">AGRITRACE OS</span>
      </div>

      <h2>Secure Role-Based Portal</h2>
      <p class="subtitle">
        Enter your platform credentials or select a verified role account below.
      </p>

      <div v-if="errorMessage" class="error-banner">
        <span>⚠️</span>
        <div>{{ errorMessage }}</div>
      </div>

      <form @submit.prevent="handleLogin" class="auth-form">
        <div class="form-group">
          <label>Username / Account ID</label>
          <input 
            v-model="form.username" 
            type="text" 
            placeholder="e.g. farmer1" 
            required 
          />
        </div>

        <div class="form-group">
          <label>Password</label>
          <input 
            v-model="form.password" 
            type="password" 
            placeholder="••••••••" 
            required 
          />
        </div>

        <button type="submit" class="btn-login" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          <span>{{ loading ? 'Authenticating...' : 'Sign In to AgriTrace' }}</span>
        </button>
      </form>

      <!-- One-click Demo Accounts Selector -->
      <div class="demo-section">
        <div class="demo-divider">
          <span>ONE-CLICK DEMO ROLES (FOR EVALUATION)</span>
        </div>

        <div class="demo-grid">
          <div 
            v-for="acc in demoAccounts" 
            :key="acc.role" 
            class="demo-chip"
            :class="{ active: form.username === acc.username }"
            @click="fillDemoAccount(acc)"
          >
            <div class="chip-top">
              <span class="role-badge" :class="acc.role.toLowerCase()">{{ acc.role }}</span>
              <span class="user-text font-mono">{{ acc.username }}</span>
            </div>
            <div class="chip-title">{{ acc.title }}</div>
            <div class="chip-desc">{{ acc.desc }}</div>
          </div>
        </div>
      </div>

      <div class="auth-footer">
        <button class="btn-guest" @click="emit('continueAsGuest')">
          Browse as Public Consumer (No Login Required) ➔
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-wrapper {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: radial-gradient(circle at 50% 20%, #1e293b 0%, #0f172a 100%);
}

.auth-card {
  max-width: 540px;
  width: 100%;
  background: #ffffff;
  border-radius: 24px;
  padding: 36px 40px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.1);
  animation: fadeIn 0.3s ease-out;
}

.brand-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 6px 14px;
  border-radius: 9999px;
  margin-bottom: 16px;
}

.brand-badge .icon {
  font-size: 16px;
}

.brand-badge .title {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: #065f46;
}

.auth-card h2 {
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 6px;
}

.subtitle {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 24px;
}

.error-banner {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}

.form-group input {
  padding: 11px 14px;
  font-size: 14px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #f8fafc;
  outline: none;
  transition: all 0.15s;
}

.form-group input:focus {
  border-color: #10b981;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
}

.btn-login {
  margin-top: 6px;
  padding: 12px 20px;
  background: #059669;
  color: #ffffff;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.15s;
}

.btn-login:hover:not(:disabled) {
  background: #047857;
}

.btn-login:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.demo-section {
  margin-top: 28px;
}

.demo-divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin-bottom: 14px;
}

.demo-divider span {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #94a3b8;
  width: 100%;
}

.demo-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.demo-chip {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.demo-chip:hover {
  border-color: #10b981;
  background: #ffffff;
  transform: translateX(2px);
}

.demo-chip.active {
  border-color: #059669;
  background: #ecfdf5;
}

.chip-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.role-badge {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}

.role-badge.farmer { background: #dcfce7; color: #166534; }
.role-badge.supplier { background: #e0f2fe; color: #075985; }
.role-badge.retailer { background: #fef3c7; color: #92400e; }
.role-badge.consumer { background: #f3e8ff; color: #6b21a8; }
.role-badge.admin { background: #fee2e2; color: #991b1b; }

.user-text {
  font-size: 11px;
  color: #64748b;
}

.chip-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.chip-desc {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.auth-footer {
  margin-top: 24px;
  text-align: center;
  border-top: 1px solid #f1f5f9;
  padding-top: 16px;
}

.btn-guest {
  font-size: 13px;
  font-weight: 600;
  color: #059669;
  cursor: pointer;
}

.btn-guest:hover {
  text-decoration: underline;
}

.font-mono {
  font-family: monospace;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #ffffff;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 600px) {
  .auth-card {
    padding: 24px 20px;
  }
}
</style>
