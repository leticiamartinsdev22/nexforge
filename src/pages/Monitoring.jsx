import { Cpu, MemoryStick, HardDrive, Network, Gauge } from 'lucide-react'
import { useData, useHistory } from '../store-utils'
import { Panel, Stats, Spark, Bar } from '../components/ui'

function Chart({ title, k, color, value, norm }) {
  const s = useHistory(k, norm)
  return (
    <Panel>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span className="mini-l" style={{ fontSize: 10 }}>{title}</span>
        <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em' }}>{value}</span>
      </div>
      <Spark data={s} color={color} h={110} />
    </Panel>
  )
}

export default function Monitoring() {
  const { apps, server } = useData()
  const top = apps.filter((a) => a.cpu > 0).sort((a, b) => b.cpu - a.cpu).slice(0, 8)
  return (
    <div>
      <Stats items={[
        { icon: Cpu, label: 'CPU do host', value: `${server.cpu.toFixed(1)}%`, sub: `${server.vcpu} vCPU`, tone: 'blue' },
        { icon: MemoryStick, label: 'Memória', value: `${server.ram.toFixed(0)}%`, sub: `${server.ramUsed} de ${server.ramTotal} GB`, tone: 'ok' },
        { icon: HardDrive, label: 'Disco', value: `${server.disk.toFixed(1)}%`, sub: `${server.diskUsed} de ${server.diskTotal} GB`, tone: 'warn' },
        { icon: Network, label: 'Rede', value: server.netMBs.toFixed(2), unit: 'MB/s', sub: 'entrada + saída', tone: 'blue' },
        { icon: Gauge, label: 'Load (1 min)', value: server.load == null ? 'Não medido' : server.load, sub: `${server.vcpu} vCPU`, tone: 'ok' },
      ]} />
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Chart title="CPU" k="cpu" color="#6b8cff" value={`${server.cpu.toFixed(0)}%`} />
        <Chart title="Memória" k="ram" color="#3ddc97" value={`${server.ram.toFixed(0)}%`} />
        <Chart title="Disco" k="disk" color="#f5a524" value={`${server.disk.toFixed(0)}%`} />
        <Chart title="Rede" k="net" color="#2dd4bf" norm value={`${server.netMBs.toFixed(2)} MB/s`} />
      </div>
      <Panel title="Consumo por aplicação" sub="Ordenado por CPU" style={{ marginTop: 20 }}>
        {top.length === 0 && <div style={{ color: 'var(--dimmer)', fontSize: 13 }}>Nenhuma aplicação com consumo no momento.</div>}
        {top.map((a) => (
          <div key={a.name} style={{ display: 'grid', gridTemplateColumns: '240px 1fr 100px', alignItems: 'center', gap: 20, padding: '12px 0', borderTop: '1px solid var(--line2)' }}>
            <span style={{ fontWeight: 600 }}>{a.icon}&nbsp; {a.name}</span><Bar value={a.cpu} track showN={false} color="#6b8cff" />
            <span style={{ textAlign: 'right', color: 'var(--dim)' }}>{a.cpu}% · {a.mem} MB</span>
          </div>
        ))}
      </Panel>
    </div>
  )
}
