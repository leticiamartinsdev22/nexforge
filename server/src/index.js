import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { domainToASCII } from 'node:url'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import si from 'systeminformation'
import { makeAuth } from './auth.js'
import { createCollector } from './collector.js'
import { createBackup } from './backup.js'
import { createStorage } from './storage.js'
import { metricRangeStart } from './metrics-range.js'
import { validateBackupDirectory } from './backup-path.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = process.env.NEXFORGE_DATA_DIR || (
  process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'NexForge', 'agent-data')
    : path.join(root, 'data')
)
fs.mkdirSync(dataDir, { recursive: true })
const readSecret = (fileVariable, valueVariable) => {
  const file = process.env[fileVariable]
  if (file) {
    try { return fs.readFileSync(file, 'utf8').replace(/[\r\n]+$/, '') } catch { return '' }
  }
  return process.env[valueVariable]
}
const PANEL_PASSWORD = readSecret('PANEL_PASSWORD_FILE', 'PANEL_PASSWORD')
const PANEL_SECRET = readSecret('PANEL_SECRET_FILE', 'PANEL_SECRET')
if (!PANEL_PASSWORD || !PANEL_SECRET || PANEL_SECRET.length < 16) {
  console.error('Defina PANEL_PASSWORD e PANEL_SECRET (>= 16 caracteres) no .env')
  process.exit(1)
}

const cfgPath = process.env.CONFIG_PATH || path.join(root, 'config.json')
let cfg = {}
try {
  const loaded = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) throw new Error('invalid_config')
  cfg = loaded
} catch {
  console.warn('Configuração do agente indisponível; usando estado vazio.')
}
if (!cfg.server || typeof cfg.server !== 'object' || Array.isArray(cfg.server)) cfg.server = {}
if (!cfg.apps || typeof cfg.apps !== 'object' || Array.isArray(cfg.apps)) cfg.apps = {}
if (!cfg.backups || typeof cfg.backups !== 'object' || Array.isArray(cfg.backups)) cfg.backups = {}
if (!process.env.NEXFORGE_BACKUP_DIR && !fs.existsSync('/app') && ['/backups', '/backups/nexforge'].includes(cfg.backups.dir)) {
  cfg.backups.dir = path.resolve(root, '..', 'backups')
}
const configuredBackupDir = process.env.NEXFORGE_BACKUP_DIR || cfg.backups.dir
if (configuredBackupDir) {
  try {
    cfg.backups.dir = validateBackupDirectory(configuredBackupDir, { projectRoot: root, allowTemp: process.env.NODE_ENV === 'test', tempRoot: process.env.NEXFORGE_TEST_BACKUP_ROOT })
  } catch {
    console.error('Diretório de backups inválido. Use um caminho absoluto dentro de /backups ou backups/ do projeto.')
    process.exit(1)
  }
}
if (!Array.isArray(cfg.domains)) cfg.domains = []
cfg.domains = cfg.domains.slice(0, 200)

const overridesPath = path.join(dataDir, 'ui-config.json')
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
const loadedOverrides = readJson(overridesPath, {})
const configOverrides = loadedOverrides && typeof loadedOverrides === 'object' && !Array.isArray(loadedOverrides) ? loadedOverrides : {}
if (configOverrides.server && typeof configOverrides.server === 'object') cfg.server = { ...cfg.server, ...configOverrides.server }
if (Array.isArray(configOverrides.domains)) cfg.domains = configOverrides.domains.slice(0, 200)
if (Array.isArray(configOverrides.hiddenApps)) cfg.hiddenApps = configOverrides.hiddenApps.slice(0, 200)

function saveConfigOverrides() {
  fs.mkdirSync(path.dirname(overridesPath), { recursive: true })
  const file = `${overridesPath}.${process.pid}.tmp`
  fs.writeFileSync(file, JSON.stringify({
    server: { name: cfg.server?.name, provider: cfg.server?.provider, region: cfg.server?.region },
    domains: cfg.domains ?? [],
    hiddenApps: cfg.hiddenApps ?? [],
  }), { mode: 0o600 })
  try { fs.rmSync(overridesPath, { force: true }) } catch {}
  fs.renameSync(file, overridesPath)
}

