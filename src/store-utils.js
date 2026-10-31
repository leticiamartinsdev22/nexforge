import { useContext } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ctx } from './store-context'

export const WINDOW_LABELS = [['1h', 'Última hora'], ['24h', 'Últimas 24 horas'], ['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['all', 'Todo o período']]
export const ENV_LABELS = [['all', 'Todos os serviços'], ['Produção', 'Produção'], ['Desenvolvimento', 'Desenvolvimento']]

export function rel(ts, now = Date.now()) {
  const minutes = Math.floor((now - ts) / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return String(minutes) + 'min atrás'
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? String(hours) + 'h atrás' : String(Math.floor(hours / 24)) + 'd atrás'
}

export const healthScore = (apps, server) =>
  Math.max(0, 100 - apps.filter((app) => app.status === 'bad').length * 10 - (server.pendingReboot ? 10 : 0))

export const useQ = () => (useSearchParams()[0].get('q') ?? '').trim().toLowerCase()
export const has = (query, ...fields) => !query || fields.some((field) => String(field ?? '').toLowerCase().includes(query))
export const useData = () => useContext(Ctx)

export function useHistory(key, normalizeToPct = false) {
  const { history } = useData()
  const samples = history?.[key]
  if (!Array.isArray(samples)) return []
  if (!normalizeToPct || samples.length === 0) return samples
  const max = Math.max(...samples, 0.01)
  return samples.map((value) => (value / max) * 100)
}
