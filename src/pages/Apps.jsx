import { useState } from 'react'
import { Boxes, CircleCheck, Power, TriangleAlert, Archive, Eye, EyeOff, CheckSquare, Square } from 'lucide-react'
import { useData, useQ, has } from '../store-utils'
import { Panel, Stats, Table, Bar, Pill, SDot } from '../components/ui'
import RowActions from '../components/RowActions'

export default function Apps() {
  const { apps: all, runBackup, setAppVisibility } = useData()
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const q = useQ()
  const active = all.filter((app) => !app.hidden)
  const hidden = all.filter((app) => app.hidden)
  const apps = active.filter((app) => has(q, app.name, app.env))
  const selectedInView = apps.filter((app) => selected.has(app.key ?? app.name))
  const count = (status) => active.filter((app) => app.status === status).length

  const toggleOne = (key) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const toggleAll = () => setSelected((current) => {
    const keys = apps.map((app) => app.key ?? app.name)
    return keys.every((key) => current.has(key)) ? new Set() : new Set(keys)
  })

  const hideSelected = async () => {
    if (!selectedInView.length) return
    setBusy(true); setMessage(null)
    let failed = false
    for (const app of selectedInView) {
      const result = await setAppVisibility(app.key ?? app.name, false)
      if (!result.ok) { failed = true; break }
    }
    setSelected(new Set()); setSelecting(false); setBusy(false)
    setMessage({ ok: !failed, text: failed ? 'Não foi possível remover todas as aplicações selecionadas.' : 'Aplicações removidas do painel. Você pode restaurá-las abaixo.' })
  }

  const cols = [
    ...(selecting ? [{ k: 'select', h: <input type="checkbox" aria-label="Selecionar todas as aplicações visíveis" checked={apps.length > 0 && apps.every((app) => selected.has(app.key ?? app.name))} onChange={toggleAll} />, r: (app) => <input type="checkbox" aria-label={`Selecionar ${app.name}`} checked={selected.has(app.key ?? app.name)} onChange={() => toggleOne(app.key ?? app.name)} /> }] : []),
    { k: 'name', h: 'Aplicação', r: (app) => <div className="cell"><SDot s={app.status} /><span style={{ fontSize: 17 }}>{app.icon}</span><b className="strong">{app.name}</b></div> },
    { k: 'env', h: 'Ambiente', r: (app) => <Pill tone={app.env === 'Produção' ? 'blue' : 'muted'}>{app.env}</Pill> },
    { k: 'cpu', h: 'CPU', r: (app) => <Bar value={app.cpu} color="#6b8cff" /> },
    { k: 'mem', h: 'Memória', r: (app) => `${app.mem} MB` },
    { k: 'cont', h: 'Containers', r: (app) => <span className="mono">{app.cont}</span> },
    { k: 'st', h: 'Status', r: (app) => <Pill tone={app.status === 'ok' ? 'ok' : app.status === 'bad' ? 'bad' : 'muted'}>● {app.status === 'ok' ? 'Online' : app.status === 'bad' ? 'Offline' : 'Desligado'}</Pill> },
    { k: 'x', h: '', r: (app) => <RowActions label={`Ações de ${app.name}`} items={[
      { label: 'Selecionar', icon: CheckSquare, onSelect: () => { setSelecting(true); setSelected((current) => new Set(current).add(app.key ?? app.name)) } },
      { label: 'Executar backup do NexForge', icon: Archive, onSelect: async () => { setBusy(true); const result = await runBackup(); setMessage({ ok: result.ok, text: result.msg }); setBusy(false) } },
      { label: 'Remover do painel', icon: EyeOff, onSelect: async () => { setBusy(true); const result = await setAppVisibility(app.key ?? app.name, false); setMessage({ ok: result.ok, text: result.msg }); setBusy(false) }, danger: true },
    ]} /> },
  ]

  const hiddenCols = [
    { k: 'name', h: 'Aplicação', r: (app) => <div className="cell"><SDot s="off" /><span style={{ fontSize: 17 }}>{app.icon}</span><b className="strong">{app.name}</b></div> },
    { k: 'env', h: 'Ambiente' },
    { k: 'x', h: '', r: (app) => <RowActions label={`Ações de ${app.name}`} items={[{ label: 'Restaurar no painel', icon: Eye, onSelect: async () => { const result = await setAppVisibility(app.key ?? app.name, true); setMessage({ ok: result.ok, text: result.msg }) } }]} /> },
  ]

  return (
    <div>
      <Stats items={[
        { icon: Boxes, label: 'Aplicações', value: active.length, sub: `${count('ok')} em produção`, tone: 'blue' },
        { icon: CircleCheck, label: 'Online', value: count('ok'), sub: 'respondendo', tone: 'ok' },
        { icon: Power, label: 'Desligadas', value: count('off'), sub: 'ambientes de dev', tone: 'warn' },
        { icon: TriangleAlert, label: 'Offline', value: count('bad'), sub: 'exigem atenção', tone: 'bad' },
      ]} />
      <Panel title="Todas as aplicações" sub={`${apps.length} aplicações`} action={
        selecting ? <div className="selection-actions">
          <span>{selectedInView.length} selecionada(s)</span>
          <button type="button" className="alert-select-toggle" disabled={!selectedInView.length || busy} onClick={hideSelected}>Remover do painel</button>
          <button type="button" className="alert-select-toggle" onClick={() => { setSelecting(false); setSelected(new Set()) }}>Cancelar</button>
        </div> : <button type="button" className="alert-select-toggle apps-select-toggle" onClick={() => setSelecting(true)}><Square size={13} /> <span>Selecionar</span></button>
      }>
        <Table cols={cols} rows={apps} />
        {message && <div className={`msg ${message.ok ? 'ok' : 'bad'}`} role="status">{message.text}</div>}
        {apps.length === 0 && <div className="empty-state">{active.length ? 'Nenhuma aplicação corresponde à busca.' : 'Nenhuma aplicação ativa no painel.'}</div>}
      </Panel>
      {hidden.length > 0 && <Panel title="Removidas do painel" sub="Ocultar não altera nem para os containers; essas aplicações podem ser restauradas" style={{ marginTop: 20 }}>
        <Table cols={hiddenCols} rows={hidden} />
      </Panel>}
    </div>
  )
}
