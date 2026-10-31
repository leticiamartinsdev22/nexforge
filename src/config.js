export const APP_NAME = 'NexForge'
export const APP_TAG = 'INFRAESTRUTURA'

// O painel opera somente com dados reais do agente.
export const LIVE = true
export const API_URL = import.meta.env.VITE_API_URL ?? ''
export const POLL_MS = Number(import.meta.env.VITE_POLL_MS) || 60000
