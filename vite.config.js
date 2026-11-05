import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Two pages: the main app (/) and the Process Scan phone app (/scan/).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), scan: resolve(__dirname, 'scan/index.html') } } },
})
