import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { emptySnapshot } from './data'
import { POLL_MS } from './config'
import { fetchHostUpdates, fetchMetrics, fetchSnapshot, send, AuthError } from './api'
import { logout } from './auth'
import { Ctx } from './store-context'
import { rel } from './store-utils'
import { startPolling } from './polling'
import { useToast } from './components/toast-context'

const READ_ALERTS_KEY = 'nexforge.read-alerts.v1'

function loadReadAlertIds() {
  try { return new Set(JSON.parse(localStorage.getItem(READ_ALERTS_KEY) ?? '[]')) } catch { return new Set() }
}

const EMPTY = {
  server: {
    name: 'Aguardando agente', id: 'Aguardando dados', region: 'Não informado', provider: 'Não informado', ip: 'Aguardando dados', os: 'Aguardando dados', cpu: 0, ram: 0, disk: 0, vcpu: 0, load: 0,
    ramUsed: '0', ramTotal: '0', diskUsed: '0', diskTotal: '0', uptime: 'Aguardando dados', uptimeFull: 'Aguardando dados', uptimeDays: 0, netMBs: 0, pendingReboot: false,
  },
  apps: [], domains: [], dbs: [], backups: [], alerts: [], events: [], hardening: [], logSources: [], history: {}, offsite: null,
  security: { packages: null, rebootPending: false, lastBoot: 'Não informado', publicPorts: 0, checksOk: 0, checksTotal: 0, updatesSupported: false, updateAction: null },
  backup: { enabled: false, running: false, schedule: { freq: 'Diária', time: '03:15' }, next: null },
}

