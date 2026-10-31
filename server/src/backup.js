import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'

const FREQS = ['Diária', 'Semanal', 'A cada 12h']
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }

// Executa o comando de backup definido por VOCÊ no config.json (backups.command, array: ["/caminho/script.sh", "arg"]).
// O cliente nunca envia comando algum — só pede "rodar" e escolhe frequência/horário. Sem shell (execFile).
export function createBackup({ cfg, dataDir, onResult, store }) {
  const file = path.join(dataDir, 'schedule.json')
  const stateFile = path.join(dataDir, 'backup-state.json')
  const cmd = cfg.backups?.command
  const enabled = Array.isArray(cmd) && cmd.length > 0 && cmd.every((x) => typeof x === 'string')
  const savedSchedule = readJson(file, null)
  let schedule = savedSchedule && FREQS.includes(savedSchedule.freq) && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(savedSchedule.time))
    ? savedSchedule
    : { freq: 'Diária', time: '03:15' }
  let running = false
  const offsiteConfigured = Boolean(process.env.RESTIC_REPOSITORY || process.env.RESTIC_PASSWORD)
  const offsiteEnabled = Boolean(process.env.RESTIC_REPOSITORY && (process.env.RESTIC_PASSWORD || process.env.RESTIC_PASSWORD_FILE))
  let offsite = {
    enabled: offsiteEnabled,
    destination: offsiteEnabled ? 'Repositório Restic' : 'Armazenamento local (/backups/nexforge)',
    encryption: offsiteEnabled ? 'Criptografado pelo Restic' : 'Não se aplica à cópia local',
    status: offsiteEnabled ? 'aguardando primeiro envio' : offsiteConfigured ? 'configuração incompleta' : 'somente backup local',
    lastSync: null,
  }
  const savedState = readJson(stateFile, null)
  if (offsiteEnabled && savedState?.offsite?.enabled) offsite = { ...offsite, ...savedState.offsite }

  function saveState() {
    try {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true })
      const temp = `${stateFile}.${process.pid}.tmp`
      fs.writeFileSync(temp, JSON.stringify({ offsite }), { mode: 0o600 })
      try { fs.rmSync(stateFile, { force: true }) } catch {}
      fs.renameSync(temp, stateFile)
    } catch (e) { console.warn('não foi possível salvar estado do backup:', e.message) }
  }

  function computeNext(from = new Date()) {
    const [hh, mm] = schedule.time.split(':').map(Number)
    const base = new Date(from)
    base.setHours(hh, mm, 0, 0)
    const cands = []
    if (schedule.freq === 'A cada 12h') {
      for (const off of [-12, 0, 12, 24]) cands.push(new Date(base.getTime() + off * 3600e3))
    } else {
      for (let i = 0; i < 9; i++) {
        const d = new Date(base); d.setDate(d.getDate() + i)
        if (schedule.freq !== 'Semanal' || d.getDay() === 0) cands.push(d)
      }
    }
    return cands.filter((d) => d > from).sort((a, b) => a - b)[0]
  }

  let next = enabled ? computeNext() : null

  function validSchedule(value) {
    return value && FREQS.includes(value.freq) && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value.time))
  }

  function mirrorSchedule(value) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 })
    try { fs.rmSync(file, { force: true }) } catch {}
    fs.renameSync(temp, file)
  }

  function run(origin) {
    if (!enabled) return { ok: false, reason: 'not_configured' }
    if (running) return { ok: false, reason: 'running' }
    running = true
    execFile(cmd[0], cmd.slice(1), { timeout: cfg.backups.timeoutMs ?? 30 * 60e3, maxBuffer: 1e6, cwd: cfg.backups.cwd }, (err, stdout = '') => {
      running = false
      const syncedAt = stdout.match(/OFFSITE_BACKUP_OK=([^\r\n]+)/)?.[1] ?? null
      if (offsiteEnabled) {
        offsite = {
          ...offsite,
          status: err ? 'falha no último envio' : syncedAt ? 'sincronizado' : 'backup local concluído',
          lastSync: syncedAt ?? offsite.lastSync,
        }
        saveState()
      }
      onResult({ origin, ok: !err, offsite })
    })
    return { ok: true }
  }

  const scheduleTimer = setInterval(() => {
    if (enabled && next && Date.now() >= next.getTime()) {
      next = computeNext(new Date(next.getTime() + 1000))
      run('agendado')
    }
  }, 30000).unref()

  return {
    enabled, run,
    close() { clearInterval(scheduleTimer) },
    state: () => ({ enabled, running, schedule, next: next?.toISOString() ?? null, offsite }),
    async initialize() {
      if (store) {
        const saved = await store.loadSchedule()
        if (validSchedule(saved)) schedule = saved
        else await store.saveSchedule(schedule)
      }
      try { mirrorSchedule(schedule) } catch (e) { console.warn('não foi possível espelhar o agendamento em arquivo:', e.message) }
      next = enabled ? computeNext() : null
    },
    async setSchedule({ freq, time }) {
      if (!FREQS.includes(freq) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))) return { ok: false, reason: 'invalid' }
      const candidate = { freq, time }
      try {
        if (store) {
          // The database is authoritative when enabled; the JSON file is only a mirror.
          await store.saveSchedule(candidate)
          schedule = candidate
          next = enabled ? computeNext() : null
          try { mirrorSchedule(candidate) } catch (e) {
            console.warn('não foi possível espelhar o agendamento em arquivo:', e.message)
          }
        } else {
          mirrorSchedule(candidate)
          schedule = candidate
          next = enabled ? computeNext() : null
        }
      } catch { return { ok: false, reason: 'persistence' } }
      return { ok: true }
    },
  }
}
