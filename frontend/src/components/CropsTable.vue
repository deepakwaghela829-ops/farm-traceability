<script setup lang="ts">
import { computed } from 'vue'
import StatusBadge from './StatusBadge.vue'
import type { CropRecord } from '../api'

const props = defineProps<{
  crops: CropRecord[]
  loading: boolean
  error: string
  searchQuery: string
  selectedType: string
}>()

const emit = defineEmits<{
  (e: 'update:searchQuery', val: string): void
  (e: 'update:selectedType', val: string): void
  (e: 'selectCrop', cropId: number | string): void
  (e: 'viewTraceability', cropId: number | string): void
  (e: 'retry'): void
}>()

const availableTypes = computed(() => {
  const types = new Set<string>()
  props.crops.forEach(c => {
    if (c.crop_type) types.add(c.crop_type)
  })
  return Array.from(types)
})

const filteredCrops = computed(() => {
  return props.crops.filter(c => {
    const matchesSearch = !props.searchQuery || 
      c.crop_name.toLowerCase().includes(props.searchQuery.toLowerCase()) ||
      c.location.toLowerCase().includes(props.searchQuery.toLowerCase()) ||
      c.crop_id.toString().includes(props.searchQuery) ||
      (c.blockchain_crop_id && c.blockchain_crop_id.toString().includes(props.searchQuery))
      
    const matchesType = !props.selectedType || c.crop_type.toLowerCase() === props.selectedType.toLowerCase()

    return matchesSearch && matchesType
  })
})

function formatDate(val: string) {
  if (!val) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(val.includes('T') ? val : `${val}T00:00:00`))
}
</script>

<template>
  <div class="crop-table-container">
    <!-- Filter bar -->
    <div class="filter-bar">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input 
          :value="searchQuery" 
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          type="text" 
          placeholder="Search crop name, location, or ID..."
        />
        <button 
          v-if="searchQuery" 
          class="clear-btn" 
          @click="emit('update:searchQuery', '')"
        >
          &times;
        </button>
      </div>

      <div class="filter-controls">
        <select 
          :value="selectedType" 
          @change="emit('update:selectedType', ($event.target as HTMLSelectElement).value)"
          class="type-select"
        >
          <option value="">All Crop Types</option>
          <option v-for="type in availableTypes" :key="type" :value="type">
            {{ type }}
          </option>
        </select>
      </div>
    </div>

    <!-- Data Display States -->
    <div v-if="loading" class="state-box">
      <div class="spinner"></div>
      <p>Fetching real crop records from Supabase database...</p>
    </div>

    <div v-else-if="error" class="state-box error">
      <span class="state-icon">⚠️</span>
      <h4>Unable to load crop records</h4>
      <p>{{ error }}</p>
      <button class="retry-btn" @click="emit('retry')">Retry Connection</button>
    </div>

    <div v-else-if="filteredCrops.length === 0" class="state-box empty">
      <span class="state-icon">🌾</span>
      <h4>No crop records found</h4>
      <p v-if="searchQuery || selectedType">
        No records match your active filters. Try resetting the search or filter.
      </p>
      <p v-else>
        No crops have been recorded yet. Click "Add New Crop" above to register one.
      </p>
    </div>

    <div v-else class="table-responsive">
      <table class="modern-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Crop</th>
            <th>Type</th>
            <th>Quantity</th>
            <th>Cultivation Date</th>
            <th>Expected Harvest</th>
            <th>Location</th>
            <th>Status</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="crop in filteredCrops" 
            :key="crop.crop_id"
            class="table-row"
          >
            <td class="font-mono id-col">
              <span class="badge-db">DB #{{ crop.crop_id }}</span>
              <span v-if="crop.blockchain_crop_id" class="badge-chain">⛓️ #{{ crop.blockchain_crop_id }}</span>
            </td>
            <td>
              <strong class="crop-name">{{ crop.crop_name }}</strong>
            </td>
            <td>
              <span class="crop-type-tag">{{ crop.crop_type }}</span>
            </td>
            <td>
              <strong>{{ crop.quantity }}</strong> {{ crop.unit }}
            </td>
            <td>{{ formatDate(crop.cultivation_date) }}</td>
            <td>{{ formatDate(crop.expected_harvest_date) }}</td>
            <td class="location-col">{{ crop.location }}</td>
            <td>
              <StatusBadge 
                :cultivationDate="crop.cultivation_date" 
                :expectedHarvestDate="crop.expected_harvest_date" 
              />
            </td>
            <td class="text-right actions-col">
              <button 
                class="action-btn details" 
                title="View full crop details & lifecycle"
                @click="emit('selectCrop', crop.crop_id)"
              >
                Details
              </button>
              <button 
                class="action-btn trace" 
                title="View public blockchain provenance"
                @click="emit('viewTraceability', crop.blockchain_crop_id || crop.crop_id)"
              >
                Trace
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.crop-table-container {
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  background: #fafafa;
}

.search-box {
  display: flex;
  align-items: center;
  position: relative;
  flex: 1;
  max-width: 380px;
}

.search-icon {
  position: absolute;
  left: 12px;
  font-size: 14px;
  color: #94a3b8;
}

.search-box input {
  width: 100%;
  padding: 9px 34px 9px 36px;
  font-size: 13px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.search-box input:focus {
  border-color: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
}

.clear-btn {
  position: absolute;
  right: 10px;
  color: #94a3b8;
  font-size: 16px;
  padding: 0 4px;
}

.clear-btn:hover {
  color: #0f172a;
}

.filter-controls {
  display: flex;
  gap: 12px;
}

.type-select {
  padding: 8px 14px;
  font-size: 13px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  outline: none;
  cursor: pointer;
}

.type-select:focus {
  border-color: #10b981;
}

.table-responsive {
  width: 100%;
  overflow-x: auto;
}

.modern-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
}

.modern-table th {
  padding: 14px 18px;
  background: #f8fafc;
  color: #475569;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.modern-table td {
  padding: 14px 18px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.table-row {
  transition: background-color 0.15s;
}

.table-row:hover {
  background-color: #f8fafc;
}

.id-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.badge-db {
  font-size: 11px;
  font-weight: 600;
  color: #475569;
}

.badge-chain {
  font-size: 10px;
  font-weight: 700;
  color: #047857;
  background: #ecfdf5;
  padding: 2px 6px;
  border-radius: 4px;
  width: fit-content;
}

.crop-name {
  font-size: 14px;
  color: #0f172a;
}

.crop-type-tag {
  background: #f1f5f9;
  color: #475569;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 12px;
}

.location-col {
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #475569;
}

.text-right {
  text-align: right;
}

.actions-col {
  white-space: nowrap;
}

.action-btn {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  margin-left: 6px;
  transition: all 0.15s;
}

.action-btn.details {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.action-btn.details:hover {
  background: #e2e8f0;
}

.action-btn.trace {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.action-btn.trace:hover {
  background: #d1fae5;
}

.state-box {
  padding: 48px 24px;
  text-align: center;
  color: #64748b;
}

.state-box.error {
  color: #991b1b;
  background: #fef2f2;
}

.state-icon {
  font-size: 32px;
  margin-bottom: 8px;
  display: block;
}

.retry-btn {
  margin-top: 14px;
  padding: 8px 16px;
  background: #991b1b;
  color: #ffffff;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #e2e8f0;
  border-top-color: #10b981;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .filter-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .search-box {
    max-width: 100%;
  }
}
</style>
