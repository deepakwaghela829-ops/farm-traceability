<script setup lang="ts">
import { ref } from 'vue'
import ConsumerTraceability from '../ConsumerTraceability.vue'

const props = defineProps<{
  initialCropId?: string | number
}>()

const emit = defineEmits<{
  (e: 'openLogin'): void
}>()

const activeTab = ref<'verify' | 'how-it-works' | 'about'>('verify')
</script>

<template>
  <div class="consumer-public-portal">
    <!-- Public Header (No internal farmer/wallet chips) -->
    <header class="public-navbar">
      <div class="public-nav-container">
        <div class="public-brand">
          <div class="logo-leaf">🌱</div>
          <div>
            <h1 class="brand-text">AGRITRACE</h1>
            <span class="sub-text">Public Food Provenance Verification</span>
          </div>
        </div>

        <nav class="public-links">
          <button
            type="button"
            class="link-btn"
            :class="{ active: activeTab === 'verify' }"
            @click="activeTab = 'verify'"
          >
            Product Verification
          </button>
          <button
            type="button"
            class="link-btn"
            :class="{ active: activeTab === 'how-it-works' }"
            @click="activeTab = 'how-it-works'"
          >
            How It Works
          </button>
          <button
            type="button"
            class="link-btn"
            :class="{ active: activeTab === 'about' }"
            @click="activeTab = 'about'"
          >
            About AgriTrace
          </button>
        </nav>

        <div class="public-auth-btn">
          <button type="button" class="btn-signin-portal" @click="emit('openLogin')">
            Supply Chain Portal Sign In ➔
          </button>
        </div>
      </div>
    </header>

    <!-- Public Hero Strip -->
    <section class="consumer-hero">
      <div class="hero-content">
        <span class="hero-pill">🛡️ DECENTRALIZED FOOD SAFETY & PROVENANCE</span>
        <h2>Verify Your Farm-to-Table Food Journey</h2>
        <p>
          Scan the QR code printed on your product packaging or enter the Crop Batch ID below.
          Every agricultural lifecycle event is cryptographically sealed on the Ethereum blockchain.
        </p>
      </div>
    </section>

    <!-- Main Public Body -->
    <main class="consumer-body">
      <!-- 1. Verification Experience -->
      <div v-if="activeTab === 'verify'" class="verification-wrapper">
        <ConsumerTraceability :initial-crop-id="initialCropId" />
      </div>

      <!-- 2. How it works guide -->
      <div v-else-if="activeTab === 'how-it-works'" class="info-section">
        <div class="info-card">
          <h2>How AgriTrace Verifies Your Produce</h2>
          <div class="steps-grid">
            <div class="step-card">
              <div class="step-num">1</div>
              <div class="step-icon">🌾</div>
              <h3>Farm Cultivation</h3>
              <p>The grower registers seed variety, geo-location, cultivation dates, and batch volume on-chain.</p>
            </div>
            <div class="step-card">
              <div class="step-num">2</div>
              <div class="step-icon">🚚</div>
              <h3>Supplier Custody</h3>
              <p>Logistics distributors sign custody transfers on Ethereum Ganache upon receiving harvest batches.</p>
            </div>
            <div class="step-card">
              <div class="step-num">3</div>
              <div class="step-icon">🏪</div>
              <h3>Retailer Receipt</h3>
              <p>Supermarkets and retailers confirm batch receipt and assign packaging QR code provenance labels.</p>
            </div>
            <div class="step-card">
              <div class="step-num">4</div>
              <div class="step-icon">🛒</div>
              <h3>Consumer Verification</h3>
              <p>You scan the packaging QR to audit the complete immutable lifecycle from farm gate to your table.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. About page -->
      <div v-else class="info-section">
        <div class="info-card">
          <h2>About AgriTrace OS</h2>
          <p class="about-p">
            AgriTrace OS is a final-year major project engineered for the B.E. Computer Engineering evaluation.
            It provides end-to-end transparent food traceability using a hybrid architecture of Ethereum EVM smart contracts,
            PostgreSQL relational auditing, and Scikit-Learn Random Forest fair price regression.
          </p>
          <div class="architecture-highlights">
            <div class="highlight-item">
              <strong>Decentralized Ledger:</strong>
              <span>Ganache EVM (Chain ID 1337) with Solidity smart contract `CropRegistry.sol`</span>
            </div>
            <div class="highlight-item">
              <strong>Relational Persistence:</strong>
              <span>PostgreSQL / Supabase with SQLAlchemy 2.0 ORM</span>
            </div>
            <div class="highlight-item">
              <strong>Service Layer:</strong>
              <span>FastAPI backend with JWT Role-Based Access Control</span>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Public Footer -->
    <footer class="public-footer">
      <div class="footer-container">
        <p>© 2026 AgriTrace OS · Cryptographically Verified Agricultural Supply Chain</p>
        <span class="footer-note">Public Consumer Experience · No Authentication Required</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.consumer-public-portal {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #020617;
  color: #f8fafc;
  font-family: inherit;
}