const WINDOWS = { '1h': 3600e3, '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5, all: Infinity }

// Converte horários relativos legados quando o agente não envia timestamp.
const parseWhen = (w) => {
  const m = /(\d+)\s*(min|h|d)/.exec(w ?? '')
  return m ? Date.now() - Number(m[1]) * { min: 60e3, h: 3600e3, d: 864e5 }[m[2]] : Date.now()
}

function normalize(raw) {
  const s = { ...EMPTY, ...(raw ?? {}) }
  s.server = { ...EMPTY.server, ...(raw?.server ?? {}) }
  s.security = { ...EMPTY.security, ...(raw?.security ?? {}) }
  s.backup = { ...EMPTY.backup, ...(raw?.backup ?? {}) }
  s.domains = s.domains.map((d) => ({
    ...d, expires: d.expiresAt ? new Date(d.expiresAt).toLocaleDateString('pt-BR') : d.expires ?? 'Sem data informada',
  }))
  s.alerts = s.alerts.map((a, index) => {
    const ts = a.ts ?? parseWhen(a.when)
    const id = a.id ?? (a.ts != null ? `${a.ts}-${a.source}-${a.msg}` : `${a.source}-${a.msg}-${index}`)
    return { ...a, id, ts, when: a.when ?? rel(ts), tag: a.tag ?? (a.level === 'bad' ? 'Crítico' : 'Correção') }
  })
  s.events = s.events.map((e) => {
    const ts = e.ts ?? parseWhen(e.when)
    return { ...e, ts, when: e.when ?? rel(ts) }
  })
  return s
}

const onAuthError = (e) => {
  if (e instanceof AuthError) { logout(); window.location.assign('/login'); return true }
  return false
}

export function DataProvider({ children }) {
  const [snap, setSnap] = useState(() => normalize(emptySnapshot))
  const [meta, setMeta] = useState(() => ({ mode: 'connecting', updatedAt: new Date(), error: '' }))
  const [filters, setFilters] = useState({ env: 'all', window: '24h' })
  const [chartHistory, setChartHistory] = useState({})
  const [readAlertIds, setReadAlertIds] = useState(loadReadAlertIds)
  const historyRequest = useRef(0)
  const backupRunning = useRef(false)
  const { showToast } = useToast()

  const markAlertsRead = useCallback((ids) => {
    const next = new Set([...readAlertIds, ...ids])
    setReadAlertIds(next)
    try { localStorage.setItem(READ_ALERTS_KEY, JSON.stringify([...next])) } catch { /* mantém o estado durante esta sessão */ }
  }, [readAlertIds])

  useEffect(() => {
    const syncReadAlerts = (event) => {
      if (event.key !== READ_ALERTS_KEY && event.key !== null) return
      try { setReadAlertIds(new Set(JSON.parse(event.newValue ?? '[]'))) } catch { setReadAlertIds(new Set()) }
    }
    window.addEventListener('storage', syncReadAlerts)
    return () => window.removeEventListener('storage', syncReadAlerts)
  }, [])

  const apply = useCallback((raw) => {
    setSnap(normalize(raw))
    setMeta({ mode: 'live', updatedAt: new Date(), error: '', warnings: raw.warnings ?? [] })
  }, [])

  const load = useCallback(async (signal) => {
    const request = ++historyRequest.current
    const snapshot = await fetchSnapshot({ signal })
    const metrics = await fetchMetrics(filters.window, { signal }).catch((error) => {
      if (error instanceof AuthError) throw error
      return { history: [] }
    })
    return { request, snapshot, metrics }
  }, [filters.window])

  // Coleta imediata no agente (botão ↻ e "Executar verificação")
  const refresh = useCallback(async () => {
        try {
      const request = ++historyRequest.current
      const r = await send('POST', '/api/refresh')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const metrics = await fetchMetrics(filters.window).catch((error) => {
        if (error instanceof AuthError) throw error
        return { history: [] }
      })
      if (request === historyRequest.current) {
        apply(r.data)
        setChartHistory(Object.fromEntries(['cpu', 'ram', 'disk', 'net'].map((key) => [key, metrics.history.map((point) => point[key])])))
      }
      return true
    } catch (e) {
      if (!onAuthError(e)) setMeta((m) => ({ ...m, mode: 'error', error: e.message }))
      return false
    }
  }, [apply, filters.window])

  const act = useCallback(async (fn) => {
    try { return await fn() } catch (e) { return { ok: false, msg: onAuthError(e) ? '' : 'Sem conexão com a API.' } }
  }, [])

  const runBackup = useCallback(() => act(async () => {
    if (backupRunning.current) return { ok: false, msg: 'Já existe um backup em andamento.' }
    backupRunning.current = true
    const startedAt = Date.now()
    const toastId = showToast({ title: 'Iniciando backup...', tone: 'info', duration: 0, loading: true })
    const finishToast = (ok, title, detail) => showToast({ id: toastId, title, detail, tone: ok ? 'success' : 'error', duration: ok ? 4000 : 6000, loading: false })
    try {
      const response = await send('POST', '/api/actions/backup')
      if (response.status === 501) {
        const message = 'Backup não configurado: defina backups.command no config.json do agente.'
        finishToast(false, 'Backup não configurado', message)
        return { ok: false, msg: message }
      }
      if (response.status === 409) {
        const message = 'Já existe um backup em andamento.'
        finishToast(false, message)
        return { ok: false, msg: message }
      }
      if (response.status !== 202) {
        finishToast(false, 'Falha ao iniciar o backup.')
        return { ok: false, msg: 'Falha ao iniciar o backup.' }
      }
      showToast({ id: toastId, title: 'Backup em andamento...', tone: 'info', duration: 0, loading: true })
      for (let attempt = 0; attempt < 1800; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000))
        const status = await send('GET', '/api/backups')
        if (!status.ok) throw new Error('Não foi possível consultar o estado do backup.')
        const state = status.data.backup
        const completed = Date.parse(state?.lastResult?.completedAt)
        if (state?.running || !Number.isFinite(completed) || completed < startedAt) continue
        await refresh()
        if (state.lastResult.ok) {
          finishToast(true, 'Backup concluído com sucesso', 'A cópia foi criada e os dados foram atualizados.')
          return { ok: true, msg: 'Backup concluído com sucesso.' }
        }
        const message = 'O backup falhou. Verifique os alertas do agente.'
        finishToast(false, 'Falha no backup', message)
        return { ok: false, msg: message }
      }
      const message = 'O backup excedeu o tempo de acompanhamento. Verifique os alertas do agente.'
      finishToast(false, 'Tempo limite do backup', message)
      return { ok: false, msg: message }
    } catch (error) {
      const message = error?.message || 'Sem conexão com a API.'
      finishToast(false, 'Falha no backup', message)
      return { ok: false, msg: message }
    } finally {
      backupRunning.current = false
    }
  }), [act, refresh, showToast])

  const saveSchedule = useCallback((freq, time) => act(async () => {
        const r = await send('PUT', '/api/backup-schedule', { freq, time })
    if (r.ok) { apply(r.data); return { ok: true, msg: 'Agendamento salvo.' } }
    return { ok: false, msg: r.status === 400 ? 'Frequência ou horário inválido.' : 'Falha ao salvar o agendamento.' }
  }), [act, apply])

  const mutateSnapshot = useCallback(async (method, path, body, successMessage) => act(async () => {
        const r = await send(method, path, body)
    if (r.ok && r.data) {
      const snapshot = r.data.snapshot ?? r.data
      if (snapshot.server && Array.isArray(snapshot.apps)) apply(snapshot)
      return { ok: true, msg: successMessage, data: snapshot }
    }
    const errors = {
      400: 'Confira os dados informados.', 404: 'Item não encontrado.', 409: 'A ação já está em andamento ou existe um conflito.',
      501: 'A ação ainda não está configurada para o agente.',
    }
    return { ok: false, msg: errors[r.status] ?? 'Falha ao salvar a alteração.' }
  }), [act, apply])

  const updateServerMetadata = useCallback((values) => mutateSnapshot('PUT', '/api/server-config', values, 'Dados do servidor salvos.'), [mutateSnapshot])
  const addDomain = useCallback((values) => mutateSnapshot('POST', '/api/domains', values, 'Domínio adicionado e monitoramento iniciado.'), [mutateSnapshot])
  const removeDomain = useCallback((domain) => mutateSnapshot('DELETE', `/api/domains/${encodeURIComponent(domain)}`, undefined, 'Domínio removido do monitoramento.'), [mutateSnapshot])
  const setAppVisibility = useCallback((key, visible) => mutateSnapshot('PUT', `/api/apps/${encodeURIComponent(key)}/visibility`, { visible }, visible ? 'Aplicação restaurada no painel.' : 'Aplicação removida do painel.'), [mutateSnapshot])

  const runHostUpdate = useCallback((action) => act(async () => {
        const r = await send('POST', `/api/host-updates/${action}`)
    if (r.status === 202) {
      if (r.data?.snapshot) apply(r.data.snapshot)
      return { ok: true, msg: action === 'check' ? 'Verificação de pacotes enfileirada no Ubuntu WSL.' : 'Atualização segura enfileirada no Ubuntu WSL.' }
    }
    if (r.status === 409 && r.data?.error === 'update_check_required') return { ok: false, msg: 'Verifique as atualizações antes de instalar.' }
    if (r.status === 409) return { ok: false, msg: 'Já existe uma ação do Ubuntu em andamento.' }
    if (r.status === 501) return { ok: false, msg: 'Executor do Ubuntu WSL não configurado.' }
    return { ok: false, msg: 'Não foi possível iniciar a ação no Ubuntu WSL.' }
  }), [act, apply])

  const refreshHostUpdates = useCallback((signal) => fetchHostUpdates({ signal }), [])
  const applyHostUpdates = useCallback((result) => {
    setSnap((current) => ({
      ...current,
      security: {
        ...current.security,
        updateAction: result.update,
        packages: Number.isFinite(result.update?.packagesPending) ? result.update.packagesPending : current.security.packages,
      },
    }))
  }, [])

  useEffect(() => startPolling({
    intervalMs: POLL_MS,
    task: load,
    onResult: ({ request, snapshot, metrics }) => {
      if (request !== historyRequest.current) return
      apply(snapshot)
      setChartHistory(Object.fromEntries(['cpu', 'ram', 'disk', 'net'].map((key) => [key, metrics.history.map((point) => point[key])])))
    },
    onError: (error) => {
      if (!onAuthError(error)) setMeta((current) => ({ ...current, mode: 'error', error: error.message }))
    },
  }), [apply, load])

  const value = useMemo(() => {
    const win = WINDOWS[filters.window]
    const now = meta.updatedAt.getTime()
    return {
      ...snap,
      history: chartHistory,
      apps: filters.env === 'all' ? snap.apps : snap.apps.filter((a) => a.env === filters.env),
      allAlerts: snap.alerts,
      alerts: snap.alerts.filter((a) => now - a.ts <= win),
      events: snap.events.filter((e) => now - e.ts <= win),
      meta, filters, setFilters, refresh, runBackup, saveSchedule, updateServerMetadata, addDomain, removeDomain,
      setAppVisibility, runHostUpdate, refreshHostUpdates, applyHostUpdates, readAlertIds, markAlertsRead,
    }
  }, [snap, chartHistory, meta, filters, refresh, runBackup, saveSchedule, updateServerMetadata, addDomain, removeDomain, setAppVisibility, runHostUpdate, refreshHostUpdates, applyHostUpdates, readAlertIds, markAlertsRead])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

