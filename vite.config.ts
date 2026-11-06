import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { traditionalLocalePlugin } from './dev/i18n/traditionalLocalePlugin.mjs'

export default defineConfig({
  plugins: [react(), traditionalLocalePlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { host: true, port: 5173 },
})
