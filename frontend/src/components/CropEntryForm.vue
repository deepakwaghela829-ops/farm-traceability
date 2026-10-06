<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { ethers } from 'ethers'
import { createCrop, type BlockchainCropPayload } from '../api'
import abi from '../blockchain/CropRegistry.abi.json'

const props = defineProps<{
  farmerId: string
  contractAddress?: string
  chainId?: number
  walletAddress?: string
}>()

const emit = defineEmits<{
  (e: 'success', crop: any): void
  (e: 'cancel'): void
}>()

const form = reactive({
  farmer_id: props.farmerId,
  crop_name: '',
  crop_type: '',
  quantity: null as number | null,
  unit: 'kg',
  cultivation_date: '',
  expected_harvest_date: '',
  location: '',
})

const loading = ref(false)
const errorMessage = ref('')
const statusNote = ref('')

const isFormValid = computed(() => {
  return (
    form.crop_name.trim() !== '' &&
    form.crop_type.trim() !== '' &&
    form.quantity !== null &&
    form.quantity > 0 &&
    form.unit.trim() !== '' &&
    form.cultivation_date !== '' &&
    form.expected_harvest_date !== '' &&
    form.expected_harvest_date >= form.cultivation_date &&
    form.location.trim() !== ''
  )
})

function unixDate(dateStr: string) {
  return Math.floor(new Date(`${dateStr}T00:00:00`).getTime() / 1000)
}

async function submitCrop() {
  if (!isFormValid.value) {
    errorMessage.value = 'Please provide valid values for all required fields.'
    return
  }

  loading.value = true
  errorMessage.value = ''
  statusNote.value = ''

  try {
    let blockchainCropId: number | undefined
    let txHash: string | undefined
    let blockNumber: number | undefined

    // 1. If Ganache wallet is connected, execute smart contract transaction on Ethereum first!
    if (props.walletAddress && props.contractAddress) {
      statusNote.value = 'Broadcasting transaction to Ganache EVM smart contract...'
      const provider = new ethers.JsonRpcProvider('http://127.0.0.1:7545')
      const signer = await provider.getSigner(props.walletAddress)
      const registry = new ethers.Contract(props.contractAddress, abi, signer)

      const tx = await registry.registerCrop(
        form.crop_name.trim(),
        form.crop_type.trim(),
        BigInt(Math.round(Number(form.quantity))),
        form.unit.trim(),
        unixDate(form.cultivation_date),
        unixDate(form.expected_harvest_date),
        form.location.trim(),
      )

      statusNote.value = 'Waiting for Ethereum block confirmation...'
      const receipt = await tx.wait()
      txHash = tx.hash
      blockNumber = receipt.blockNumber

      const farmerCrops = await registry.getFarmerCrops(props.walletAddress)
      if (farmerCrops && farmerCrops.length > 0) {
        blockchainCropId = Number(farmerCrops[farmerCrops.length - 1])
      }
    }

    // 2. Persist to PostgreSQL backend database
    statusNote.value = 'Synchronizing crop batch with PostgreSQL database...'
    const payload: BlockchainCropPayload = {
      farmer_id: form.farmer_id.trim(),
      crop_name: form.crop_name.trim(),
      crop_type: form.crop_type.trim(),
      quantity: Number(form.quantity),
      unit: form.unit.trim(),
      cultivation_date: form.cultivation_date,
      expected_harvest_date: form.expected_harvest_date,
      location: form.location.trim(),
      ...(props.walletAddress ? {
        blockchain_crop_id: blockchainCropId,
        blockchain_tx_hash: txHash,
        blockchain_block_number: blockNumber,
        blockchain_farmer_address: props.walletAddress,
        blockchain_contract_address: props.contractAddress,
        blockchain_chain_id: props.chainId,
      } : {})
    }

    const created = await createCrop(payload)
    emit('success', created)
  } catch (err: any) {
    errorMessage.value = err.message || 'Unable to register crop record.'
  } finally {
    loading.value = false
    statusNote.value = ''
  }
}
</script>

