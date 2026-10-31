import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { execFile } from 'node:child_process'
import si from 'systeminformation'
import Docker from 'dockerode'

const GB = 1024 ** 3
const r1 = (n) => Math.round(n * 10) / 10
const safe = (s) => String(s).replace(/[^\w.-]/g, '_')

function makeDocker() {
  const h = process.env.DOCKER_HOST
  if (h?.startsWith('tcp://')) {
    const u = new URL(h)
    return new Docker({ host: u.hostname, port: Number(u.port) || 2375 })
  }
  if (h?.startsWith('npipe://')) return new Docker({ socketPath: h.slice('npipe://'.length) })
  const defaultSocket = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock'
  return new Docker({ socketPath: process.env.DOCKER_SOCKET || defaultSocket })
}

const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return fallback } }

function ago(ms) {
  const m = Math.floor((Date.now() - ms) / 60000)
  if (m < 60) return `há ${Math.max(m, 1)}min`
  const h = Math.floor(m / 60)
  return h < 48 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`
}

function checkSsl(host) {
  return new Promise((resolve) => {
    try {
      const s = tls.connect({ host, port: 443, servername: host, timeout: 5000 }, () => {
        const cert = s.getPeerCertificate()
        s.end()
        resolve(cert?.valid_to ? Math.floor((new Date(cert.valid_to) - Date.now()) / 864e5) : null)
      })
      s.on('error', () => resolve(null))
      s.on('timeout', () => { s.destroy(); resolve(null) })
    } catch { resolve(null) }
  })
}

function demux(buf) {
  let out = '', i = 0
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i + 4)
    out += buf.subarray(i + 8, i + 8 + len).toString('utf8')
    i += 8 + len
  }
  return out
}

const eventKey = (event) => `${new Date(event.ts ?? event.occurred_at).getTime()}|${event.level}|${event.msg ?? event.message}|${event.source}`

export function mergeEvents(...sources) {
  const unique = new Map()
  for (const event of sources.flat()) {
    if (!event || !Number.isFinite(new Date(event.ts ?? event.occurred_at).getTime())) continue
    unique.set(eventKey(event), event)
  }
  return [...unique.values()].sort((a, b) =>
    new Date(b.ts ?? b.occurred_at).getTime() - new Date(a.ts ?? a.occurred_at).getTime(),
  ).slice(0, 200)
}

function parseLine(line) {
  const m = line.match(/^(\S+Z)\s(.*)$/)
  const msg = m ? m[2] : line
  return {
    t: m ? new Date(m[1]).toLocaleTimeString('pt-BR') : '',
    lvl: /\b(error|fatal|panic|exception)\b/i.test(msg) ? 'ERROR' : /\bwarn(ing)?\b/i.test(msg) ? 'WARN' : 'INFO',
    msg: msg.slice(0, 500),
  }
}

export function summarizeStats(s) {
  const prev = s.precpu_stats?.cpu_usage?.total_usage
  const cpuDelta = s.cpu_stats.cpu_usage.total_usage - (prev ?? 0)
  const sysDelta = s.cpu_stats.system_cpu_usage - (s.precpu_stats?.system_cpu_usage ?? 0)
  const cpuCount = s.cpu_stats.online_cpus || s.cpu_stats.cpu_usage?.percpu_usage?.length || 1
  const cpu = prev && sysDelta > 0 && cpuDelta > 0 ? (cpuDelta / sysDelta) * cpuCount * 100 : 0
  const m = s.memory_stats ?? {}
  const cache = m.stats?.inactive_file ?? m.stats?.cache ?? 0
  return { cpu, memMB: Math.max((m.usage ?? 0) - cache, 0) / 1048576 }
}

export function summarizeSecurityChecks({ dockerOk, disk, ram, domains = [], diskThreshold = 90, ramThreshold = 90 }) {
  const checks = [dockerOk, disk < diskThreshold, ram < ramThreshold]
  if (domains.length) checks.push(domains.every((domain) => domain.ssl != null && domain.ssl > 14))
  return { checksOk: checks.filter(Boolean).length, checksTotal: checks.length }
}

export function createCollector(cfg, dataDir, ctx = {}) {
  const docker = makeDocker()
  const eventsFile = path.join(dataDir, 'events.json')
  const history = { cpu: [], ram: [], disk: [], net: [] }
  const sslCache = new Map()
  const savedEvents = readJson(eventsFile, [])
  let events = Array.isArray(savedEvents) ? savedEvents.slice(0, 200) : []
  let prevStatus = null
  let pkgCache = { at: 0, n: 0 }
  let snapshot = null
  let running = false

  const th = { disk: cfg.thresholds?.disk ?? 90, ram: cfg.thresholds?.ram ?? 90 }
  const hot = { disk: false, ram: false }

  const pushEvent = (level, msg, source) => {
    const event = { ts: Date.now(), level, msg, source }
    events = [event, ...events].slice(0, 200)
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(eventsFile, JSON.stringify(events)) } catch {}
    if (ctx.store) ctx.store.saveEvent(event).catch((e) => console.error('falha ao salvar evento no PostgreSQL:', e.message))
  }

  async function initialize() {
    if (!ctx.store) return
    const diskEvents = events
    const savedEvents = await ctx.store.loadEvents()
    const persisted = new Set(savedEvents.map(eventKey))
    events = mergeEvents(diskEvents, savedEvents)
    for (const event of [...events].reverse()) {
      const key = eventKey(event)
      if (!persisted.has(key)) {
        await ctx.store.saveEvent(event)
        persisted.add(key)
      }
    }

    const samples = await ctx.store.loadMetrics(30)
    for (const key of ['cpu', 'ram', 'disk', 'net']) history[key] = samples.map((sample) => Number(sample[key]))
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(eventsFile, JSON.stringify(events)) } catch {}
  }

  // Alerta de disco/memória com histerese (avisa ao passar do limite e de novo ao voltar 5 pontos abaixo).
  function trackHost(h) {
    for (const [k, label, v] of [['disk', 'Disco', h.disk], ['ram', 'Memória', h.ram]]) {
      if (!hot[k] && v >= th[k]) { hot[k] = true; pushEvent('bad', `${label} acima de ${th[k]}% (${v}%)`, 'srv') }
      else if (hot[k] && v < th[k] - 5) { hot[k] = false; pushEvent('ok', `${label} normalizado (${v}%)`, 'srv') }
    }
  }

  async function host() {
    const hostMetrics = process.env.HOST_METRICS_FILE ? readJson(process.env.HOST_METRICS_FILE, null) : null
    const hostMetricsAt = Date.parse(hostMetrics?.generatedAt ?? '')
    if (hostMetrics && Number.isFinite(hostMetricsAt) && Date.now() - hostMetricsAt < 120000) {
      const numeric = (key, fallback = 0) => Number.isFinite(Number(hostMetrics[key])) ? Number(hostMetrics[key]) : fallback
      const up = Math.max(0, (Date.now() - numeric('bootAt', Date.now())) / 1000)
      const d = Math.floor(up / 86400), h = Math.floor((up % 86400) / 3600), m = Math.floor((up % 3600) / 60)
      return {
        name: cfg.server?.name ?? hostMetrics.name ?? os.hostname(), id: hostMetrics.name ?? os.hostname(),
        region: cfg.server?.region ?? 'Não informado', provider: cfg.server?.provider ?? 'Não informado',
        ip: cfg.server?.ip ?? hostMetrics.ip ?? 'Aguardando dados', os: hostMetrics.os ?? 'Linux',
        cpu: r1(numeric('cpu')), ram: r1(numeric('ram')), disk: r1(numeric('disk')),
        vcpu: Math.max(1, numeric('vcpu', 1)), load: null,
        ramUsed: String(hostMetrics.ramUsed ?? '0.0'), ramTotal: String(hostMetrics.ramTotal ?? '0.0'),
        diskUsed: String(hostMetrics.diskUsed ?? '0.0'), diskTotal: String(hostMetrics.diskTotal ?? '0.0'),
        uptime: hostMetrics.uptime ?? `${d}d ${h}h`, uptimeFull: hostMetrics.uptimeFull ?? `${d}d ${h}h ${m}m`, uptimeDays: hostMetrics.uptimeDays ?? d,
        netMBs: r1(numeric('netMBs')), pendingReboot: Boolean(hostMetrics.pendingReboot),
        bootAt: numeric('bootAt', Date.now() - up * 1000),
        source: hostMetrics.source ?? 'Host metrics file', metricsAt: new Date(hostMetricsAt).toISOString(),
      }
    }
    const [load, mem, fsz, net, osi, time, cpu, ifaces] = await Promise.all([
      si.currentLoad(), si.mem(), si.fsSize(), si.networkStats(), si.osInfo(), si.time(), si.cpu(),
      si.networkInterfaces('default').catch(() => null),
    ])
    const root = fsz.find((f) => f.mount === '/') ?? fsz[0] ?? { use: 0, used: 0, size: 0 }
    const used = mem.total - mem.available
    const netMBs = net.reduce((s, n) => s + (n.rx_sec ?? 0) + (n.tx_sec ?? 0), 0) / 1e6
    const up = time.uptime
    const d = Math.floor(up / 86400), h = Math.floor((up % 86400) / 3600), m = Math.floor((up % 3600) / 60)
    const iface = Array.isArray(ifaces) ? ifaces[0] : ifaces
    return {
      name: cfg.server?.name ?? os.hostname(), id: os.hostname(),
      region: cfg.server?.region ?? 'Não informado', provider: cfg.server?.provider ?? 'Não informado',
      ip: cfg.server?.ip ?? iface?.ip4 ?? 'Não detectado', os: `${osi.distro} ${osi.release}`.trim(),
      cpu: r1(load.currentLoad), ram: r1((used / mem.total) * 100), disk: r1(root.use),
      vcpu: cpu.cores, load: r1(os.loadavg()[0]),
      ramUsed: r1(used / GB).toFixed(1), ramTotal: r1(mem.total / GB).toFixed(1),
      diskUsed: r1(root.used / GB).toFixed(1), diskTotal: r1(root.size / GB).toFixed(1),
      uptime: `${d}d ${h}h`, uptimeFull: `${d}d ${h}h ${m}m`, uptimeDays: d,
      netMBs: Math.round(netMBs * 100) / 100,
      pendingReboot: fs.existsSync('/var/run/reboot-required'),
      bootAt: Date.now() - up * 1000,
      source: 'Docker Linux environment', metricsAt: new Date().toISOString(),
    }
  }

  async function containers() {
    const list = await docker.listContainers({ all: true })
    const stats = await Promise.all(list.map(async (c) => {
      if (c.State !== 'running') return null
      try { return summarizeStats(await docker.getContainer(c.Id).stats({ stream: false })) } catch { return null }
    }))
    return list
      .map((c, i) => ({
        name: (c.Names[0] ?? c.Id).replace(/^\//, ''), image: c.Image, state: c.State,
        project: c.Labels?.['com.docker.compose.project'] ?? null, stats: stats[i],
      }))
      .filter((c) => !cfg.ignoreContainers?.includes(c.name))
  }

  function buildApps(cs) {
    const groups = new Map()
    for (const key of Object.keys(cfg.apps ?? {})) groups.set(key, [])
    for (const c of cs) {
      const key = c.project ?? c.name
      groups.set(key, [...(groups.get(key) ?? []), c])
    }
    return [...groups]
      .map(([key, list]) => {
        const conf = cfg.apps?.[key] ?? {}
        const running = list.filter((c) => c.state === 'running').length
        const env = conf.env ?? 'Produção'
        const status = running > 0 && running === list.length ? 'ok' : running === 0 && env === 'Desenvolvimento' ? 'off' : 'bad'
        return {
          key, name: conf.name ?? key, icon: conf.icon ?? '📦', env, status,
          hidden: cfg.hiddenApps?.includes(key) ?? false,
          cpu: r1(list.reduce((s, c) => s + (c.stats?.cpu ?? 0), 0)),
          mem: Math.round(list.reduce((s, c) => s + (c.stats?.memMB ?? 0), 0)),
          cont: `${running}/${list.length}`,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async function domains() {
    return Promise.all((cfg.domains ?? []).map(async (d) => {
      let c = sslCache.get(d.domain)
      if (!c || Date.now() - c.at > (c.days == null ? 5 * 60e3 : 3600e3)) {
        c = { at: Date.now(), days: await checkSsl(d.domain) }
        sslCache.set(d.domain, c)
        if (sslCache.size > 200) sslCache.delete(sslCache.keys().next().value)
      }
      const expTs = d.registryExpires ? Date.parse(d.registryExpires) : NaN
      const exp = Number.isFinite(expTs) ? new Date(expTs) : null
      return {
        domain: d.domain, app: d.app ?? 'Não associado', icon: d.icon ?? '', provider: d.provider ?? 'Não informado', ssl: c.days,
        days: exp ? Math.max(Math.floor((exp - Date.now()) / 864e5), 0) : null, expiresAt: exp?.toISOString() ?? null,
      }
    }))
  }

  function backups(apps) {
    const dir = cfg.backups?.dir
    return apps.map((a) => {
      let last = 0, size = 0, copies = 0
      try {
        if (dir) {
          const p = path.join(dir, safe(a.key))
          const files = fs.readdirSync(p).map((f) => fs.statSync(path.join(p, f))).filter((s) => s.isFile())
          copies = files.length
          const newest = files.sort((x, y) => y.mtimeMs - x.mtimeMs)[0]
          if (newest) { last = newest.mtimeMs; size = newest.size / 1048576 }
        }
      } catch {}
      return { app: a.name, icon: a.icon, mb: r1(size), hasBackup: !!last, last: last ? ago(last) : 'Nenhum backup encontrado', lastTs: last || null, copies }
    })
  }

  async function packages() {
    const hostUpdate = process.env.HOST_ACTIONS_DIR
      ? readJson(path.join(process.env.HOST_ACTIONS_DIR, 'status.json'), null)
      : null
    if (hostUpdate?.status === 'done' && Number.isFinite(hostUpdate.packagesPending)) return hostUpdate.packagesPending
    if (Date.now() - pkgCache.at < 3600e3) return pkgCache.n
    const n = await new Promise((resolve) =>
      execFile('apt', ['list', '--upgradable'], { timeout: 8000 }, (err, out) =>
        resolve(err ? null : out.split('\n').filter((l) => l.includes('/')).length)))
    pkgCache = { at: Date.now(), n }
    return n
  }

  function trackChanges(apps) {
    const cur = Object.fromEntries(apps.map((a) => [a.key, a.status]))
    if (prevStatus) {
      for (const a of apps) {
        const p = prevStatus[a.key]
        if (!p || p === a.status) continue
        if (a.status === 'bad') pushEvent('bad', `${a.name} está offline`, a.key)
        else if (a.status === 'ok') pushEvent('ok', `${a.name} voltou ao ar`, a.key)
        else pushEvent('ok', `${a.name} foi desligado`, a.key)
      }
    }
    prevStatus = cur
  }

  async function collect() {
    if (running) return snapshot
    running = true
    const warnings = []
    try {
      const h = await host()
      if (process.env.HOST_METRICS_FILE && h.source === 'Docker Linux environment') {
        warnings.push('Coletor do host sem dados atualizados; exibindo as métricas Linux do agente Docker.')
      }
      trackHost(h)
      let cs = [], dockerOk = true
      try { cs = await containers() } catch (e) { dockerOk = false; warnings.push('Docker indisponível ou sem permissão para consultar o socket.') }
      const apps = buildApps(cs)
      trackChanges(apps)
      const dom = await domains()

      const conns = await si.networkConnections().catch(() => [])
      const pub = new Set(conns.filter((c) => c.state === 'LISTEN' && ['0.0.0.0', '::', '*'].includes(c.localAddress)).map((c) => c.localPort))
      const checks = summarizeSecurityChecks({
        dockerOk, disk: h.disk, ram: h.ram, domains: dom,
        diskThreshold: th.disk, ramThreshold: th.ram,
      })

      for (const [k, v] of [['cpu', h.cpu], ['ram', h.ram], ['disk', h.disk], ['net', h.netMBs]]) {
        const arr = history[k]
        arr.push(v)
        if (arr.length > 30) arr.splice(0, arr.length - 30)
      }

      const appName = (c) => cfg.apps?.[c.project ?? c.name]?.name ?? c.project ?? c.name
      snapshot = {
        generatedAt: new Date().toISOString(),
        warnings,
        server: h,
        docker: { available: dockerOk, containerCount: cs.length },
        containers: cs,
        apps,
        hiddenApps: apps.filter((a) => a.hidden).map(({ key, name }) => ({ key, name })),
        domains: dom,
        dbs: cs.filter((c) => /(postgres|mysql|mariadb|mongo|redis)/i.test(c.image)).map((c) => ({
          name: c.name, engine: c.image.split('/').pop(), app: appName(c), size: 'Não medido', conns: 'Não medido', status: c.state === 'running' ? 'ok' : 'bad',
        })),
        backups: backups(apps),
        alerts: events,
        events: events.slice(0, 5).map((e) => ({ ts: e.ts, title: e.msg, detail: e.source, tag: e.level === 'ok' ? 'OK' : 'FALHA' })),
        hardening: cfg.hardening ?? [],
        security: {
          packages: await packages(), rebootPending: h.pendingReboot,
          updatesSupported: Boolean(process.env.HOST_ACTIONS_DIR && readJson(path.join(process.env.HOST_ACTIONS_DIR, 'ubuntu-wsl.json'), null)?.platform === 'Ubuntu WSL'),
          updateAction: process.env.HOST_ACTIONS_DIR
            ? readJson(path.join(process.env.HOST_ACTIONS_DIR, 'status.json'), null)
            : null,
          lastBoot: new Date(h.bootAt).toISOString().slice(0, 19).replace('T', ' '),
          publicPorts: pub.size, ...checks,
        },
        offsite: (ctx.backupState?.() ?? {}).offsite ?? cfg.offsite ?? null,
        backup: ctx.backupState?.() ?? { enabled: false },
        logSources: cs.map((c) => c.name).sort(),
        history: { ...history },
      }
      if (ctx.store) {
        try {
          await ctx.store.saveMetrics({
            ts: Date.now(), cpu: h.cpu, ram: h.ram, disk: h.disk, net: h.netMBs,
          })
        } catch (e) {
          warnings.push(`PostgreSQL indisponível: ${e.message}`)
          snapshot.warnings = warnings
          console.error('falha ao salvar métricas no PostgreSQL:', e.message)
        }
      }
      return snapshot
    } finally { running = false }
  }

  async function logs(source) {
    const list = await docker.listContainers({ all: true })
    const c = list.find((x) => (x.Names[0] ?? '').replace(/^\//, '') === source) // só nomes existentes (whitelist)
    if (!c) throw new Error('not found')
    const ct = docker.getContainer(c.Id)
    const info = await ct.inspect()
    const buf = await ct.logs({ stdout: true, stderr: true, tail: 180, timestamps: true })
    const text = info.Config?.Tty ? buf.toString('utf8') : demux(buf)
    return text.split('\n').filter(Boolean).slice(-180).map(parseLine).reverse()
  }

  return { initialize, collect, logs, get: () => snapshot, addEvent: pushEvent }
}