.public-navbar {
  background: #0f172a;
  border-bottom: 1px solid #1e293b;
  padding: 0.85rem 2rem;
}

.public-nav-container {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.public-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.logo-leaf {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #064e3b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
}

.brand-text {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: #f8fafc;
}

.sub-text {
  font-size: 0.75rem;
  color: #94a3b8;
  display: block;
}

.public-links {
  display: flex;
  gap: 0.5rem;
}

.link-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 0.5rem 0.85rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  transition: all 0.2s;
}

.link-btn:hover {
  background: #1e293b;
  color: #f1f5f9;
}

.link-btn.active {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.btn-signin-portal {
  background: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 0.45rem 0.85rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-signin-portal:hover {
  background: #334155;
  color: #ffffff;
  border-color: #64748b;
}

.consumer-hero {
  background: radial-gradient(circle at 50% 30%, #064e3b 0%, #022c22 40%, #020617 100%);
  padding: 3rem 1.5rem;
  text-align: center;
  border-bottom: 1px solid #1e293b;
}

.hero-content {
  max-width: 760px;
  margin: 0 auto;
}

.hero-pill {
  display: inline-block;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid #059669;
  color: #6ee7b7;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.hero-content h2 {
  font-size: 2.2rem;
  margin: 0 0 0.85rem;
  color: #ffffff;
  font-weight: 800;
}

.hero-content p {
  color: #cbd5e1;
  font-size: 1rem;
  line-height: 1.6;
  margin: 0;
}

.consumer-body {
  flex: 1;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  box-sizing: border-box;
}

.info-section {
  display: flex;
  justify-content: center;
}

.info-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 2.5rem;
  width: 100%;
  max-width: 900px;
}

.info-card h2 {
  margin: 0 0 1.5rem;
  font-size: 1.5rem;
  color: #f8fafc;
}

.steps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.25rem;
}

.step-card {
  background: #0b1329;
  border: 1px solid #1e293b;
  padding: 1.25rem;
  border-radius: 8px;
  position: relative;
}

.step-num {
  position: absolute;
  top: 10px;
  right: 12px;
  font-size: 0.8rem;
  font-weight: 800;
  color: #334155;
}

.step-icon {
  font-size: 1.8rem;
  margin-bottom: 0.5rem;
}

.step-card h3 {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  color: #f1f5f9;
}

.step-card p {
  margin: 0;
  color: #94a3b8;
  font-size: 0.82rem;
  line-height: 1.45;
}

.about-p {
  color: #94a3b8;
  line-height: 1.6;
  font-size: 0.95rem;
  margin-bottom: 1.5rem;
}

.architecture-highlights {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.highlight-item {
  background: #0b1329;
  border: 1px solid #1e293b;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-size: 0.88rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.highlight-item strong {
  color: #10b981;
}

.highlight-item span {
  color: #cbd5e1;
}

.public-footer {
  background: #0b1329;
  border-top: 1px solid #1e293b;
  padding: 1.5rem 2rem;
  margin-top: auto;
}

.footer-container {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #64748b;
  font-size: 0.82rem;
}

.footer-container p {
  margin: 0;
}

@media (max-width: 800px) {
  .public-nav-container {
    flex-direction: column;
    gap: 1rem;
  }
  .public-links {
    flex-wrap: wrap;
    justify-content: center;
  }
  .footer-container {
    flex-direction: column;
    gap: 0.5rem;
    text-align: center;
  }
}
</style>