const cleanText = (value, max = 80) => typeof value === 'string' ? value.trim().slice(0, max) : ''
function normalizeDomain(value) {
  if (typeof value !== 'string') return null
  const ascii = domainToASCII(value.trim().replace(/\.$/, '')).toLowerCase()
  return ascii.length <= 253 && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(ascii) ? ascii : null
}
function normalizeRegistryDate(value) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.toISOString() : undefined
}

const requestedPoll = Number(process.env.POLL_MS)
const POLL = process.env.NODE_ENV === 'test'
  ? (Number.isFinite(requestedPoll) && requestedPoll >= 1000 ? Math.min(requestedPoll, 3600000) : 60000)
  : (Number.isFinite(requestedPoll) && requestedPoll >= 15000 ? Math.min(requestedPoll, 3600000) : 60000)
const dbPassword = readSecret('DATABASE_PASSWORD_FILE', 'DATABASE_PASSWORD')
const databaseUrl = process.env.DATABASE_URL || (dbPassword && process.env.DATABASE_HOST
  ? `postgresql://${encodeURIComponent(process.env.DATABASE_USER || 'nexforge')}:${encodeURIComponent(dbPassword)}@${process.env.DATABASE_HOST}:${process.env.DATABASE_PORT || 5432}/${encodeURIComponent(process.env.DATABASE_NAME || 'nexforge')}`
  : undefined)
const store = createStorage({
  connectionString: databaseUrl,
  retentionDays: process.env.METRICS_RETENTION_DAYS,
})
if (store) await store.init()
const ctx = { store, backupState: () => ({ enabled: false }) }
const collector = createCollector(cfg, dataDir, ctx)
const backup = createBackup({
  cfg, dataDir, store,
        onResult: ({ origin, ok }) => collector.addEvent(ok ? 'ok' : 'bad', ok ? `Backup ${origin} concluído` : `Backup ${origin} falhou`, 'backup'),
})
ctx.backupState = backup.state
const requestedSessionTtl = Number(process.env.SESSION_TTL_MS)
const SESSION_TTL_MS = process.env.NODE_ENV === 'test' && Number.isFinite(requestedSessionTtl) && requestedSessionTtl >= 1000
  ? Math.min(requestedSessionTtl, 4 * 3600e3)
  : 4 * 3600e3
