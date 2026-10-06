<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import QRCode from 'qrcode'

const props = defineProps<{
  cropId: number | string
  cropName: string
}>()

const qrDataUrl = ref<string>('')
const generating = ref<boolean>(false)
const copied = ref<boolean>(false)

const traceUrl = ref<string>('')

async function generateQR() {
  generating.value = true
  try {
    const origin = window.location.origin
    traceUrl.value = `${origin}/#trace-${props.cropId}`
    const url = await QRCode.toDataURL(traceUrl.value, {
      width: 240,
      margin: 2,
      color: {
        dark: '#064e3b',
        light: '#ffffff',
      },
    })
    qrDataUrl.value = url
  } catch (err) {
    console.error('Failed to generate QR:', err)
  } finally {
    generating.value = false
  }
}

function copyUrl() {
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(traceUrl.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
}

function downloadQR() {
  if (!qrDataUrl.value) return
  const link = document.createElement('a')
  link.href = qrDataUrl.value
  link.download = `Crop-${props.cropId}-${props.cropName.replace(/\s+/g, '_')}-Provenance-QR.png`
  link.click()
}

onMounted(() => {
  generateQR()
})

watch(() => props.cropId, () => {
  generateQR()
})
</script>

<template>
  <div class="qr-container">
    <div class="qr-preview-box">
      <div v-if="generating" class="qr-spinner"></div>
      <img v-else-if="qrDataUrl" :src="qrDataUrl" :alt="`Provenance QR for Crop #${cropId}`" class="qr-image" />
    </div>

    <div class="qr-info">
      <div class="qr-badge">Consumer Verification QR</div>
      <h4>{{ cropName }}</h4>
      <p class="qr-sub">Scan to verify seed-to-shelf provenance &amp; smart contract authenticity.</p>

      <div class="url-bar">
        <span class="url-text font-mono">{{ traceUrl }}</span>
        <button class="btn-copy" @click="copyUrl">
          {{ copied ? 'Copied!' : 'Copy' }}
        </button>
      </div>

      <div class="qr-actions">
        <button class="btn-download" @click="downloadQR">
          📥 Download QR Code
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qr-container {
  display: flex;
  align-items: center;
  gap: 20px;
  background: #ffffff;
  border: 1px solid #a7f3d0;
  border-radius: 16px;
  padding: 20px 24px;
  box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.05);
}

.qr-preview-box {
  width: 140px;
  height: 140px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.qr-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qr-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.qr-badge {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #059669;
  margin-bottom: 4px;
}

.qr-info h4 {
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 4px;
}

.qr-sub {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 12px;
}

.url-bar {
  display: flex;
  align-items: center;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 10px;
  margin-bottom: 12px;
}

.url-text {
  flex: 1;
  font-size: 11px;
  color: #475569;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-copy {
  font-size: 11px;
  font-weight: 700;
  color: #059669;
  padding: 2px 8px;
  background: #ecfdf5;
  border-radius: 6px;
  border: 1px solid #a7f3d0;
  margin-left: 8px;
  cursor: pointer;
}

.btn-download {
  padding: 8px 16px;
  background: #059669;
  color: #ffffff;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-download:hover {
  background: #047857;
}

.font-mono {
  font-family: monospace;
}

.qr-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #e2e8f0;
  border-top-color: #10b981;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .qr-container {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
}
</style>
