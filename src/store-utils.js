import { useContext } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ctx } from './store-context'
import { LIVE } from './config'
import { useSeries } from './components/ui-hooks'

export const WINDOW_LABELS = [['1h', 'Última hora'], ['24h', 'Últimas 24 horas'], ['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['all', 'Todo o período']]
export const ENV_LABELS = [['all', 'Todos os serviços'], ['Produção', 'Produção'], ['Desenvolvimento', 'Desenvolvimento']]

export function rel(ts, now = Date.now()) {
  const minutes = Math.floor((now - ts) / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes}min atrás`
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours}h atrás` : `${Math.floor(hours / 24)}d atrás`
}

export const healthScore = (apps, server) =>
  Math.max(0, 100 - apps.filter((app) => app.status === 'bad').length * 10 - (server.pendingReboot ? 10 : 0))

export const useQ = () => (useSearchParams()[0].get('q') ?? '').trim().toLowerCase()
export const has = (query, ...fields) => !query || fields.some((field) => String(field ?? '').toLowerCase().includes(query))
export const useData = () => useContext(Ctx)

export function useHistory(key, base, n = 30, jitter = 6, normalizeToPct = false) {
  const { history } = useData()
  const fake = useSeries(base, n, jitter)
  const samples = history?.[key]
  if (samples && samples.length >= 2) {
    if (!normalizeToPct) return samples
    const max = Math.max(...samples, 0.01)
    return samples.map((value) => (value / max) * 100)
  }
  return LIVE ? Array(n).fill(Math.min(Math.max(base, 1), 99)) : fake
}
