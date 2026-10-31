import { useEffect, useId, useRef, useState } from 'react'
import { Share2, Workflow, Network, Orbit, LayoutDashboard, Activity, ShieldCheck, Boxes, Cpu, MemoryStick, BarChart3, Info, Maximize2, Minimize2, Clock, Pause, Play } from 'lucide-react'
import { useData, useHistory, healthScore } from '../store-utils'
import { Ring, Spark, StatusPill, Bar } from '../components/ui'

const MODES = [
  ['flow', 'Fluxo', 'Mostra o fluxo de recursos e o tráfego em tempo real', Share2],
  ['deps', 'Dependências', 'Exibe dependências entre serviços e componentes', Workflow],
  ['radial', 'Radial', 'Organiza nós em camadas a partir do servidor central', Orbit],
  ['map', 'Mapa de Serviços', 'Visão ampla e organizada de toda a infraestrutura', LayoutDashboard],
  ['ops', 'Operacional', 'Visão técnica densa com métricas e eventos', Activity],
]
const PAL = ['#22d3ee', '#3ddc97', '#a3e635', '#f5a524', '#ff7a59', '#ff5470', '#e879f9', '#8b5cf6', '#6b8cff']
const W = 1400, H = 760
const bez = (x1, y1, x2, y2) => `M${x1} ${y1}C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`
const poly = (s, x, y, w, h) => s.map((v, i) => `${x + (i / (s.length - 1)) * w},${y + h - (v / 100) * h}`).join(' ')

