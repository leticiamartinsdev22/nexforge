import { Database, CircleCheck, TriangleAlert, Layers, Copy } from 'lucide-react'
import { useData, useQ, has } from '../store-utils'
import { Panel, Stats, Table, Pill, SDot } from '../components/ui'
import RowActions from '../components/RowActions'

export default function Databases() {
  const { dbs } = useData()
  const q = useQ()
  const rows = dbs.filter((d) => has(q, d.name, d.engine, d.app))
  const cols = [
    { k: 'n', h: 'Banco', r: (d) => <div className="cell"><SDot s={d.status} /><Database size={16} color="#6b8cff" /><b className="strong mono" style={{ fontSize: 12.5 }}>{d.name}</b></div> },
    { k: 'engine', h: 'Engine' },
    { k: 'app', h: 'Aplicação' },
    { k: 'size', h: 'Tamanho' },
    { k: 'conns', h: 'Conexões', r: (d) => <span className="mono">{d.conns}</span> },
    { k: 's', h: 'Status', r: (d) => <Pill tone={d.status === 'ok' ? 'ok' : 'bad'}>● {d.status === 'ok' ? 'Saudável' : 'Offline'}</Pill> },
    { k: 'x', h: '', r: (database) => <RowActions label={`Ações de ${database.name}`} items={[{
      label: 'Copiar nome do banco', icon: Copy, onSelect: async () => { try { await navigator.clipboard.writeText(database.name) } catch { /* clipboard não disponível */ } },
    }]} /> },
  ]
  return (
    <div>
      <Stats items={[
        { icon: Database, label: 'Bancos', value: dbs.length, sub: 'monitorados', tone: 'blue' },
        { icon: CircleCheck, label: 'Saudáveis', value: dbs.filter((d) => d.status === 'ok').length, sub: 'respondendo', tone: 'ok' },
        { icon: TriangleAlert, label: 'Com problema', value: dbs.filter((d) => d.status === 'bad').length, sub: 'exigem atenção', tone: 'bad' },
        { icon: Layers, label: 'Engines', value: new Set(dbs.map((d) => d.engine.split(':')[0])).size, sub: 'tipos diferentes', tone: 'warn' },
      ]} />
      <Panel title="Bancos de dados" sub={`${dbs.length} instâncias`}><Table cols={cols} rows={rows} /></Panel>
    </div>
  )
}
