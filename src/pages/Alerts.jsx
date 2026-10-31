import { useEffect, useRef, useState } from 'react'
import { Bell, TriangleAlert, Wrench, Clock } from 'lucide-react'
import { useData, WINDOW_LABELS } from '../store-utils'
import { Panel, Stats, Table, Pill } from '../components/ui'

export default function Alerts() {
  const { alerts, filters, readAlertIds, markAlertsRead } = useData()
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const selectAllRef = useRef(null)
  const selectedCount = alerts.filter((a) => selected.has(a.id)).length
  const allSelected = alerts.length > 0 && selectedCount === alerts.length

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedCount > 0 && !allSelected
  }, [selectedCount, allSelected])

  const n = (l) => alerts.filter((a) => a.level === l).length
  const toggleAlert = (id) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const toggleAll = () => setSelected((current) => {
    if (allSelected) return new Set()
    return new Set([...current, ...alerts.map((a) => a.id)])
  })
  const markSelectedRead = () => {
    markAlertsRead(selected)
    setSelected(new Set())
    setSelectMode(false)
  }
  const cols = [
    ...(selectMode ? [{ k: 'select', h: '', w: 48, r: (a) => <input className="alert-checkbox" type="checkbox" aria-label={`Selecionar alerta: ${a.msg}`} checked={selected.has(a.id)} onChange={() => toggleAlert(a.id)} /> }] : []),
    { k: 'when', h: 'Quando', r: (a) => <span style={{ color: 'var(--dim)' }}>{a.when}</span> },
    { k: 'tag', h: 'Nível', r: (a) => <Pill tone={a.level === 'bad' ? 'bad' : 'ok'}>{a.tag}</Pill> },
    { k: 'msg', h: 'Evento', r: (a) => <b className="strong" style={{ fontSize: 12.5 }}>{a.msg}</b> },
    { k: 'src', h: 'Origem', r: (a) => <span className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{a.source}</span> },
    { k: 'read', h: 'Leitura', r: (a) => <Pill tone={readAlertIds.has(a.id) ? 'muted' : 'blue'}>{readAlertIds.has(a.id) ? 'Lido' : 'Não lido'}</Pill> },
  ]
  const toolbar = <div className="alert-page-toolbar">
    {selectMode && <label className="alert-select-all alert-page-select-all"><input ref={selectAllRef} className="alert-checkbox" type="checkbox" checked={allSelected} onChange={toggleAll} /> <span>Selecionar todos ({alerts.length})</span></label>}
    {selectMode && <button className="alert-mark-read alert-page-mark-read" disabled={!selected.size} onClick={markSelectedRead}>Marcar como lido{selected.size ? ` (${selected.size})` : ''}</button>}
    <button className="alert-select-toggle" aria-pressed={selectMode} onClick={() => { setSelectMode((mode) => !mode); setSelected(new Set()) }}>{selectMode ? 'Cancelar' : 'Selecionar'}</button>
  </div>
  return (
    <div>
      <Stats items={[
        { icon: Bell, label: 'Alertas registrados', value: alerts.length, sub: 'no histórico', tone: 'blue' },
        { icon: TriangleAlert, label: 'Críticos', value: n('bad'), sub: 'falhas de serviço', tone: 'bad' },
        { icon: Wrench, label: 'Correções automáticas', value: n('ok'), sub: 'auto-heal do guard', tone: 'ok' },
        { icon: Clock, label: 'Último alerta', value: alerts[0]?.when.replace(' atrás', '') ?? 'Nenhum', sub: alerts[0]?.msg ?? 'nenhum no período', tone: 'warn' },
      ]} />
      <Panel title="Histórico de alertas" sub={`Eventos do guard e do auto-heal · ${WINDOW_LABELS.find(([k]) => k === filters.window)?.[1]}`} action={toolbar}><Table cols={cols} rows={alerts} /></Panel>
    </div>
  )
}