function useSvgPan(width, height) {
  const initial = { x: 0, y: 0, width, height }
  const [view, setView] = useState(initial)
  const [dragging, setDragging] = useState(false)
  const viewRef = useRef(view)
  const dragRef = useRef(null)
  const update = (next) => { viewRef.current = next; setView(next) }
  const onPointerDown = (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, view: viewRef.current }
    setDragging(true)
  }
  const onPointerMove = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const rect = event.currentTarget.getBoundingClientRect()
    update({ ...drag.view, x: drag.view.x - ((event.clientX - drag.x) * drag.view.width) / rect.width,
      y: drag.view.y - ((event.clientY - drag.y) * drag.view.height) / rect.height })
  }
  const onPointerUp = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const onWheel = (event) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const current = viewRef.current
    const px = current.x + ((event.clientX - rect.left) / rect.width) * current.width
    const py = current.y + ((event.clientY - rect.top) / rect.height) * current.height
    const factor = event.deltaY < 0 ? 0.9 : 1.1
    const nextWidth = Math.max(width * 0.35, Math.min(width * 3, current.width * factor))
    const nextHeight = nextWidth * (height / width)
    const ratio = nextWidth / current.width
    update({ x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio, width: nextWidth, height: nextHeight })
  }
  const reset = () => { dragRef.current = null; setDragging(false); update(initial) }
  return { viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`, dragging,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onWheel, onDoubleClick: reset } }
}

function AnimatedEdge({ id, d, color, active, delay = 0, showTraffic = true, width = 1.4 }) {
  const animated = active && showTraffic
  return (
    <g className={animated ? 'topology-edge topology-edge-active' : 'topology-edge'}>
      <path id={id} d={d} stroke={color} strokeWidth={width} fill="none" opacity={active ? 0.82 : 0.42}
        strokeDasharray={animated ? '7 10' : undefined} />
      {animated && <g className="topology-particle">
        <circle r="7" fill={color} opacity=".22" />
        <circle r="4.5" fill={color} stroke="#e8f8ff" strokeWidth="1" />
        <animateMotion dur={`${4.5 + (delay % 4) * 0.6}s`} begin={`${delay * 0.35}s`} repeatCount="indefinite" path={d} />
      </g>}
    </g>
  )
}

function FlowGraph({ cpu, ram, disk, net, showTraffic }) {
  const { apps, domains, server } = useData()
  const idPrefix = useId().replaceAll(':', '')
  const pan = useSvgPan(W, H)
  const dy = (i) => 28 + i * ((H - 70) / Math.max(domains.length - 1, 1))
  const ay = (i) => 26 + i * ((H - 60) / Math.max(apps.length - 1, 1))
  const hx = 520, hy = 250, hw = 360, hh = 260, cy = hy + hh / 2
  const rows = [['CPU', cpu, '#6b8cff', `${Math.round(server.cpu)}%`], ['RAM', ram, '#3ddc97', `${server.ramUsed} GB`], ['Disco', disk, '#f5a524', `${server.disk.toFixed(1)}% (${server.diskUsed}/${server.diskTotal} GB)`], ['Rede', net, '#3ddc97', `${server.netMBs.toFixed(2)} MB/s`]]
  return (
    <svg {...pan.handlers} className={`topology-pan-surface${pan.dragging ? ' is-dragging' : ''}`} viewBox={pan.viewBox} style={{ width: '100%', display: 'block', userSelect: 'none', touchAction: 'none' }} aria-label="Mapa de topologia. Arraste para mover, role para aproximar e clique duas vezes para recentralizar.">
      <defs><filter id={`${idPrefix}-gl`}><feGaussianBlur stdDeviation="3" /></filter></defs>
      {domains.map((d, i) => <path key={d.domain} d={bez(330, dy(i) + 20, hx, cy)} stroke="#5b9dff" strokeWidth="5" fill="none" opacity=".12" filter={`url(#${idPrefix}-gl)`} />)}
      {domains.map((d, i) => <AnimatedEdge key={d.domain + 'l'} id={`${idPrefix}-domain-${i}`} d={bez(330, dy(i) + 20, hx, cy)} color="#6bb8ff" active={d.ssl == null || d.ssl > 0} delay={i} showTraffic={showTraffic} />)}
      {apps.map((a, i) => {
        const on = a.status === 'ok'; const c = PAL[i % PAL.length]
        return <g key={a.name}>
          {on && <path d={bez(hx + hw, cy, 1060, ay(i) + 14)} stroke={c} strokeWidth="5" fill="none" opacity=".12" filter={`url(#${idPrefix}-gl)`} />}
          <AnimatedEdge id={`${idPrefix}-app-${i}`} d={bez(hx + hw, cy, 1060, ay(i) + 14)} color={on ? c : '#3a4a6b'} active={on} delay={i + domains.length} showTraffic={showTraffic} />
        </g>
      })}

      {domains.map((d, i) => (
        <g key={d.domain} className="topology-node" transform={`translate(40 ${dy(i)})`} tabIndex="0" role="img" aria-label={`Domínio ${d.domain}, SSL ${d.ssl ?? 'não informado'} dias`}>
          <title>{`${d.domain} · SSL ${d.ssl != null ? `${d.ssl} dias` : 'não informado'}`}</title>
          <rect width="290" height="40" rx="10" fill="#0b1a38" stroke="rgba(107,184,255,.35)" />
          <circle cx="24" cy="20" r="9" fill="#3b82f6" /><circle cx="24" cy="20" r="9" fill="none" stroke="#7dd3fc" strokeWidth="1" />
          <text x="44" y="18" fill="#fff" fontSize="13" fontWeight="700">{d.domain}</text>
          <text x="44" y="32" fill="#7d8fb5" fontSize="9" fontFamily="JetBrains Mono Variable, monospace">SSL {d.ssl != null ? `${d.ssl}d` : 'n/d'} · reg {d.days ? `${d.days}d` : 'n/d'}</text>
          <circle cx="274" cy="20" r="4" fill="#3ddc97" />
        </g>
      ))}

      <g transform={`translate(${hx} ${hy})`} className="topology-node topology-host" tabIndex="0" role="img" aria-label={`Servidor ${server.name}, status saudável`}>
        <title>{`${server.name} · ${server.ip} · ${server.os}`}</title>
        <rect width={hw} height={hh} rx="12" fill="#0b1c3c" stroke="rgba(107,140,255,.55)" />
        <rect width="5" height={hh} rx="2.5" fill="#3ddc97" />
        <rect x="24" y="24" width="52" height="52" rx="12" fill="#101f45" stroke="rgba(143,166,255,.4)" />
        <rect x="38" y="38" width="24" height="18" rx="3" fill="#6bb8ff" />
        <text x="92" y="44" fill="#fff" fontSize="22" fontWeight="800">{server.name}</text>
        <circle cx="98" cy="60" r="5" fill="#3ddc97" /><text x="110" y="64" fill="#3ddc97" fontSize="12" fontWeight="700">Saudável</text>
        <text x="24" y="98" fill="#7d8fb5" fontSize="9.5" fontFamily="JetBrains Mono Variable, monospace">{server.id} · {server.ip} · {server.os}</text>
        <line x1="20" x2={hw - 20} y1="110" y2="110" stroke="rgba(255,255,255,.07)" />
        {rows.map(([l, s, c, v], i) => (
          <g key={l} transform={`translate(24 ${132 + i * 26})`}>
            <text y="4" fill="#aab2c4" fontSize="12">{l}</text>
            <polyline points={poly(s, 60, -9, 90, 18)} fill="none" stroke={c} strokeWidth="1.6" />
            <text x={hw - 48} y="4" fill="#fff" fontSize="12" fontWeight="700" textAnchor="end">{v}</text>
          </g>
        ))}
        <line x1="20" x2={hw - 20} y1={hh - 40} y2={hh - 40} stroke="rgba(255,255,255,.07)" />
        <text x="24" y={hh - 16} fill="#aab2c4" fontSize="12">Uptime</text>
        <text x={hw - 24} y={hh - 16} fill="#fff" fontSize="12" fontWeight="700" textAnchor="end">{server.uptimeFull}</text>
      </g>

      {apps.map((a, i) => {
        const c = PAL[i % PAL.length]; const on = a.status === 'ok'
        return <g key={a.name} className="topology-node" transform={`translate(1060 ${ay(i)})`} opacity={on ? 1 : 0.65} tabIndex="0" role="img" aria-label={`${a.name}, ${on ? 'online' : a.status}`}>
          <title>{`${a.name} · ${a.env} · ${a.cont} containers · CPU ${a.cpu}%`}</title>
          <rect width="320" height="28" rx="4" fill="rgba(8,18,40,.95)" stroke="rgba(107,140,255,.22)" />
          <rect width="3" height="28" fill={on ? c : '#4b5565'} />
          <text x="16" y="19" fontSize="12">{a.icon}</text>
          <text x="38" y="18.5" fill="#e9edf6" fontSize="12" fontWeight="700">{a.name}</text>
          <circle cx="302" cy="14" r="3.5" fill={a.status === 'ok' ? '#3ddc97' : a.status === 'bad' ? '#ff5470' : '#4b5565'} />
        </g>
      })}
    </svg>
  )
}

