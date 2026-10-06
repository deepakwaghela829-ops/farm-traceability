<script setup lang="ts">
import { ref, reactive } from 'vue'
import { loginUser, type UserProfile } from '../../api'

const emit = defineEmits<{
  (e: 'loginSuccess', data: { user: UserProfile; token: string }): void
  (e: 'guestAccess'): void
}>()

const form = reactive({
  username: 'farmer1',
  password: 'farmer123',
})

const loading = ref(false)
const errorMessage = ref('')

const demoRoles = [
  { role: 'FARMER', username: 'farmer1', title: 'Farmer Portal', desc: 'Crop registration, harvest tracking & AI pricing', icon: '🌾' },
  { role: 'SUPPLIER', username: 'supplier1', title: 'Supplier Portal', desc: 'Wholesale transit, incoming shipments & custody handover', icon: '🚚' },
  { role: 'RETAILER', username: 'retailer1', title: 'Retailer Portal', desc: 'Retail inventory, shelf receipt & consumer verification', icon: '🏪' },
  { role: 'CONSUMER', username: 'consumer1', title: 'Consumer Portal', desc: 'Public food origin scan & blockchain provenance timeline', icon: '🔍' },
  { role: 'ADMIN', username: 'admin1', title: 'Admin Audit Portal', desc: 'System governance, user roles & smart contract audit', icon: '🛡️' },
]

function selectDemoRole(roleItem: typeof demoRoles[0]) {
  form.username = roleItem.username
  form.password = `${roleItem.username}23`
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
  <div class="login-page">
    <div class="login-container">
      <!-- Left brand overview -->
      <div class="login-brand-side">
        <div class="brand-header">
          <div class="logo-box">🌱</div>
          <div>
            <h1 class="brand-title">AGRITRACE OS</h1>
            <p class="brand-subtitle">Enterprise Farm-to-Table Traceability Ledger</p>
          </div>
        </div>

        <div class="brand-tagline">
          <h2>Cryptographic Trust Across the Agricultural Value Chain</h2>
          <p>
            An end-to-end provenance architecture combining Ethereum smart contracts,
            PostgreSQL relational auditing, explainable AI pricing, and packaging QR codes.
          </p>
        </div>

        <div class="portal-cards-preview">
          <div class="portal-chip">🌾 <strong>Farmer:</strong> Register Harvests & AI Fair Pricing</div>
          <div class="portal-chip">🚚 <strong>Supplier:</strong> On-Chain Custody Logistics</div>
          <div class="portal-chip">🏪 <strong>Retailer:</strong> Store Inventory & Shelf Delivery</div>
          <div class="portal-chip">🔍 <strong>Consumer:</strong> Tamper-Proof Seed-to-Shelf Audit</div>
        </div>

        <div class="brand-foot">
          <span>Powered by Ethereum Ganache & PostgreSQL Supabase</span>
        </div>
      </div>

      <!-- Right auth card -->
      <div class="login-card-side">
        <div class="login-card">
          <div class="card-header">
            <h2>Select Portal & Sign In</h2>
            <p>Access your dedicated role dashboard or explore as public consumer.</p>
          </div>

          <div v-if="errorMessage" class="error-banner">
            <span>⚠️</span>
            <div>{{ errorMessage }}</div>
          </div>

          <form @submit.prevent="handleLogin" class="auth-form">
            <div class="form-group">
              <label>Account ID / Username</label>
              <input
                v-model="form.username"
                type="text"
                placeholder="e.g. farmer1"
                required
                autocomplete="username"
              />
            </div>

            <div class="form-group">
              <label>Password</label>
              <input
                v-model="form.password"
                type="password"
                placeholder="••••••••"
                required
                autocomplete="current-password"
              />
            </div>

            <button type="submit" class="btn-primary-login" :disabled="loading">
              <span v-if="loading" class="spinner"></span>
              <span>{{ loading ? 'Verifying Credentials...' : 'Sign In to AgriTrace' }}</span>
            </button>
          </form>

          <!-- Quick Viva Demo Role Selector -->
          <div class="demo-role-section">
            <div class="demo-divider">
              <span>ONE-CLICK VIVA EVALUATION ROLES</span>
            </div>

            <div class="role-grid">
              <button
                v-for="r in demoRoles"
                :key="r.role"
                type="button"
                class="role-card-btn"
                :class="{ active: form.username === r.username }"
                @click="selectDemoRole(r)"
              >
                <div class="role-card-header">
                  <span class="role-icon">{{ r.icon }}</span>
                  <span class="role-tag" :class="r.role.toLowerCase()">{{ r.role }}</span>
                  <span class="user-mono">{{ r.username }}</span>
                </div>
                <div class="role-name">{{ r.title }}</div>
                <div class="role-desc">{{ r.desc }}</div>
              </button>
            </div>
          </div>

          <div class="public-guest-footer">
            <button type="button" class="btn-guest-link" @click="emit('guestAccess')">
              🔍 Open Public Consumer Traceability (No Login Required) ➔
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 10% 20%, #0f172a 0%, #020617 90%);
  padding: 2rem 1.5rem;
  box-sizing: border-box;
  font-family: inherit;
}

