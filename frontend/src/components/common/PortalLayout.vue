<script setup lang="ts">
import { computed } from 'vue'
import type { UserProfile } from '../../api'

export interface NavItem {
  id: string
  label: string
  icon: string
  badge?: string | number
}

const props = defineProps<{
  portalTitle: string
  portalSubtitle: string
  portalIcon: string
  role: string
  currentUser: UserProfile | null
  activeNav: string
  navItems: NavItem[]
  walletAddress?: string
  blockchainConnected?: boolean
}>()

const emit = defineEmits<{
  (e: 'navigate', id: string): void
  (e: 'logout'): void
  (e: 'connectWallet'): void
}>()

const shortWallet = computed(() => {
  if (!props.walletAddress) return 'Connect Ganache'
  return `${props.walletAddress.slice(0, 6)}...${props.walletAddress.slice(-4)}`
})
</script>

<template>
  <div class="portal-layout">
    <!-- Role Sidebar -->
    <aside class="portal-sidebar">
      <!-- Portal Brand Identity -->
      <div class="sidebar-brand">
        <div class="portal-avatar">{{ portalIcon }}</div>
        <div class="brand-text">
          <span class="portal-kicker">{{ role }} PORTAL</span>
          <h2 class="portal-name">{{ portalTitle }}</h2>
        </div>
      </div>

      <!-- Navigation Links -->
      <nav class="sidebar-nav">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="nav-btn"
          :class="{ active: activeNav === item.id }"
          @click="emit('navigate', item.id)"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
          <span v-if="item.badge !== undefined" class="nav-badge">{{ item.badge }}</span>
        </button>
      </nav>

      <!-- Blockchain & Session Status Footer -->
      <div class="sidebar-footer">
        <div class="chain-status-box">
          <div class="status-indicator">
            <span class="status-pulse" :class="{ connected: blockchainConnected }"></span>
            <span class="chain-name">Ganache EVM (1337)</span>
          </div>
          <div v-if="walletAddress" class="wallet-mono" :title="walletAddress">
            {{ shortWallet }}
          </div>
        </div>

        <div v-if="currentUser" class="user-profile-box">
          <div class="user-info">
            <span class="user-display">{{ currentUser.full_name || currentUser.username }}</span>
            <span class="user-role-tag" :class="currentUser.role.toLowerCase()">{{ currentUser.role }}</span>
          </div>
          <button type="button" class="btn-logout" @click="emit('logout')" title="Sign Out">
            🚪 Logout
          </button>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <div class="portal-body">
      <!-- Top header strip -->
      <header class="portal-topbar">
        <div>
          <h1 class="topbar-title">{{ portalSubtitle }}</h1>
        </div>
        <div class="topbar-actions">
          <slot name="top-actions"></slot>
        </div>
      </header>

      <!-- Slot for main view content -->
      <main class="portal-main">
        <slot></slot>
      </main>
    </div>
  </div>
</template>

<style scoped>
.portal-layout {
  display: flex;
  min-height: 100vh;
  background: #020617;
  color: #f8fafc;
  font-family: inherit;
}

.portal-sidebar {
  width: 260px;
  background: #0f172a;
  border-right: 1px solid #1e293b;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  box-sizing: border-box;
}

.sidebar-brand {
  padding: 1.5rem 1.25rem;
  border-bottom: 1px solid #1e293b;
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.portal-avatar {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: #1e293b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  flex-shrink: 0;
}

.portal-kicker {
  display: block;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #10b981;
}

.portal-name {
  margin: 0.1rem 0 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: #f8fafc;
}

.sidebar-nav {
  padding: 1rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.7rem 0.9rem;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease-in-out;
}

.nav-btn:hover {
  background: #1e293b;
  color: #f1f5f9;
}

.nav-btn.active {
  background: #10b981;
  color: #022c22;
}

.nav-btn.active .nav-icon {
  filter: drop-shadow(0 0 2px rgba(0,0,0,0.4));
}

.nav-btn.active .nav-badge {
  background: #022c22;
  color: #10b981;
}

.nav-icon {
  font-size: 1.1rem;
}

.nav-label {
  flex: 1;
}

.nav-badge {
  font-size: 0.75rem;
  padding: 0.1rem 0.45rem;
  border-radius: 12px;
  background: #334155;
  color: #cbd5e1;
}

.sidebar-footer {
  padding: 1rem 1.25rem;
  border-top: 1px solid #1e293b;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  background: #090e1a;
}

.chain-status-box {
  background: #0f172a;
  border: 1px solid #1e293b;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.78rem;
  color: #cbd5e1;
}

.status-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
}

.status-pulse.connected {
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}

.chain-name {
  font-weight: 600;
}

.wallet-mono {
  margin-top: 0.25rem;
  font-family: monospace;
  font-size: 0.75rem;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-profile-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-display {
  font-size: 0.85rem;
  font-weight: 700;
  color: #f1f5f9;
}

.user-role-tag {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
}

.user-role-tag.farmer { color: #4ade80; }
.user-role-tag.supplier { color: #60a5fa; }
.user-role-tag.retailer { color: #fbbf24; }
.user-role-tag.consumer { color: #c084fc; }
.user-role-tag.admin { color: #f87171; }

.btn-logout {
  background: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 0.35rem 0.6rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-logout:hover {
  background: #450a0a;
  border-color: #991b1b;
  color: #fca5a5;
}

.portal-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #020617;
}

.portal-topbar {
  height: 64px;
  padding: 0 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #1e293b;
  background: #0b1329;
}

.topbar-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #f8fafc;
}

.portal-main {
  flex: 1;
  padding: 1.75rem 2rem;
  overflow-y: auto;
}

@media (max-width: 900px) {
  .portal-layout {
    flex-direction: column;
  }
  .portal-sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #1e293b;
  }
  .sidebar-nav {
    flex-direction: row;
    overflow-x: auto;
  }
  .nav-btn {
    white-space: nowrap;
    width: auto;
  }
  .sidebar-footer {
    display: none;
  }
  .portal-topbar {
    padding: 0 1rem;
  }
  .portal-main {
    padding: 1rem;
  }
}
</style>
