import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        consumer: fileURLToPath(new URL('./consumer.html', import.meta.url)),
        supplier: fileURLToPath(new URL('./supplier-retailer.html', import.meta.url)),
      },
    },
  },
})