function DepsRadial({ mode, showTraffic }) {
  const { apps, domains, server } = useData()
  const idPrefix = useId().replaceAll(':', '')
  const W2 = 1000, H2 = 640, n = apps.length
  const pan = useSvgPan(W2, H2)
  const sp = (i, k) => 30 + (i * (H2 - 60)) / Math.max(k - 1, 1)
  const host = mode === 'radial' ? { x: W2 / 2, y: H2 / 2 } : { x: 880, y: H2 / 2 }
  let nodes, edges
  if (mode === 'radial') {
    nodes = apps.map((a, i) => { const t = (i / n) * Math.PI * 2 - Math.PI / 2; return { ...a, x: W2 / 2 + Math.cos(t) * 330, y: H2 / 2 + Math.sin(t) * 250, t } })
    edges = nodes.map((x) => [host, x])
  } else {
    const ds = domains.map((d, i) => ({ id: d.domain, name: d.domain, status: 'ok', x: 250, y: sp(i, domains.length), left: true }))
    nodes = [...ds, ...apps.map((a, i) => ({ ...a, id: a.name, x: 560, y: sp(i, n) }))]
    edges = [...domains.flatMap((d) => { const f = ds.find((x) => x.id === d.domain), t = nodes.find((x) => x.id === d.app); return t ? [[f, t]] : [] }),
      ...nodes.filter((x) => !x.left).map((x) => [x, host])]
  }
  const col = (s) => (s === 'ok' ? '#3ddc97' : s === 'bad' ? '#ff5470' : '#4b5565')
  return (
    <svg {...pan.handlers} className={`topology-pan-surface${pan.dragging ? ' is-dragging' : ''}`} viewBox={pan.viewBox} style={{ width: '100%', display: 'block', userSelect: 'none', touchAction: 'none' }} aria-label="Mapa de dependências. Arraste para mover, role para aproximar e clique duas vezes para recentralizar.">
      {edges.map(([a, b], i) => <AnimatedEdge key={i} id={`${idPrefix}-edge-${i}`} d={mode === 'radial' ? `M${a.x} ${a.y}L${b.x} ${b.y}` : bez(a.x, a.y, b.x, b.y)}
        color={b.status === 'bad' || a.status === 'bad' ? '#ff5470' : '#6b8cff'} active={b.status !== 'off' && a.status !== 'off'} delay={i} showTraffic={showTraffic} width={1.2} />)}
      {nodes.map((n2) => {
        const anchor = mode === 'radial' ? (Math.cos(n2.t) >= 0 ? 'start' : 'end') : n2.left ? 'end' : 'start'
        return <g key={n2.id || n2.name} className="topology-node" tabIndex="0" role="img" aria-label={`${n2.name}, ${n2.status}`}><title>{`${n2.name} · ${n2.status}`}</title><circle className="topology-node-pulse" cx={n2.x} cy={n2.y} r="8" fill={col(n2.status)} /> <circle cx={n2.x} cy={n2.y} r="5" fill={col(n2.status)} />
          <text x={n2.x + (anchor === 'start' ? 11 : -11)} y={n2.y + 4} textAnchor={anchor} fill="#cbd5e1" fontSize="12">{n2.name}</text></g>
      })}
      <g transform={`translate(${host.x - 70} ${host.y - 24})`} className="topology-node topology-host"><title>{`${server.name} · ${server.ip}`}</title><rect width="140" height="48" rx="10" fill="#0b1c3c" stroke="#3ddc97" /><text x="70" y="29" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700">{server.name}</text></g>
    </svg>
  )
}

