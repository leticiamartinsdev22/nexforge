import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import os from 'node:os'
import path from 'node:path'

// Em dev e no `vite preview`, /api é encaminhado para o agente (server/), evitando CORS.
const proxy = { '/api': process.env.AGENT_URL || 'http://127.0.0.1:3001' }
const windowsBuildDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'NexForge', 'build-dist')
const windowsCacheDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'NexForge', 'vite-cache')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  cacheDir: process.platform === 'win32' ? windowsCacheDir : undefined,
  build: { outDir: process.platform === 'win32' ? windowsBuildDir : 'dist', emptyOutDir: process.platform === 'win32' },
  server: {
    proxy,
    allowedHosts: process.env.VITE_ALLOWED_HOSTS
      ? process.env.VITE_ALLOWED_HOSTS.split(',').map((host) => host.trim()).filter(Boolean)
      : [],
  },
  preview: { proxy },
})
