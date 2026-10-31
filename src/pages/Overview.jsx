import { Link } from 'react-router-dom'
import { ChevronRight, ShieldAlert, ArrowUpRight } from 'lucide-react'
import { useData } from '../store-utils'
import { healthScore } from '../store-utils'
import { Ring, Bar } from '../components/ui'
import { useRefreshAction } from '../components/use-refresh-action'

const initials = (n) => n.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
const ORDER = { bad: 0, ok: 1, off: 2 }
const SC = { ok: 'var(--ok)', bad: 'var(--bad)', off: '#4b5565' }

export default function Overview() {
  const { apps, events, server, meta, refresh } = useData()
  const { run: runRefresh, loading, status } = useRefreshAction({
    refresh,
    pendingText: 'Verificando...',
    successText: 'Atualizado com sucesso',
    errorText: 'Servidor offline',
  })
  const now = meta.updatedAt
  const h = now.getHours()
  const greet = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  const online = apps.filter((a) => a.status === 'ok').length
  const bad = apps.filter((a) => a.status === 'bad')
  const issues = [
    ...bad.map((a) => ({ t: `${a.name} está offline`, d: 'Containers parados · toque para investigar', tone: 'bad', tag: 'APP' })),
    ...(server.pendingReboot ? [{ t: 'Reinício do sistema ainda pendente', d: 'Planeje uma janela: o reboot continua disponível somente via SSH', tone: 'warn', tag: 'HOST' }] : []),
  ]
  const health = healthScore(apps, server)
  const list = [...apps].sort((a, b) => ORDER[a.status] - ORDER[b.status]).slice(0, 5)
  const cells = [
    ['Apps', `${online}/${apps.length}`, `${apps.length - online} precisa de atenção`],
    ['CPU', `${server.cpu.toFixed(1)}%`, `${server.vcpu} vCPU · load ${server.load ?? 'não medido'}`],
    ['RAM', `${server.ram.toFixed(0)}%`, `${server.ramUsed} de ${server.ramTotal} GB`],
    ['Disco', `${server.disk.toFixed(1)}%`, `${server.diskUsed} de ${server.diskTotal} GB`],
  ]
  return (
    <div>
      {apps.length === 0 && (
        <div className="panel" style={{ marginBottom: 22, padding: '16px 22px', color: '#f5a524', fontSize: 13, borderColor: 'rgba(245,165,36,.25)' }}>
          Nenhuma aplicação detectada. {meta.warnings?.[0] ?? 'Verifique o acesso ao Docker no agente.'}
        </div>
      )}
      <div className="overview-heading">
        <div>
          <div className="eyebrow" style={{ fontSize: 10.5 }}>{greet} · Central NexForge</div>
          <h1 className="display">O que está acontecendo agora.</h1>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', paddingBottom: 6 }}>
          {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <div className="hero">
        <Ring value={health} tone={issues.length ? 'bad' : 'ok'} size={300} stroke={14} big={62} />
        <div className="hero-summary">
          <div className="eyebrow" style={{ color: issues.length ? '#ff7a90' : 'var(--ok)', fontSize: 9.5, display: 'flex', alignItems: 'center', gap: 9 }}>
            <span className="glow" style={{ width: 7, height: 7, background: issues.length ? 'var(--bad)' : 'var(--ok)' }} />
            {issues.length ? 'Ação necessária' : 'Tudo certo'}
          </div>
          <div className="hero-h">{issues.length === 1 ? '1 ponto exige sua decisão' : issues.length ? `${issues.length} pontos exigem sua decisão` : 'Nenhum ponto de atenção'}</div>
          <div className="hero-sub">{[bad.length ? `${bad.length} aplicação fora` : 'nenhuma aplicação fora', server.pendingReboot && 'reinício pendente'].filter(Boolean).join(' · ')}</div>
          <div className="hero-btn-wrap">
            <button type="button" className="hero-btn" onClick={runRefresh} disabled={loading}>
              <ShieldAlert size={17} className={loading ? 'spin' : ''} />
              <span>{loading ? 'Verificando...' : 'Verificar agora'}</span>
            </button>
            {status && <div className={`hero-status ${status.tone}`}>{status.text}</div>}
          </div>
        </div>
        <div className="hero-box">
          {cells.map(([l, v, s]) => (
            <div key={l} className="hero-cell"><div className="hero-lab">{l}</div><div className="hero-val">{v}</div><div className="hero-s">{s}</div></div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 44 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
          <div>
            <div className="eyebrow" style={{ fontSize: 9.5, color: 'var(--dimmer)' }}>Agora</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8, letterSpacing: '-.02em' }}>{issues.length} ocorrências</div>
          </div>
          <Link to="/alertas" className="link">Abrir central <ArrowUpRight size={13} /></Link>
        </div>
        {issues.map((i) => (
          <div key={i.t} className="occ">
            <span className="glow" style={{ background: `var(--${i.tone})`, boxShadow: `0 0 10px var(--${i.tone})` }} />
            <div><div className="t">{i.t}</div><div className="d">{i.d}</div></div>
            <span className="tag" style={{ color: `var(--${i.tone})`, borderColor: `color-mix(in srgb, var(--${i.tone}) 40%, transparent)` }}>{i.tag}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40 }}>
        {list.map((a) => (
          <div key={a.name} className="app-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div className="av">{initials(a.name)}<i style={{ background: SC[a.status] }} /></div>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 700 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: 'var(--dimmer)', marginTop: 5 }}>{a.status === 'ok' ? 'Online' : a.status === 'bad' ? 'Offline' : 'Desligado'} · {a.env}</div>
              </div>
            </div>
            <div><div className="mini-l">CPU</div><div style={{ fontSize: 14, fontWeight: 700, margin: '6px 0 8px' }}>{a.cpu}%</div><Bar value={a.cpu} track showN={false} /></div>
            <div><div className="mini-l">Memória</div><div style={{ fontSize: 14, fontWeight: 700, margin: '6px 0 5px' }}>{a.mem} MB</div><div style={{ fontSize: 11, color: 'var(--dimmer)' }}>{a.cont.split('/')[0]}/{a.cont.split('/')[1]} cont.</div></div>
            <ChevronRight size={18} color="#7d8fb5" />
          </div>
        ))}
        <div style={{ textAlign: 'center', padding: '22px 0 6px', borderTop: '1px solid var(--line2)' }}>
          <Link to="/aplicacoes" className="link teal">VER TODAS AS {apps.length} APLICAÇÕES →</Link>
        </div>
      </div>

      <div style={{ marginTop: 44 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
          <div>
            <div className="eyebrow" style={{ fontSize: 9.5, color: 'var(--dimmer)' }}>Rastro</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8, letterSpacing: '-.02em' }}>Últimos eventos</div>
          </div>
          <Link to="/alertas" className="link">Histórico <ArrowUpRight size={13} /></Link>
        </div>
        <div className="tl">
          {events.map((e, i) => (
            <div key={i} className="tl-row">
              <span className="when mono">{e.when}</span>
              <div style={{ flex: 1 }}><div className="t mono">{e.title}</div><div className="d mono">{e.detail}</div></div>
              <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: e.tag === 'OK' ? 'var(--ok)' : 'var(--teal)', letterSpacing: '.1em' }}>{e.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
