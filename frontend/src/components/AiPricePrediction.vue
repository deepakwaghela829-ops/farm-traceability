<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { fetchCrops, predictCropPrice, fetchCropBenchmarks } from '../api'
import type { CropRecord } from '../types'

interface PredictionForm {
  crop_type: string
  historical_price: number | ''
  season: string
  location: string
  demand: number | ''
  production_quantity: number | ''
}

const form = reactive<PredictionForm>({
  crop_type: 'Banana',
  historical_price: 4500,
  season: 'Monsoon',
  location: 'Palghar',
  demand: 0.8,
  production_quantity: 500,
})

const predictedPrice = ref<number | null>(null)
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

// Optional registered crops for auto-fill
const registeredCrops = ref<CropRecord[]>([])
const loadingCrops = ref(false)
const selectedCropId = ref<string>('')

// Last submitted parameters for comparison card
const lastPredictedParams = ref<PredictionForm | null>(null)

// Validation
const formValid = computed(() => {
  const hp = Number(form.historical_price)
  const d = Number(form.demand)
  const pq = Number(form.production_quantity)

  return (
    !!form.crop_type.trim() &&
    !isNaN(hp) &&
    hp > 0 &&
    !!form.season.trim() &&
    !!form.location.trim() &&
    !isNaN(d) &&
    d > 0 &&
    d <= 5 &&
    !isNaN(pq) &&
    pq > 0
  )
})

async function handlePredict() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!formValid.value) {
    errorMessage.value = 'Please provide valid positive values for all 6 crop features.'
    return
  }

  loading.value = true

  try {
    const numericCropId = selectedCropId.value ? Number(selectedCropId.value) : undefined
    const payload = {
      crop_id: numericCropId,
      crop_type: form.crop_type.trim(),
      historical_price: Number(form.historical_price),
      season: form.season.trim(),
      location: form.location.trim(),
      demand: Number(form.demand),
      production_quantity: Number(form.production_quantity),
    }

    const response = await predictCropPrice(payload)
    predictedPrice.value = response.predicted_price
    lastPredictedParams.value = { ...payload }
    successMessage.value = `Price prediction generated successfully via ${response.model_name}.`
  } catch (err: unknown) {
    predictedPrice.value = null
    const msg = err instanceof Error ? err.message : 'Unable to obtain prediction.'
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('connection')) {
      errorMessage.value = 'Backend server unavailable. Please make sure the FastAPI server is running on http://127.0.0.1:8000.'
    } else {
      errorMessage.value = `Prediction error: ${msg}`
    }
  } finally {
    loading.value = false
  }
}

// Quick prefill from registered crops
async function loadRegisteredCrops() {
  loadingCrops.value = true
  try {
    const crops = await fetchCrops('DEMO-FARMER-001')
    registeredCrops.value = crops
  } catch {
    // Non-critical: manual entry is always supported
    registeredCrops.value = []
  } finally {
    loadingCrops.value = false
  }
}

async function handleCropSelect() {
  if (!selectedCropId.value) return
  const found = registeredCrops.value.find((c: CropRecord) => String(c.crop_id) === selectedCropId.value || String(c.blockchain_crop_id) === selectedCropId.value)
  if (found) {
    if (found.crop_name) form.crop_type = found.crop_name
    if (found.quantity) form.production_quantity = Number(found.quantity)
    if (found.location) {
      const locClean = found.location.split(',')[0].trim()
      form.location = locClean || found.location
    }

    // Auto-fetch ML dataset benchmarks for this crop type
    try {
      const benchmarks = await fetchCropBenchmarks(found.crop_name || form.crop_type)
      if (benchmarks) {
        form.historical_price = benchmarks.historical_price
        form.demand = benchmarks.demand
        if (!found.location) form.location = benchmarks.location
        form.season = benchmarks.season
      }
    } catch {
      // Benchmark fallback is optional
    }
  }
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(val)
}

onMounted(() => {
  loadRegisteredCrops()
})
</script>

