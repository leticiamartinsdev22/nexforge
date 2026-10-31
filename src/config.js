export const APP_NAME = 'NexForge'
export const APP_TAG = 'INFRAESTRUTURA'

// Modo ao vivo: o painel busca /api/snapshot no agente a cada POLL_MS.
// Configure em .env (ver .env.example). Sem VITE_LIVE=true a aplicação mostra estados vazios locais.
export const LIVE = import.meta.env.VITE_LIVE === 'true'
export const API_URL = import.meta.env.VITE_API_URL ?? ''
export const POLL_MS = Number(import.meta.env.VITE_POLL_MS) || 60000
