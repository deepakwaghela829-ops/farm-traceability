<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { createCrop, fetchCrops } from './api'
import type { CropPayload, CropRecord } from './types'

const DEMO_FARMER_ID = 'DEMO-FARMER-001'
const farmerId = DEMO_FARMER_ID

const form = reactive<CropPayload>({
  farmer_id: farmerId,
  crop_name: '',
  crop_type: '',
  quantity: 0,
  unit: 'kg',
  cultivation_date: '',
  expected_harvest_date: '',
  location: '',
})

const crops = ref<CropRecord[]>([])
const loading = ref(false)
const loadingRecords = ref(false)
const message = ref('')
const error = ref('')

const formValid = computed(() => {
  return (
    form.crop_name.trim() &&
    form.crop_type.trim() &&
    Number(form.quantity) > 0 &&
    form.unit.trim() &&
    form.cultivation_date &&
    form.expected_harvest_date &&
    form.expected_harvest_date >= form.cultivation_date &&
    form.location.trim()
  )
})

function resetForm() {
  form.crop_name = ''
  form.crop_type = ''
  form.quantity = 0
  form.unit = 'kg'
  form.cultivation_date = ''
  form.expected_harvest_date = ''
  form.location = ''
}

async function loadCrops() {
  loadingRecords.value = true
  error.value = ''
  try {
    crops.value = await fetchCrops(farmerId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to load crop records.'
  } finally {
    loadingRecords.value = false
  }
}

async function submitCrop() {
  message.value = ''
  error.value = ''

  if (!formValid.value) {
    error.value = 'Please complete all fields and check the crop dates and quantity.'
    return
  }

  loading.value = true
  try {
    await createCrop({ ...form, quantity: Number(form.quantity) })
    message.value = 'Crop record saved successfully.'
    resetForm()
    await loadCrops()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to save crop record.'
  } finally {
    loading.value = false
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  )
}

onMounted(loadCrops)
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <span class="eyebrow">FARM TRACEABILITY • FARMER MODULE</span>
        <h1>Crop Entry</h1>
        <p>Record your crop information for the supply-chain database.</p>
      </div>
      <div class="farmer-chip">
        <span class="dot"></span>
        Demo Farmer
      </div>
    </header>

    <main class="content">
      <section class="hero-card">
        <div>
          <span class="section-kicker">FARMER VIEW</span>
          <h2>Register a new crop</h2>
          <p>Enter the cultivation details exactly as recorded on the farm.</p>
        </div>
        <div class="scope-badge">Crop Info Management</div>
      </section>

      <div v-if="message" class="alert success">{{ message }}</div>
      <div v-if="error" class="alert error">{{ error }}</div>

      <section class="grid">
        <form class="panel form-panel" @submit.prevent="submitCrop">
          <div class="panel-heading">
            <div>
              <h3>Crop information</h3>
              <p>Fields marked with * are required.</p>
            </div>
          </div>

          <div class="field-grid">
            <label class="field">
              <span>Crop name *</span>
              <input v-model="form.crop_name" type="text" placeholder="e.g. Banana" maxlength="120" />
            </label>

            <label class="field">
              <span>Crop type *</span>
              <input v-model="form.crop_type" type="text" placeholder="e.g. Fruit" maxlength="120" />
            </label>

            <label class="field">
              <span>Quantity *</span>
              <input v-model.number="form.quantity" type="number" min="0.001" step="0.001" placeholder="0" />
            </label>

            <label class="field">
              <span>Unit *</span>
              <select v-model="form.unit">
                <option value="kg">kg</option>
                <option value="quintal">quintal</option>
                <option value="tonne">tonne</option>
                <option value="box">box</option>
              </select>
            </label>

            <label class="field">
              <span>Cultivation date *</span>
              <input v-model="form.cultivation_date" type="date" />
            </label>

            <label class="field">
              <span>Expected harvest date *</span>
              <input v-model="form.expected_harvest_date" type="date" :min="form.cultivation_date || undefined" />
            </label>

            <label class="field full">
              <span>Location *</span>
              <input v-model="form.location" type="text" placeholder="e.g. Palghar, Maharashtra" maxlength="200" />
            </label>
          </div>

          <div class="form-footer">
            <span class="helper">Farmer ID: {{ farmerId }}</span>
            <button type="submit" :disabled="loading">
              {{ loading ? 'Saving…' : 'Save crop record' }}
            </button>
          </div>
        </form>

        <aside class="panel info-panel">
          <div class="panel-heading">
            <div>
              <h3>Current scope</h3>
              <p>This screen implements one vertical slice of the project.</p>
            </div>
          </div>
          <div class="flow">
            <div class="flow-step active">Farmer View</div>
            <div class="flow-line"></div>
            <div class="flow-step active">Crop Entry</div>
            <div class="flow-line"></div>
            <div class="flow-step active">Crop Info Management</div>
            <div class="flow-line"></div>
            <div class="flow-step">PostgreSQL</div>
          </div>
          <p class="scope-note">
            Blockchain, AI price prediction, supplier/retailer tracking and consumer verification are intentionally outside this first implementation slice.
          </p>
        </aside>
      </section>

      <section class="panel records-panel">
        <div class="panel-heading records-heading">
          <div>
            <h3>Recorded crops</h3>
            <p>Crop records stored for this farmer.</p>
          </div>
          <button class="secondary" type="button" @click="loadCrops" :disabled="loadingRecords">
            {{ loadingRecords ? 'Refreshing…' : 'Refresh' }}
          </button>
        </div>

        <div v-if="loadingRecords" class="empty-state">Loading crop records…</div>
        <div v-else-if="crops.length === 0" class="empty-state">No crop records yet. Add your first crop above.</div>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Crop</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Cultivation</th>
                <th>Harvest</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="crop in crops" :key="crop.crop_id">
                <td>{{ crop.crop_name }}</td>
                <td>{{ crop.crop_type }}</td>
                <td>{{ crop.quantity }} {{ crop.unit }}</td>
                <td>{{ formatDate(crop.cultivation_date) }}</td>
                <td>{{ formatDate(crop.expected_harvest_date) }}</td>
                <td>{{ crop.location }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</template>