.login-container {
  display: flex;
  width: 100%;
  max-width: 1120px;
  min-height: 640px;
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.login-brand-side {
  flex: 1.1;
  background: linear-gradient(145deg, #0b1329 0%, #061c28 100%);
  padding: 3.5rem 3rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-right: 1px solid #1e293b;
  box-sizing: border-box;
}

.brand-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.logo-box {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #064e3b;
  border: 1px solid #059669;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
}

.brand-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: #f8fafc;
}

.brand-subtitle {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.brand-tagline h2 {
  font-size: 1.85rem;
  line-height: 1.25;
  color: #f1f5f9;
  margin: 2rem 0 1rem;
  font-weight: 700;
}

.brand-tagline p {
  color: #94a3b8;
  font-size: 0.95rem;
  line-height: 1.6;
  margin: 0;
}

.portal-cards-preview {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 2rem 0;
}

.portal-chip {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid #1e293b;
  padding: 0.65rem 1rem;
  border-radius: 8px;
  color: #cbd5e1;
  font-size: 0.88rem;
}

.portal-chip strong {
  color: #10b981;
}

.brand-foot {
  color: #64748b;
  font-size: 0.8rem;
}

.login-card-side {
  flex: 1.3;
  padding: 3rem 2.5rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
}

.login-card {
  width: 100%;
}

.card-header h2 {
  font-size: 1.45rem;
  color: #f8fafc;
  margin: 0 0 0.35rem;
  font-weight: 700;
}

.card-header p {
  color: #94a3b8;
  font-size: 0.9rem;
  margin: 0 0 1.5rem;
}

.error-banner {
  background: #450a0a;
  border: 1px solid #991b1b;
  color: #fecaca;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  display: flex;
  gap: 0.6rem;
  font-size: 0.88rem;
  margin-bottom: 1.25rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-group label {
  color: #cbd5e1;
  font-size: 0.82rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.form-group input {
  background: #0b1329;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  color: #f8fafc;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input:focus {
  border-color: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
}

.btn-primary-login {
  margin-top: 0.5rem;
  background: #10b981;
  color: #022c22;
  border: none;
  padding: 0.85rem 1.25rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: background 0.2s, transform 0.1s;
}

.btn-primary-login:hover:not(:disabled) {
  background: #059669;
  color: #ffffff;
}

.btn-primary-login:active:not(:disabled) {
  transform: translateY(1px);
}

.btn-primary-login:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.demo-role-section {
  margin-top: 1.75rem;
}

.demo-divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin-bottom: 0.85rem;
}

.demo-divider::before,
.demo-divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #1e293b;
}

.demo-divider span {
  padding: 0 0.75rem;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.role-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.55rem;
}

.role-card-btn {
  background: #0b1329;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 0.65rem 0.75rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.role-card-btn:hover {
  border-color: #334155;
  background: #131d38;
}

.role-card-btn.active {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.08);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25);
}

.role-card-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.role-icon {
  font-size: 1rem;
}

.role-tag {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  text-transform: uppercase;
}

.role-tag.farmer { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
.role-tag.supplier { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
.role-tag.retailer { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.role-tag.consumer { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
.role-tag.admin { background: rgba(239, 68, 68, 0.2); color: #f87171; }

.user-mono {
  font-family: monospace;
  font-size: 0.75rem;
  color: #94a3b8;
  margin-left: auto;
}

.role-name {
  font-weight: 600;
  font-size: 0.85rem;
  color: #f1f5f9;
}

.role-desc {
  font-size: 0.73rem;
  color: #64748b;
  line-height: 1.25;
}

.public-guest-footer {
  margin-top: 1.5rem;
  text-align: center;
  border-top: 1px solid #1e293b;
  padding-top: 1.25rem;
}

.btn-guest-link {
  background: none;
  border: none;
  color: #38bdf8;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  transition: color 0.2s;
}

.btn-guest-link:hover {
  color: #7dd3fc;
  text-decoration: underline;
}

@media (max-width: 900px) {
  .login-container {
    flex-direction: column;
    max-width: 520px;
  }
  .login-brand-side {
    display: none;
  }
  .login-card-side {
    padding: 2rem 1.5rem;
  }
  .role-grid {
    grid-template-columns: 1fr;
  }
}
</style>