<template>
  <div class="ai-prediction-app app-shell">
    <header class="topbar">
      <div>
        <span class="eyebrow">PALGHAR SUPPLY CHAIN · AI MODULE</span>
        <h1>AI Crop Price Prediction</h1>
        <p>
          Predict future market crop prices using a trained Machine Learning pipeline
          informed by regional demand, season, location, and cultivation volume.
        </p>
      </div>

      <div class="header-nav">
        <span class="nav-chip active">AI Mandi Price Prediction</span>
      </div>
    </header>

    <main class="content">
      <section class="hero-card">
        <div>
          <span class="section-kicker">EXPLAINABLE ML FORECASTING</span>
          <h2>Price Estimation Engine</h2>
          <p>
            Trained on agricultural market benchmark data across Palghar and Nashik districts.
          </p>
        </div>

        <div class="scope-badge">
          Random Forest Regressor
        </div>
      </section>

      <div v-if="successMessage" class="alert success">
        {{ successMessage }}
      </div>

      <div v-if="errorMessage" class="alert error">
        <strong>Error:</strong> {{ errorMessage }}
      </div>

      <section class="grid">
        <!-- Form Panel -->
        <form class="panel form-panel" @submit.prevent="handlePredict">
          <div class="panel-heading">
            <div>
              <h3>Crop Market Features</h3>
              <p>All 6 features are required by the machine learning model.</p>
            </div>

            <!-- Optional registered crop selector -->
            <div v-if="registeredCrops.length > 0" class="prefill-wrap">
              <label class="prefill-label">Prefill from Crop:</label>
              <select
                v-model="selectedCropId"
                class="prefill-select"
                @change="handleCropSelect"
              >
                <option value="">-- Choose registered crop --</option>
                <option
                  v-for="c in registeredCrops"
                  :key="c.crop_id"
                  :value="String(c.crop_id)"
                >
                  #{{ c.crop_id }} - {{ c.crop_name }} ({{ c.quantity }} {{ c.unit }})
                </option>
              </select>
            </div>
          </div>

          <div class="field-grid">
            <label class="field">
              <span>Crop Type *</span>
              <select v-model="form.crop_type">
                <option value="Banana">Banana</option>
                <option value="Tomato">Tomato</option>
                <option value="Onion">Onion</option>
                <option value="Potato">Potato</option>
                <option value="Mango">Mango</option>
                <option value="Cabbage">Cabbage</option>
                <option value="Cauliflower">Cauliflower</option>
                <option value="Grapes">Grapes</option>
              </select>
            </label>

            <label class="field">
              <span>Historical Price (₹ / unit) *</span>
              <input
                v-model.number="form.historical_price"
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 4500"
                required
              />
            </label>

            <label class="field">
              <span>Season *</span>
              <select v-model="form.season">
                <option value="Monsoon">Monsoon</option>
                <option value="Winter">Winter</option>
                <option value="Summer">Summer</option>
              </select>
            </label>

            <label class="field">
              <span>Location *</span>
              <select v-model="form.location">
                <option value="Palghar">Palghar</option>
                <option value="Nashik">Nashik</option>
              </select>
            </label>

            <label class="field">
              <span>Demand Index (0.1 – 1.0) *</span>
              <input
                v-model.number="form.demand"
                type="number"
                min="0.01"
                max="2.0"
                step="0.01"
                placeholder="e.g. 0.80"
                required
              />
            </label>

            <label class="field">
              <span>Production Quantity (units/kg) *</span>
              <input
                v-model.number="form.production_quantity"
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 500"
                required
              />
            </label>
          </div>

          <div class="form-footer">
            <span class="helper">
              Inputs: Type, Price, Season, Location, Demand, Quantity
            </span>

            <button
              type="submit"
              :disabled="loading || !formValid"
              class="predict-submit-btn"
            >
              <span v-if="loading" class="spinner"></span>
              {{ loading ? 'Predicting Price...' : 'Predict Crop Price' }}
            </button>
          </div>
        </form>

        <!-- Prediction Result & Information Panel -->
        <aside class="panel info-panel">
          <div class="panel-heading">
            <div>
              <h3>Prediction Result</h3>
              <p>Forecasted market valuation.</p>
            </div>
          </div>

          <div v-if="predictedPrice !== null" class="result-box">
            <span class="result-label">Predicted Crop Price</span>
            <div class="result-value">{{ formatCurrency(predictedPrice) }}</div>

            <div class="result-explanation">
              "The predicted price is an ML-based estimate using historical price, season, location, demand and production quantity."
            </div>

            <div v-if="lastPredictedParams" class="params-summary">
              <h4>Input Parameters Evaluated:</h4>
              <ul>
                <li><strong>Crop:</strong> {{ lastPredictedParams.crop_type }}</li>
                <li><strong>Historical Price:</strong> ₹{{ lastPredictedParams.historical_price }}</li>
                <li><strong>Season:</strong> {{ lastPredictedParams.season }}</li>
                <li><strong>Location:</strong> {{ lastPredictedParams.location }}</li>
                <li><strong>Demand Index:</strong> {{ lastPredictedParams.demand }}</li>
                <li><strong>Production Quantity:</strong> {{ lastPredictedParams.production_quantity }}</li>
              </ul>
            </div>
          </div>

          <div v-else class="empty-result">
            <div class="empty-icon">📊</div>
            <p>
              Fill in the crop features on the left and click
              <strong>Predict Crop Price</strong> to generate a price forecast.
            </p>
          </div>

          <p class="scope-note">
            The predicted price is generated by a Random Forest Regressor trained on regional
            agricultural indices in Maharashtra. Results should be interpreted as machine-learning
            guidance rather than guaranteed contract prices.
          </p>
        </aside>
      </section>
    </main>
  </div>
</template>

<style scoped>
.header-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.nav-chip {
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #cbd5e1;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.15s ease;
}

.nav-chip:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}

.nav-chip.active {
  background: #3b82f6;
  border-color: #60a5fa;
  color: #ffffff;
}

.prefill-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prefill-label {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  white-space: nowrap;
}

.prefill-select {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
}

.predict-submit-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #0f172a;
  color: #ffffff;
  padding: 12px 20px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  transition: transform 0.15s ease, background 0.15s ease;
}

.predict-submit-btn:hover:not(:disabled) {
  background: #1e293b;
  transform: translateY(-1px);
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.result-box {
  padding: 22px;
  border-radius: 16px;
  background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%);
  border: 1px solid #bbf7d0;
  text-align: center;
}

.result-label {
  display: block;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #166534;
}

.result-value {
  margin: 10px 0 14px;
  font-size: clamp(32px, 4vw, 42px);
  font-weight: 900;
  color: #14532d;
  letter-spacing: -0.02em;
}

.result-explanation {
  font-size: 13px;
  line-height: 1.5;
  color: #166534;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(22, 101, 52, 0.15);
  font-style: italic;
}

.params-summary {
  margin-top: 18px;
  text-align: left;
  border-top: 1px solid #bbf7d0;
  padding-top: 14px;
}

.params-summary h4 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #166534;
}

.params-summary ul {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: #334155;
  line-height: 1.7;
}

.empty-result {
  padding: 36px 16px;
  text-align: center;
  border: 1px dashed #cbd5e1;
  border-radius: 14px;
  background: #f8fafc;
}

.empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.empty-result p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}
</style>
