<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  cultivationDate: string
  expectedHarvestDate: string
}>()

const statusInfo = computed(() => {
  if (!props.expectedHarvestDate) {
    return { label: 'Growing', colorClass: 'badge-info', status: 'growing' }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const harvest = new Date(`${props.expectedHarvestDate}T00:00:00`)
  harvest.setHours(0, 0, 0, 0)
  
  const diffTime = harvest.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) {
    return { label: 'Harvest Ready', colorClass: 'badge-success', status: 'ready' }
  } else if (diffDays <= 7) {
    return { label: `Near Harvest (${diffDays}d)`, colorClass: 'badge-warning', status: 'near' }
  } else {
    return { label: 'Growing', colorClass: 'badge-info', status: 'growing' }
  }
})
</script>

<template>
  <span :class="['badge', statusInfo.colorClass]">
    <span class="status-indicator" :class="statusInfo.status"></span>
    {{ statusInfo.label }}
  </span>
</template>

<style scoped>
.status-indicator {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-indicator.ready {
  background-color: #10b981;
}

.status-indicator.near {
  background-color: #f59e0b;
}

.status-indicator.growing {
  background-color: #3b82f6;
}
</style>