<template>
  <div class="crop-form-card">
    <div class="form-header">
      <div>
        <h3>Register New Crop</h3>
        <p>Record harvest provenance into PostgreSQL and initialize AI price prediction.</p>
      </div>
      <button class="btn-text-close" @click="emit('cancel')">&times;</button>
    </div>

    <div v-if="errorMessage" class="error-banner">
      <span>⚠️</span>
      <div>{{ errorMessage }}</div>
    </div>

    <div v-if="statusNote" class="status-banner-live">
      <span class="spinner-small-green"></span>
      <div>{{ statusNote }}</div>
    </div>

    <form @submit.prevent="submitCrop">
      <div class="form-grid">
        <div class="form-group">
          <label>Crop Name *</label>
          <input 
            v-model="form.crop_name" 
            type="text" 
            placeholder="e.g. Alphonso Mango, Tomato" 
            required 
          />
        </div>

        <div class="form-group">
          <label>Crop Category / Type *</label>
          <input 
            v-model="form.crop_type" 
            type="text" 
            placeholder="e.g. Fruit, Grain, Vegetable" 
            required 
          />
        </div>

        <div class="form-group">
          <label>Quantity *</label>
          <input 
            v-model.number="form.quantity" 
            type="number" 
            min="0.1" 
            step="any" 
            placeholder="e.g. 250" 
            required 
          />
        </div>

        <div class="form-group">
          <label>Measurement Unit *</label>
          <select v-model="form.unit" required>
            <option value="kg">Kilogram (kg)</option>
            <option value="quintal">Quintal</option>
            <option value="tonne">Tonne</option>
            <option value="box">Box / Crate</option>
          </select>
        </div>

        <div class="form-group">
          <label>Cultivation Date *</label>
          <input 
            v-model="form.cultivation_date" 
            type="date" 
            required 
          />
        </div>

        <div class="form-group">
          <label>Expected Harvest Date *</label>
          <input 
            v-model="form.expected_harvest_date" 
            type="date" 
            :min="form.cultivation_date || undefined" 
            required 
          />
        </div>

        <div class="form-group full-width">
          <label>Farm & Field Location *</label>
          <input 
            v-model="form.location" 
            type="text" 
            placeholder="e.g. Greenfield Farm, Plot 4B, Nashik, Maharashtra" 
            required 
          />
        </div>
      </div>

      <div class="form-actions">
        <div class="actions-meta">
          <span class="farmer-pill">Farmer ID: {{ form.farmer_id }}</span>
          <span v-if="walletAddress" class="wallet-pill font-mono">
            ⛓️ {{ walletAddress.slice(0, 6) }}...{{ walletAddress.slice(-4) }}
          </span>
        </div>

        <div class="btn-group">
          <button type="button" class="btn-cancel" @click="emit('cancel')">Cancel</button>
          <button type="submit" class="btn-submit" :disabled="loading || !isFormValid">
            <span v-if="loading" class="spinner-small"></span>
            {{ loading ? 'Registering...' : 'Save & Register Crop' }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
.crop-form-card {
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  padding: 24px 28px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  margin-bottom: 24px;
  animation: fadeIn 0.2s ease-out;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.form-header h3 {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 2px;
}

.form-header p {
  font-size: 13px;
  color: #64748b;
}

.btn-text-close {
  font-size: 24px;
  color: #94a3b8;
  padding: 0 4px;
  line-height: 1;
}

.btn-text-close:hover {
  color: #0f172a;
}

.error-banner {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}

.status-banner-live {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  font-weight: 600;
}

.spinner-small-green {
  width: 14px;
  height: 14px;
  border: 2px solid #bfdbfe;
  border-top-color: #1d4ed8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group.full-width {
  grid-column: 1 / -1;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.form-group input,
.form-group select {
  padding: 10px 14px;
  font-size: 13px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.form-group input:focus,
.form-group select:focus {
  border-color: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
}

.form-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid #f1f5f9;
  flex-wrap: wrap;
  gap: 16px;
}

.actions-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.farmer-pill {
  background: #f1f5f9;
  color: #475569;
  padding: 4px 10px;
  border-radius: 9999px;
  font-weight: 600;
}

.wallet-pill {
  background: #ecfdf5;
  color: #065f46;
  padding: 4px 10px;
  border-radius: 9999px;
  font-weight: 600;
}

.font-mono {
  font-family: monospace;
}

.btn-group {
  display: flex;
  gap: 10px;
}

.btn-cancel {
  padding: 10px 18px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #475569;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
}

.btn-cancel:hover {
  background: #f8fafc;
}

.btn-submit {
  padding: 10px 20px;
  background: #059669;
  color: #ffffff;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.15s;
}

.btn-submit:hover:not(:disabled) {
  background: #047857;
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid #ffffff;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