const auth = makeAuth({ password: PANEL_PASSWORD, secret: PANEL_SECRET, ttlMs: SESSION_TTL_MS })
const SESSION_COOKIE = 'nexforge_session'
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true'
const cookieHeader = (token, maxAge, secure = COOKIE_SECURE) => `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
const requestUsesHttps = (req) => COOKIE_SECURE || req.get('x-forwarded-proto') === 'https'
const cookieToken = (req) => (req.headers.cookie ?? '').split(';').map((part) => part.trim())
  .find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1)

const configuredOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean)
if (!configuredOrigins.length || configuredOrigins.includes('*')) {
  console.error('CORS_ORIGIN deve listar origens específicas.')
  process.exit(1)
}
const allowedOrigins = new Set(configuredOrigins)
const proxySetting = process.env.TRUST_PROXY ?? 'false'
const proxyHops = Number(proxySetting)
const trustProxy = proxySetting === 'true' ? 1 : proxySetting === 'false' ? false
  : Number.isInteger(proxyHops) && proxyHops >= 0 ? proxyHops : false

const apiLimiter = rateLimit({
  windowMs: 60000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
})
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
})

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', trustProxy)
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use((_, res, next) => {
  res.set({ 'Cache-Control': 'no-store' })
  next()
})
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}))
app.use('/api', apiLimiter)
app.use('/api/login', loginLimiter)
app.use(express.json({ limit: '2kb', strict: true }))

const guard = (req, res, next) => {
  const bearer = (req.get('authorization') ?? '').replace(/^Bearer /i, '')
  if (auth.verify(bearer || cookieToken(req))) return next()
  if (cookieToken(req)) res.append('Set-Cookie', cookieHeader('', 0, requestUsesHttps(req)))
  return res.status(401).json({ error: 'unauthorized' })
}

app.get('/api/health', async (_, res) => {
  const dockerAvailable = Boolean(collector.get()?.docker?.available)
  const health = { available: true, dockerAvailable }
  if (!store) return res.json({ ok: true, database: 'disabled', ...health })
  try {
    await store.health()
    res.json({ ok: true, database: 'ok', ...health })
  } catch {
    res.status(503).json({ ok: false, database: 'unavailable', ...health })
  }
})

app.post('/api/login', (req, res) => {
  const r = auth.login(req.ip, String(req.body?.password ?? ''))
  if (r.error === 'too_many') return res.status(429).json({ error: 'too_many_attempts' })
  if (r.error) return res.status(401).json({ error: 'invalid' })
  res.append('Set-Cookie', cookieHeader(r.token, SESSION_TTL_MS / 1000, requestUsesHttps(req)))
  res.json({ authenticated: true })
})

app.get('/api/session', guard, (_, res) => res.json({ authenticated: true }))
app.post('/api/logout', (req, res) => {
  const bearer = (req.get('authorization') ?? '').replace(/^Bearer /i, '')
  auth.revoke(bearer || cookieToken(req))
  res.append('Set-Cookie', cookieHeader('', 0, requestUsesHttps(req)))
  res.status(204).end()
})

app.get('/api/snapshot', guard, (_, res) => {
  const s = collector.get()
  if (!s) return res.status(503).json({ error: 'warming_up' })
  res.json(s)
})

app.get('/api/metrics', guard, async (req, res) => {
  const range = typeof req.query.range === 'string' ? req.query.range : '1h'
  const from = metricRangeStart(range)
  if (!from) return res.status(400).json({ error: 'invalid_range' })
  if (!store) return res.json({ range, available: false, history: [] })
  try {
    const history = await store.loadMetricsRange(from)
    res.json({ range, available: true, history })
  } catch {
    console.error('falha ao consultar histórico de métricas.')
    res.status(503).json({ error: 'metrics_unavailable' })
  }
})

app.get('/api/history', guard, (_, res) => {
  const snapshot = collector.get()
  if (!snapshot) return res.status(503).json({ error: 'warming_up' })
  res.json({ available: true, history: snapshot.history, generatedAt: snapshot.generatedAt })
})

app.get('/api/containers', guard, (_, res) => {
  const snapshot = collector.get()
  const available = Boolean(snapshot?.docker?.available)
  res.json({ available, items: available ? snapshot.containers : [], ...(available ? {} : { message: 'Docker indisponível ou sem permissão para consultar o socket.' }) })
})

app.get('/api/processes', guard, async (_, res) => {
  if (!collector.get()?.docker?.available) return res.json({ available: false, items: [] })
  try {
    const result = await si.processes()
    const items = (result.list ?? []).slice(0, 100).map((process) => ({
      pid: Number(process.pid),
      name: String(process.name ?? '').slice(0, 100),
      cpu: Number.isFinite(Number(process.cpu)) ? Number(process.cpu) : 0,
      mem: Number.isFinite(Number(process.mem)) ? Number(process.mem) : 0,
      state: String(process.state ?? '').slice(0, 24),
    }))
    res.json({ available: true, source: 'agent-environment', items })
  } catch {
    res.json({ available: false, items: [] })
  }
})

app.get('/api/logs', guard, (_, res) => {
  const snapshot = collector.get()
  const available = Boolean(snapshot?.docker?.available)
  res.json({ available, sources: available ? snapshot.logSources : [], lines: [], ...(available ? {} : { message: 'Docker indisponível ou sem permissão para consultar os logs.' }) })
})

app.get('/api/alerts', guard, (_, res) => {
  const snapshot = collector.get()
  res.json({ available: Boolean(snapshot), items: snapshot?.alerts ?? [] })
})

app.get('/api/security', guard, (_, res) => {
  const snapshot = collector.get()
  const available = Boolean(snapshot?.docker?.available)
  res.json({
    available,
    security: snapshot?.security ?? null,
    hardening: snapshot?.hardening ?? [],
    ...(available ? {} : { message: 'Docker indisponível ou sem permissão para consultar o estado de segurança.' }),
  })
})

app.get('/api/domains', guard, (_, res) => {
  const snapshot = collector.get()
  res.json({ available: Boolean(snapshot), items: snapshot?.domains ?? [] })
})

app.get('/api/databases', guard, (_, res) => {
  const snapshot = collector.get()
  const available = Boolean(snapshot?.docker?.available)
  res.json({ available, items: available ? snapshot.dbs : [] })
})

app.get('/api/backups', guard, (_, res) => {
  const snapshot = collector.get()
  const backupState = backup.state()
  res.json({
    available: Boolean(backupState.enabled),
    items: snapshot?.backups ?? [],
    backup: backupState,
  })
})

// Coleta na hora ("Executar verificação" / botão ↻). Limitado a 1 coleta a cada 5s.
let lastRefresh = 0
app.post('/api/refresh', guard, async (_, res) => {
  if (Date.now() - lastRefresh > 5000) {
    lastRefresh = Date.now()
    try { await collector.collect() } catch { return res.status(500).json({ error: 'collect_failed' }) }
  }
  res.json(collector.get())
})

app.get('/api/logs/:source', guard, async (req, res) => {
  const snapshot = collector.get()
  if (!snapshot?.docker?.available) return res.json({ available: false, lines: [], message: 'Docker indisponível ou sem permissão para consultar os logs.' })
  if (!snapshot.logSources.includes(req.params.source)) {
    return res.status(404).json({ available: true, error: 'not_found' })
  }
  try {
    res.json({ available: true, lines: await collector.logs(req.params.source) })
  } catch {
    res.json({ available: false, lines: [], message: 'Não foi possível ler os logs deste container.' })
  }
})

app.post('/api/actions/backup', guard, (_, res) => {
  const r = backup.run('manual')
  if (r.ok) return res.status(202).json({ started: true })
  res.status(r.reason === 'running' ? 409 : 501).json({ error: r.reason, ...(r.reason === 'not_configured' ? { message: 'Configure backups.command no config.json do agente.' } : {}) })
})

app.put('/api/backup-schedule', guard, async (req, res) => {
  const result = await backup.setSchedule({ freq: req.body?.freq, time: req.body?.time })
  if (!result.ok) return res.status(result.reason === 'invalid' ? 400 : 500).json({ error: result.reason === 'invalid' ? 'invalid_schedule' : 'schedule_save_failed' })
  await collector.collect().catch(() => {})
  res.json(collector.get())
})

app.put('/api/server-config', guard, async (req, res) => {
  const provider = cleanText(req.body?.provider)
  const region = cleanText(req.body?.region)
  if (!provider || !region) return res.status(400).json({ error: 'invalid_server_metadata' })
  const previous = cfg.server
  cfg.server = { ...cfg.server, provider, region }
  try { saveConfigOverrides() } catch {
    cfg.server = previous
    return res.status(500).json({ error: 'config_save_failed' })
  }
  await collector.collect().catch(() => {})
  res.json(collector.get())
})

app.post('/api/domains', guard, async (req, res) => {
  const domain = normalizeDomain(req.body?.domain)
  const appName = cleanText(req.body?.app)
  const provider = cleanText(req.body?.provider)
  const registryExpires = normalizeRegistryDate(req.body?.registryExpires)
  if (!domain || registryExpires === undefined) return res.status(400).json({ error: 'invalid_domain' })
  if ((cfg.domains ?? []).length >= 200) return res.status(400).json({ error: 'domain_limit_reached' })
  if ((cfg.domains ?? []).some((item) => item.domain === domain)) return res.status(409).json({ error: 'domain_exists' })
  const entry = { domain, app: appName || 'Não associado', provider: provider || 'Não informado' }
  if (registryExpires) entry.registryExpires = registryExpires
  cfg.domains = [...(cfg.domains ?? []), entry]
  try { saveConfigOverrides() } catch {
    cfg.domains = cfg.domains.filter((item) => item !== entry)
    return res.status(500).json({ error: 'config_save_failed' })
  }
  await collector.collect().catch(() => {})
  res.status(201).json(collector.get())
})

app.delete('/api/domains/:domain', guard, async (req, res) => {
  const domain = normalizeDomain(req.params.domain)
  if (!domain) return res.status(400).json({ error: 'invalid_domain' })
  const previous = cfg.domains ?? []
  cfg.domains = previous.filter((item) => item.domain !== domain)
  if (cfg.domains.length === previous.length) return res.status(404).json({ error: 'domain_not_found' })
  try { saveConfigOverrides() } catch {
    cfg.domains = previous
    return res.status(500).json({ error: 'config_save_failed' })
  }
  await collector.collect().catch(() => {})
  res.json(collector.get())
})

app.put('/api/apps/:key/visibility', guard, async (req, res) => {
  const key = String(req.params.key ?? '')
  if (!/^[\w.-]{1,100}$/.test(key) || typeof req.body?.visible !== 'boolean') return res.status(400).json({ error: 'invalid_app_visibility' })
  const previous = cfg.hiddenApps ?? []
  const hidden = new Set(previous)
  if (req.body.visible) hidden.delete(key)
  else hidden.add(key)
  cfg.hiddenApps = [...hidden]
  try { saveConfigOverrides() } catch {
    cfg.hiddenApps = previous
    return res.status(500).json({ error: 'config_save_failed' })
  }
  await collector.collect().catch(() => {})
  res.json(collector.get())
})

const hostActionsDir = process.env.HOST_ACTIONS_DIR
const actionStatusPath = hostActionsDir ? path.join(hostActionsDir, 'status.json') : null
const hostActionsEnabled = () => Boolean(hostActionsDir && readJson(path.join(hostActionsDir, 'ubuntu-wsl.json'), null)?.platform === 'Ubuntu WSL')
app.get('/api/host-updates', guard, (_, res) => {
  res.json({ configured: hostActionsEnabled(), update: actionStatusPath ? readJson(actionStatusPath, null) : null })
})

async function queueHostUpdate(req, res, action) {
  if (!hostActionsEnabled()) return res.status(501).json({ error: 'host_updates_not_configured' })
  const current = readJson(actionStatusPath, null)
  if (current?.status === 'running' || current?.status === 'queued' || fs.existsSync(path.join(hostActionsDir, 'request.json'))) {
    return res.status(409).json({ error: 'host_update_busy', update: current })
  }
  if (action === 'upgrade' && !(current?.status === 'done' && current.action === 'check' && current.packagesPending > 0)) {
    return res.status(409).json({ error: 'update_check_required' })
  }
  const request = { id: randomUUID(), action, requestedAt: new Date().toISOString() }
  try {
    fs.mkdirSync(hostActionsDir, { recursive: true })
    const statusTemp = `${actionStatusPath}.${process.pid}.tmp`
    fs.writeFileSync(statusTemp, JSON.stringify({ ...request, status: 'queued' }), { mode: 0o600 })
    fs.renameSync(statusTemp, actionStatusPath)
    const requestPath = path.join(hostActionsDir, 'request.json')
    const requestTemp = `${requestPath}.${process.pid}.tmp`
    fs.writeFileSync(requestTemp, JSON.stringify(request), { mode: 0o600 })
    fs.renameSync(requestTemp, requestPath)
  } catch {
    return res.status(500).json({ error: 'host_update_queue_failed' })
  }
  await collector.collect().catch(() => {})
  res.status(202).json({ queued: true, update: readJson(actionStatusPath, null), snapshot: collector.get() })
}
app.post('/api/host-updates/check', guard, (req, res) => queueHostUpdate(req, res, 'check'))
app.post('/api/host-updates/upgrade', guard, (req, res) => queueHostUpdate(req, res, 'upgrade'))

app.use('/api', (_, res) => res.status(404).json({ error: 'not_found' }))
app.use((error, _, res, next) => {
  if (res.headersSent) return next(error)
  const status = error?.type === 'entity.too.large' ? 413
    : error?.type === 'entity.parse.failed' || error?.status === 400 ? 400 : 500
  const code = status === 413 ? 'request_too_large'
    : status === 400 ? 'invalid_request' : 'internal_error'
  if (status === 500) console.error('Falha interna ao processar uma requisição.')
  res.status(status).json({ error: code })
})

const tick = () => collector.collect().catch(() => console.error('coleta falhou.'))

const requestedPort = Number(process.env.PORT)
const PORT = process.env.PORT !== undefined && Number.isInteger(requestedPort) && requestedPort >= 0
  ? requestedPort : 3001
const HOST = process.env.HOST || '127.0.0.1'
await collector.initialize()
await backup.initialize()
const pollTimer = setInterval(tick, POLL)
const server = app.listen(PORT, HOST, () => {
  console.log('NexForge agent em http://' + HOST + ':' + PORT + ' (coleta a cada ' + (POLL / 1000) + 's)')
  void tick()
})

async function shutdown() {
  clearInterval(pollTimer)
  backup.close?.()
  server.close(async () => {
    await store?.close?.().catch(() => {})
    process.exit(0)
  })
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
