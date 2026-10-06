<script setup lang="ts">
defineProps<{
  title: string
  value: string | number
  subtitle?: string
  trend?: string
  trendType?: 'positive' | 'negative' | 'neutral'
  icon?: string
}>()
</script>

<template>
  <div class="stat-card">
    <div class="stat-header">
      <span class="stat-title">{{ title }}</span>
      <div v-if="icon" class="stat-icon-wrapper">
        <span class="stat-icon">{{ icon }}</span>
      </div>
    </div>
    <div class="stat-value-row">
      <div class="stat-value">{{ value }}</div>
      <span 
        v-if="trend" 
        class="stat-trend" 
        :class="trendType || 'positive'"
      >
        {{ trend }}
      </span>
    </div>
    <div v-if="subtitle" class="stat-subtitle">{{ subtitle }}</div>
  </div>
</template>

<style scoped>
.stat-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px -3px rgba(0, 0, 0, 0.06);
  border-color: #cbd5e1;
}

.stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.stat-title {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.stat-icon-wrapper {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #ecfdf5;
  color: #059669;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.stat-value-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.stat-value {
  font-size: 30px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.stat-trend {
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
}

.stat-trend.positive {
  background: #ecfdf5;
  color: #059669;
}

.stat-trend.neutral {
  background: #f1f5f9;
  color: #475569;
}

.stat-subtitle {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 6px;
}
</style>
