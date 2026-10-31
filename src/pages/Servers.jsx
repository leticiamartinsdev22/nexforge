import { useState } from 'react'
import { Server, CircleCheck, TriangleAlert, Cpu, Clock, RefreshCw, Check, ChevronRight, Monitor, Pencil, Archive } from 'lucide-react'
import { useData, useHistory } from '../store-utils'
import { Panel, Stats, Table, Bar, Pill, SDot, Donut } from '../components/ui'
import RowActions from '../components/RowActions'

export default function Servers() {
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(false)
  const [provider, setProvider] = useState('')
  const [region, setRegion] = useState('')
  const { apps, server, refresh, runBackup, updateServerMetadata } = useData()
  const cpu = useHistory('cpu')
  const off = apps.filter((a) => a.status !== 'ok').length
  const cols = [
    { k: 'n', h: 'Servidor', r: (s) => (
      <div className="cell"><SDot /><span style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(107,140,255,.14)', color: '#8fa6ff' }}><Monitor size={15} /></span>
        <div><b className="strong">{s.name}</b> <span style={{ color: 'var(--dimmer)', fontSize: 11 }}>{apps.length} apps</span><div className="mono" style={{ color: 'var(--dimmer)', fontSize: 10.5, marginTop: 3 }}>{s.id}</div></div></div>) },
    { k: 'region', h: 'Localização', r: (s) => <span className="strong" style={{ fontWeight: 500 }}>{s.region}</span> },
    { k: 'provider', h: 'Provedor' },
    { k: 'ip', h: 'IP', r: (s) => <span className="mono" style={{ color: 'var(--secondary)' }}>{s.ip}</span> },
    { k: 'cpu', h: 'CPU', r: (s) => <Bar value={s.cpu} color="#6b8cff" /> },
    { k: 'ram', h: 'Memória', r: (s) => <Bar value={s.ram} color="#3ddc97" /> },
    { k: 'disk', h: 'Disco', r: (s) => <Bar value={s.disk} color="#6b8cff" /> },
    { k: 'up', h: 'Uptime', r: (s) => s.uptime },
    { k: 'st', h: 'Status', r: () => <Pill tone="ok">● Operacional</Pill> },
    { k: 'x', h: '', r: () => <RowActions label="Ações do servidor" items={[
      { label: 'Editar provedor e localização', icon: Pencil, onSelect: () => { setProvider(server.provider); setRegion(server.region); setEditing(true); setMsg(null) } },
      { label: 'Executar verificação', icon: RefreshCw, onSelect: async () => { setBusy('check'); const ok = await refresh(); setMsg({ ok, t: ok ? 'Verificação concluída.' : 'Falha ao verificar o servidor.' }); setBusy('') } },
      { label: 'Executar backup agora', icon: Archive, onSelect: async () => { setBusy('backup'); const result = await runBackup(); setMsg({ ok: result.ok, t: result.msg }); setBusy('') } },
    ]} /> },
  ]
  const cap = [['CPU', server.cpu, `${server.cpu.toFixed(1)}%`, '#6b8cff'], ['Memória', server.ram, `${server.ramUsed} / ${server.ramTotal} GB`, '#3ddc97'], ['Disco', server.disk, `${server.diskUsed} / ${server.diskTotal} GB`, '#6b8cff']]
  return (
    <div>
      <Stats items={[
        { icon: Server, label: 'Servidores', value: 1, sub: '1 monitorado', tone: 'blue' },
        { icon: CircleCheck, label: 'Operacionais', value: 1, sub: '100% no ar', tone: 'ok' },
        { icon: TriangleAlert, label: 'Serviços offline', value: off, sub: 'Nos apps', tone: 'warn' },
        { icon: Cpu, label: 'CPU do host', value: `${server.cpu.toFixed(1)}%`, sub: `${server.vcpu} vCPU · load ${server.load}`, tone: 'ok', spark: cpu },
        { icon: Clock, label: 'Uptime', value: server.uptimeDays, unit: 'd', sub: server.uptime, tone: 'warn' },
      ]} />
      <Panel title="Inventário de servidores" sub={`1 servidor · ${apps.filter((app) => !app.hidden).length} aplicações`} action={
        <button type="button" className="alert-select-toggle" onClick={() => { setProvider(server.provider); setRegion(server.region); setEditing((open) => !open); setMsg(null) }}>
          {editing ? 'Cancelar' : 'Editar servidor'}
        </button>
      }>
        <Table cols={cols} rows={[server]} />
        {editing && <form className="server-meta-form" onSubmit={async (event) => {
          event.preventDefault(); setBusy('save'); setMsg(null)
          const result = await updateServerMetadata({ provider, region })
          setMsg({ ok: result.ok, t: result.msg }); setBusy(''); if (result.ok) setEditing(false)
        }}>
          <label><span>Provedor</span><input className="field" value={provider} maxLength={80} required onChange={(event) => setProvider(event.target.value)} placeholder="Ex.: Máquina própria, Oracle, AWS" /></label>
          <label><span>Localização</span><input className="field" value={region} maxLength={80} required onChange={(event) => setRegion(event.target.value)} placeholder="Ex.: Ubuntu local (WSL2), região ou cidade" /></label>
          <button className="btn-acc" type="submit" disabled={busy === 'save'}>{busy === 'save' ? 'Salvando...' : 'Salvar dados'}</button>
        </form>}
        {msg?.t && <div className={`msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.t}</div>}
      </Panel>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 20 }}>
        <Panel title="Ações rápidas" style={{ padding: '30px 24px' }}>
          {[['check', RefreshCw, 'Executar verificação', 'coleta todos os dados agora'], ['backup', Check, 'Backup agora', 'dispara o backup configurado no agente']].map(([k, Ic, t, d]) => (
            <button key={k} className="qa" disabled={!!busy} onClick={async () => {
              setBusy(k); setMsg(null)
              if (k === 'check') {
                const ok = await refresh()
                setMsg({ ok, t: ok ? `Verificação concluída às ${new Date().toLocaleTimeString('pt-BR')}.` : 'Falha ao verificar. Confira a conexão com a API.' })
              } else {
                const r = await runBackup()
                setMsg({ ok: r.ok, t: r.msg })
              }
              setBusy('')
            }}>
              <span className="ic"><Ic size={17} /></span><span style={{ flex: 1 }}><div className="t">{busy === k ? 'Executando...' : t}</div><div className="d">{d}</div></span><ChevronRight size={16} color="#7d8fb5" />
            </button>
          ))}
          {msg?.t && <div className={`msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.t}</div>}
        </Panel>
        <Panel title="Capacidade total">
          {cap.map(([l, v, t, c]) => (
            <div key={l} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 9 }}><span style={{ color: 'var(--secondary)' }}>{l}</span><b>{t}</b></div>
              <Bar value={v} color={c} track showN={false} />
            </div>
          ))}
        </Panel>
        <Panel title="Distribuição por região">
          <div style={{ margin: '14px 0 22px' }}><Donut segments={[{ value: 1, color: '#6b8cff' }]} size={124} center={1} sub="Servidor" /></div>
          <div className="legend"><span className="l"><i style={{ background: '#6b8cff' }} />{server.region}</span><b>1 (100%)</b></div>
        </Panel>
      </div>
    </div>
  )
}
