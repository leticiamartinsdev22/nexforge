import { useId } from 'react'
import { TONE } from './ui-constants'

export function Pill({ tone = 'muted', children }) { return <span className={`pill ${tone}`}>{children}</span> }
export function SDot({ s = 'ok' }) { return <span className={`sdot ${s === 'ok' ? '' : s}`} /> }

const STATUS = { ok: ['ok', 'Operacional'], off: ['muted', 'Desligado'], bad: ['bad', 'Offline'], warn: ['warn', 'Atenção'] }
export function StatusPill({ s }) { const [t, l] = STATUS[s]; return <Pill tone={t}>● {l}</Pill> }

export function Bar({ value, color, track = false, showN = true }) {
  const c = color || (value > 85 ? TONE.bad : value > 70 ? TONE.warn : TONE.blue)
  return (
    <span className="bar" style={track ? { display: 'flex' } : undefined}>
      <span className={`bar-track ${track ? 'full' : ''}`}><span className="bar-fill" style={{ width: `${Math.min(value, 100)}%`, background: c, display: 'block' }} /></span>
      {showN && <span className="bar-n">{Math.round(value)}%</span>}
    </span>
  )
}

export function Spark({ data, color = '#6b8cff', h = 28, w = '100%' }) {
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${29 - (v / 100) * 27}`).join(' ')
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: w, height: h, display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

export function Stat({ icon: Icon, label, value, unit, sub, tone = 'blue', spark }) {
  return (
    <div className={`st t-${tone}`}>
      <div className="st-head">
        <span className="st-ic">{Icon && <Icon size={18} strokeWidth={1.7} />}</span>
        <span className="st-label">{label}</span>
      </div>
      <div className="st-val">
        {value}{unit && <small>{unit}</small>}
        {spark && <span className="sp"><Spark data={spark} color="#6b8cff" h={30} /></span>}
      </div>
      {sub && <div className="st-sub"><i />{sub}</div>}
    </div>
  )
}

export function Stats({ items }) {
  return (
    <div className="stats" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((s) => <Stat key={s.label} {...s} />)}
    </div>
  )
}

export function Panel({ title, sub, action, className = '', style, children }) {
  return (
    <section className={`panel ${className}`} style={style}>
      {title && (
        <div className="panel-head">
          <div><div className="panel-title">{title}</div>{sub && <div className="panel-sub">{sub}</div>}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Table({ cols, rows }) {
  return (
    <div className="tbl">
      <table>
        <thead><tr>{cols.map((c) => <th key={c.k} style={c.w ? { width: c.w } : undefined}>{c.h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map((c) => <td key={c.k} data-label={typeof c.h === 'string' ? c.h : ''}>{c.r ? c.r(r) : r[c.k]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Toggle({ on, onChange }) {
  return <button type="button" className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} />
}

export function Ring({ value, size = 240, stroke = 12, tone = 'bad', label = 'SAÚDE', suffix = '/100', big = 56, unit = '' }) {
  const id = useId().replace(/:/g, '')
  const r = size / 2 - stroke
  const c = 2 * Math.PI * r
  const [c1, c2] = tone === 'ok' ? ['#7af0bd', '#2fbf84'] : tone === 'warn' ? ['#ffd27a', '#f5a524'] : ['#ff8fa0', '#ff4d6d']
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 0 14px ${c2}55)` }}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r - stroke * 0.9} fill="#05060c" stroke="rgba(255,255,255,.05)" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center' }}>
        {label && <div className="mono" style={{ fontSize: 9.5, letterSpacing: '.2em', color: 'var(--muted)' }}>{label}</div>}
        <div style={{ fontSize: big, fontWeight: 800, letterSpacing: '-.05em', lineHeight: 1.05 }}>{value}{unit}</div>
        {suffix && <div className="mono" style={{ fontSize: 9.5, color: 'var(--dimmer)', letterSpacing: '.08em' }}>{suffix}</div>}
      </div>
    </div>
  )
}

export function Donut({ segments, size = 120, stroke = 12, center, sub }) {
  const r = size / 2 - stroke / 2
  const c = 2 * Math.PI * r
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c
          const off = segments.slice(0, i).reduce((sum, prev) => sum + (prev.value / total) * c, 0)
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
            strokeDasharray={`${Math.max(len - 3, 0)} ${c}`} strokeDashoffset={-off} strokeLinecap="round" />
          return el
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: size > 110 ? 30 : 24, fontWeight: 800, letterSpacing: '-.03em' }}>{center}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{sub}</div>}
      </div>
    </div>
  )
}