function MapView() {
  const { apps } = useData()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, padding: 22 }}>
      {apps.map((a) => (
        <div key={a.name} className="mc topology-node" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{a.icon} {a.name}</span><StatusPill s={a.status} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--subtle)', margin: '8px 0 12px' }}>{a.env} · {a.cont} cont.</div>
          <Bar value={a.cpu} track showN={false} color="#6b8cff" />
        </div>
      ))}
    </div>
  )
}

export default function Topology() {
  const { apps, server, filters, setFilters, meta } = useData()
  const [mode, setMode] = useState('flow')
  const [showTraffic, setShowTraffic] = useState(true)
  const [fullScreen, setFullScreen] = useState(false)
  const topologyRef = useRef(null)
  const cpu = useHistory('cpu', server.cpu, 30, 14), ram = useHistory('ram', server.ram, 30, 1), disk = useHistory('disk', server.disk, 30, 0.4), net = useHistory('net', 6, 30, 7, true)
  const online = apps.filter((a) => a.status === 'ok').length
  const pct = apps.length ? Math.round((online / apps.length) * 100) : 0
  const tiles = [[ShieldCheck, 'Status geral', healthScore(apps, server), '/100'], [Boxes, 'Serviços', online, ` de ${apps.length} online`], [Cpu, 'CPU do host', server.cpu.toFixed(1), '%'], [MemoryStick, 'RAM', server.ram.toFixed(1), '%'], [Network, 'Rede', server.netMBs.toFixed(2), ' MB/s']]
  const side = [['CPU', cpu, '#6b8cff', `${Math.round(server.cpu)}%`], ['RAM', ram, '#6b8cff', `${server.ram.toFixed(1)}%`], ['Disco', disk, '#f5a524', `${server.disk.toFixed(1)}%`], ['Rede', net, '#3ddc97', `${server.netMBs.toFixed(2)} MB/s`]]
  useEffect(() => {
    const update = () => setFullScreen(document.fullscreenElement === topologyRef.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await topologyRef.current?.requestFullscreen()
    } catch { setFullScreen(false) }
  }
  return (
    <div ref={topologyRef} className={`topology-root${fullScreen ? ' topology-fullscreen' : ''}`}>
      <div className="tp-head">
        <span className="tp-ic"><Share2 size={20} /></span>
        <div><div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>Topologia</div><div style={{ fontSize: 12.5, color: 'var(--subtle)', marginTop: 3 }}>Visualização em tempo real da infraestrutura</div></div>
        <div className="seg">{MODES.map(([id, l]) => <button key={id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)}>{l}</button>)}</div>
        <button className={`icon-btn topology-control topology-animation-toggle ${showTraffic ? 'selected' : ''}`} aria-pressed={showTraffic}
          title={showTraffic ? 'Ocultar animação do fluxo' : 'Mostrar animação do fluxo'}
          aria-label={showTraffic ? 'Ocultar animação do fluxo' : 'Mostrar animação do fluxo'} onClick={() => setShowTraffic((value) => !value)}>
          {showTraffic ? <Pause size={16} /> : <Play size={16} />}<span>{showTraffic ? 'Pausar fluxo' : 'Animar fluxo'}</span>
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          <span className="chip topology-live"><span className={`sdot ${meta.mode === 'error' ? 'bad' : ''}`} style={{ width: 8, height: 8 }} />{meta.mode === 'error' ? 'Sem conexão' : 'Atualização automática'}</span>
          <label className="chip topology-period"><Clock size={15} /><select aria-label="Período do histórico" value={filters.window} onChange={(e) => setFilters((value) => ({ ...value, window: e.target.value }))}>
            <option value="1h">Última hora</option><option value="24h">Últimas 24 horas</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option>
          </select></label>
          <button className="icon-btn topology-control topology-fullscreen-toggle" onClick={toggleFullscreen} title={fullScreen ? 'Sair da tela cheia' : 'Abrir topologia em tela cheia'} aria-label={fullScreen ? 'Sair da tela cheia' : 'Abrir topologia em tela cheia'}>
            {fullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span>{fullScreen ? 'Sair da tela cheia' : 'Tela cheia'}</span>
          </button>
        </div>
      </div>

      <div className="grid topology-modes" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 16 }}>
        {MODES.map(([id, l, d, Ic]) => (
          <button key={id} className={`mc ${mode === id ? 'on' : ''}`} onClick={() => setMode(id)}>
            <div className="ico"><Ic size={18} /></div><div className="t">{l}</div><div className="d">{d}</div>
          </button>
        ))}
      </div>
      <div className="grid topology-stats" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 22 }}>
        {tiles.map(([Ic, l, v, u]) => (
          <div key={l} className="tt"><span className="ico"><Ic size={17} /></span><div><div className="l">{l}</div><div className="v">{v}<small>{u}</small></div></div></div>
        ))}
      </div>

      <div className="topology-stage">
      <div className="grid topology-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr) 360px', alignItems: 'start' }}>
        <div className="canvas topology-canvas">
          {mode !== 'map' && <span className="topology-pan-hint">Arraste para mover · roda para zoom · duplo clique para recentralizar</span>}
          {mode === 'map' ? <MapView /> : mode === 'deps' || mode === 'radial' ? <DepsRadial mode={mode} showTraffic={showTraffic} /> : <FlowGraph cpu={cpu} ram={ram} disk={disk} net={net} showTraffic={showTraffic} />}
        </div>
        <div className="stack">
          <div className="sidep">
            <h3><BarChart3 size={16} />Visão Geral</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <Ring value={pct} size={86} stroke={9} label="" suffix="" big={20} unit="%" tone={pct >= 85 ? 'ok' : 'bad'} />
              <div><div style={{ fontSize: 12, color: 'var(--subtle)' }}>Status da infraestrutura</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: !apps.length ? '#6b7488' : pct >= 85 ? 'var(--ok)' : 'var(--bad)', margin: '3px 0' }}>{!apps.length ? 'Sem dados' : pct >= 85 ? 'Saudável' : 'Crítico'}</div>
                <div style={{ fontSize: 12, color: 'var(--subtle)' }}>{online} de {apps.length} serviços online</div></div>
            </div>
          </div>
          <div className="sidep">
            <h3><Cpu size={16} />Recursos do Servidor</h3>
            {side.map(([l, s, c, v]) => (
              <div key={l} className="mrow"><span style={{ width: 44 }}>{l}</span><span className="sp"><Spark data={s} color={c} h={22} /></span><b>{v}</b></div>
            ))}
          </div>
          <div className="sidep">
            <h3><Info size={16} />Informações</h3>
            {[['Uptime', server.uptimeFull], ['Hostname', server.id], ['SO', server.os], ['IP do host', server.ip], ['Localização', server.region], ['Provedor', server.provider]].map(([k, v]) => (
              <div key={k} className="irow"><span>{k}</span><b style={{ textAlign: 'right' }}>{v}</b></div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
