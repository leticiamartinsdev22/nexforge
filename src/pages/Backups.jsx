import { useState } from 'react'
import { Archive, Clock, HardDrive, CalendarClock, ShieldCheck, CircleDot, Copy } from 'lucide-react'
import { useData } from '../store-utils'
import { Panel, Stats, Table, Pill, SDot, Donut } from '../components/ui'
import RowActions from '../components/RowActions'

const COLORS = ['#6b8cff', '#3ddc97', '#f5a524', '#566074']
const hhmm = (d) => d?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) ?? 'N/D'

function ScheduleControls({ backup, nextTxt, saveSchedule, runBackup }) {
  const [freq, setFreq] = useState(backup.schedule.freq)
  const [time, setTime] = useState(backup.schedule.time)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState('')
  const doSave = async () => { setBusy('save'); setMsg(await saveSchedule(freq, time)); setBusy('') }
  const doRun = async () => { setBusy('run'); setMsg(await runBackup()); setBusy('') }

  return (
    <Panel title="Agendamento" sub="Rotina única executada pelo agente">
      <label className="flabel" htmlFor="backup-frequency">Frequência</label>
      <select id="backup-frequency" className="field" value={freq} onChange={(e) => setFreq(e.target.value)} style={{ marginBottom: 18 }}>
        <option>Diária</option><option>Semanal</option><option>A cada 12h</option>
      </select>
      <label className="flabel" htmlFor="backup-time">Horário</label>
      <input id="backup-time" className="field" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ marginBottom: 18 }} />
      <div style={{ border: '1px solid var(--line)', borderRadius: 11, padding: '14px 16px', marginBottom: 20, background: 'rgba(255,255,255,.015)' }}>
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Próxima execução: <b style={{ color: 'var(--txt)' }}>{nextTxt}</b></div>
        <div style={{ fontSize: 11, color: 'var(--dimmer)', marginTop: 5 }}>Horário do servidor</div>
      </div>
      <button className="btn-acc" disabled={!!busy || !backup.enabled} onClick={doSave}>{busy === 'save' ? 'Salvando...' : 'Salvar agendamento'}</button>
      <button className="btn-acc" disabled={!!busy || !backup.enabled || backup.running} onClick={doRun}
        style={{ marginTop: 10, background: 'transparent', border: '1px solid rgba(108,123,255,.45)', color: 'var(--blue)' }}>
        {busy === 'run' || backup.running ? 'Backup em andamento...' : 'Executar backup agora'}
      </button>
      {!backup.enabled && <div className="msg bad">A rotina local precisa de um comando válido no config.json do agente.</div>}
      {msg?.msg && <div className={`msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.msg}</div>}
    </Panel>
  )
}

export default function Backups() {
  const { backups, offsite, backup, runBackup, saveSchedule } = useData()
  const [message, setMessage] = useState(null)

  const nextCandidate = backup.next ? new Date(backup.next) : null
  const nextDate = nextCandidate && Number.isFinite(nextCandidate.getTime()) ? nextCandidate : null
  const nextTxt = nextDate ? `${nextDate.toLocaleDateString('pt-BR')} ${hhmm(nextDate)}` : 'Sem execução agendada'
  const nextShort = nextDate ? `${nextDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hhmm(nextDate)}` : 'Sem execução agendada'
  const withData = backups.filter((b) => b.mb)
  const total = backups.reduce((s, b) => s + b.mb, 0)
  const latest = [...backups].filter((b) => b.hasBackup).sort((a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0))[0]
  const top = withData.slice(0, 3)
  const rest = total - top.reduce((s, b) => s + b.mb, 0)
  const seg = [...top.map((b, i) => ({ name: b.app, value: b.mb, color: COLORS[i] })), ...(rest > 0 ? [{ name: 'Demais apps', value: rest, color: COLORS[3] }] : [])]


  const cols = [
    { k: 'a', h: 'Aplicação', r: (b) => <div className="cell"><SDot s={b.hasBackup ? 'ok' : 'off'} /><span style={{ fontSize: 16 }}>{b.icon}</span><b className="strong">{b.app}</b></div> },
    { k: 'l', h: 'Último backup encontrado', r: (b) => (b.hasBackup ? b.last : 'Nenhum encontrado') },
    { k: 's', h: 'Tamanho', r: (b) => (b.mb ? `${b.mb.toFixed(1)} MB` : '0 MB') },
    { k: 'c', h: 'Cópias', r: (b) => b.copies ?? 0 },
    { k: 'n', h: 'Próxima rotina', r: () => (backup.enabled ? nextShort : 'Sem agendamento') },
    { k: 't', h: 'Encontrado', r: (b) => <Pill tone={b.hasBackup ? 'ok' : 'muted'}>{b.hasBackup ? 'Sim' : 'Não'}</Pill> },
    { k: 'st', h: 'Status', r: (b) => (b.hasBackup ? <Pill tone="ok">● Arquivo encontrado</Pill> : <Pill tone="muted">Nenhum arquivo</Pill>) },
    { k: 'x', h: '', r: (item) => <RowActions label={`Ações de backup de ${item.app}`} items={[
      { label: 'Copiar nome da aplicação', icon: Copy, onSelect: async () => {
        try { await navigator.clipboard.writeText(item.app); setMessage({ ok: true, text: `Nome de ${item.app} copiado.` }) }
        catch { setMessage({ ok: false, text: 'Não foi possível acessar a área de transferência.' }) }
      } },
      { label: 'Executar backup completo agora', icon: Archive, onSelect: async () => {
        const result = await runBackup(); setMessage({ ok: result.ok, text: result.msg })
      } },
    ]} /> },
  ]
  const routine = [
    [CircleDot, `Rotina ${backup.schedule.freq.toLowerCase()} · ${backup.schedule.time}`, 'comando único configurado no agente', backup.enabled ? nextShort : 'Rotina indisponível'],
  ]
  return (
    <div>
      <Stats items={[
        { icon: Archive, label: 'Apps com arquivo', value: backups.filter((b) => b.hasBackup).length, unit: `de ${backups.length}`, sub: 'cópia encontrada no disco', tone: 'ok' },
        { icon: Clock, label: 'Último backup', value: latest ? latest.last.replace('há ', '') : 'Nenhum', sub: latest?.app ?? 'nenhum encontrado', tone: 'blue' },
        { icon: HardDrive, label: 'Espaço total', value: (total / 1000).toFixed(2), unit: 'GB', sub: 'todas as cópias', tone: 'warn' },
        { icon: CalendarClock, label: 'Próxima execução', value: hhmm(nextDate), sub: nextTxt, tone: 'blue' },
        { icon: ShieldCheck, label: 'Rotina agendada', value: backup.enabled ? 'Sim' : 'Não', sub: 'comando do agente', tone: backup.enabled ? 'ok' : 'warn' },
      ]} />
      <Panel title="Backups por aplicação" sub="Arquivos encontrados nas pastas de cada aplicação"><Table cols={cols} rows={backups} />
        {backups.length === 0 && <div className="empty-state">Nenhuma aplicação está configurada para backup.</div>}
        {message && <div className={`msg ${message.ok ? 'ok' : 'bad'}`} role="status">{message.text}</div>}
      </Panel>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1.1fr 1fr', marginTop: 20 }}>
        <ScheduleControls key={`${backup.schedule.freq}-${backup.schedule.time}`} backup={backup} nextTxt={nextTxt} saveSchedule={saveSchedule} runBackup={runBackup} />
        <Panel title="Rotina automática">
          {routine.map(([Ic, t, d, tag]) => (
            <div key={t} className="qa" style={{ alignItems: 'flex-start' }}>
              <span className="ic" style={{ background: 'rgba(61,220,151,.1)', borderColor: 'rgba(61,220,151,.2)', color: 'var(--ok)' }}><Ic size={16} /></span>
              <span style={{ flex: 1 }}><div className="t">{t}</div><div className="d">{d}</div></span>
              {tag && <span className="pill ok mono">{tag}</span>}
            </div>
          ))}
        </Panel>
        <Panel title="Espaço por aplicação">
          {seg.length ? <>
            <div style={{ margin: '4px 0 20px' }}><Donut segments={seg} size={124} center={(total / 1000).toFixed(2)} sub="GB" /></div>
            {seg.map((s) => <div key={s.name} className="legend"><span className="l"><i style={{ background: s.color }} />{s.name}</span><b>{s.value.toFixed(1)} MB</b></div>)}
          </> : <div className="empty-state">O espaço usado aparecerá após o primeiro backup.</div>}
        </Panel>
      </div>
      <Panel title="Armazenamento externo" sub={offsite?.enabled ? 'Backup cifrado e enviado por Restic' : 'Desativado por preferência. Os backups são mantidos apenas no disco local por 30 dias.'} style={{ marginTop: 20 }}>
        {offsite ? (
          <>
            <div className="legend"><span className="l">Destino</span><b>{offsite.destination ?? 'Armazenamento local (/backups/nexforge)'}</b></div>
            <div className="legend"><span className="l">Estado</span><Pill tone={offsite.status === 'sincronizado' ? 'ok' : offsite.status?.startsWith('falha') ? 'bad' : 'muted'}>{offsite.enabled ? offsite.status ?? 'Não verificado' : 'Somente backup local'}</Pill></div>
            <div className="legend"><span className="l">Última sincronização externa</span><b>{offsite.enabled ? (offsite.lastSync ? new Date(offsite.lastSync).toLocaleString('pt-BR') : 'Ainda não executada') : 'Não se aplica'}</b></div>
            <div className="legend"><span className="l">Criptografia externa</span><Pill tone={offsite.enabled ? 'ok' : 'muted'}>{offsite.encryption ?? 'Não se aplica à cópia local'}</Pill></div>
          </>
        ) : <div style={{ color: 'var(--dimmer)', fontSize: 13 }}>Armazenamento externo desativado. Os backups são mantidos apenas no disco local por 30 dias.</div>}
      </Panel>
    </div>
  )
}
