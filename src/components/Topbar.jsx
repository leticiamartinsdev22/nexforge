import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Bell, RefreshCw, Sun, Moon, Monitor, LogOut, Check } from 'lucide-react'
import { NAV } from '../nav'
import { useData } from '../store-utils'
import { logout } from '../auth'
import { useTheme } from '../theme-context'
import { useRefreshAction } from './use-refresh-action'

const ITEMS = NAV.flatMap((g) => g.items)
const SEARCHABLE = ['/aplicacoes', '/dominios', '/bancos']

export default function Topbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const [params, setParams] = useSearchParams()
  const { meta, refresh, allAlerts, readAlertIds, markAlertsRead } = useData()
  const [open, setOpen] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedAlerts, setSelectedAlerts] = useState(() => new Set())
  const bellRef = useRef(null)
  const accountRef = useRef(null)
  const [accountOpen, setAccountOpen] = useState(false)

  useEffect(() => {
    const closeOutside = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setOpen(false)
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false)
    }
    const closeOnEscape = (e) => {
      if (e.key === 'Escape') { setOpen(false); setAccountOpen(false) }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const cur = ITEMS.find((i) => i.to === pathname)
  const title = pathname === '/' ? 'Visão Geral da Infraestrutura' : cur?.label ?? 'Página'
  const bad = meta.mode === 'error'
  const q = SEARCHABLE.includes(pathname) ? params.get('q') ?? '' : ''
  const pendingAlerts = allAlerts.filter((a) => !readAlertIds.has(a.id))
  const unreadCount = pendingAlerts.length
  const visibleAlerts = pendingAlerts.slice(0, 5)
  const onSearch = (v) => {
    if (SEARCHABLE.includes(pathname)) setParams(v ? { q: v } : {}, { replace: true })
    else if (v) navigate(`/aplicacoes?q=${encodeURIComponent(v)}`)
  }
  const { run: runRefresh, loading: refreshLoading } = useRefreshAction({
    refresh,
    pendingText: 'Verificando...',
    successText: 'Atualizado com sucesso',
    errorText: 'Servidor offline',
  })
  const doRefresh = async (event) => {
    await runRefresh(event)
  }
  const signOut = () => {
    setAccountOpen(false)
    logout()
    navigate('/login', { replace: true })
  }
  const toggleSelectedAlert = (id) => setSelectedAlerts((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const selectAllAlerts = () => {
    setSelectMode(true)
    setSelectedAlerts(new Set(pendingAlerts.map((alert) => alert.id)))
  }
  const markSelectedRead = () => {
    markAlertsRead(selectedAlerts)
    setSelectedAlerts(new Set())
    setSelectMode(false)
  }
  const themes = [
    ['system', 'Automático', Monitor],
    ['light', 'Claro', Sun],
    ['dark', 'Escuro', Moon],
  ]

  return (
    <header className="tb">
      <div>
        <div className="tb-eyebrow">Central de operações</div>
        <div className="tb-title">{title}</div>
      </div>
      <div className="tb-right">
        <label className="search">
          <Search size={16} />
          <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar servidores, aplicações..." />
        </label>
        <div className="upd" title={meta.warnings?.join(' | ')}>
          <i style={bad ? { background: 'var(--bad)', borderColor: 'rgba(255,84,112,.35)', boxShadow: '0 0 8px rgba(255,84,112,.6)' } : undefined} />
          {bad ? 'Sem conexão com a API' : `Atualizado ${meta.updatedAt.toLocaleTimeString('pt-BR')}`}
        </div>
        <button type="button" className="icon-btn" onClick={doRefresh} disabled={refreshLoading} title="Atualizar agora" aria-label="Atualizar agora">
          <RefreshCw size={17} strokeWidth={1.7} style={refreshLoading ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
        <div className="bell-wrap" ref={bellRef}>
          <button className="icon-btn" onClick={() => { setOpen(!open); setAccountOpen(false) }} title="Alertas" aria-label="Alertas" aria-expanded={open}>
            <Bell size={19} strokeWidth={1.7} />
            {unreadCount > 0 && <span className="badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
          {open && (
            <div className="pop">
              <div className="pop-h"><span>Alertas recentes</span>{selectMode ? <button className="alert-select-toggle" onClick={() => { setSelectMode(false); setSelectedAlerts(new Set()) }}>Cancelar</button> : <button className="alert-select-toggle" onClick={selectAllAlerts}>Selecionar todos</button>}</div>
              {pendingAlerts.length === 0 && <div className="pop-i" style={{ color: 'var(--dimmer)' }}>Nenhum aviso não lido.</div>}
              {visibleAlerts.map((a) => (
                <div key={a.id} className={`pop-i alert-item${readAlertIds.has(a.id) ? ' is-read' : ''}`}>
                  {selectMode && <input className="alert-checkbox" type="checkbox" aria-label={`Selecionar alerta: ${a.msg}`} checked={selectedAlerts.has(a.id)} onChange={() => toggleSelectedAlert(a.id)} />}
                  <span className="glow" style={{ marginTop: 5, background: a.level === 'bad' ? 'var(--bad)' : 'var(--ok)' }} />
                  <div className="alert-copy"><div className="alert-message" style={{ fontWeight: 600 }}>{a.msg}</div><div className="d">{a.when} · {a.source}</div></div>
                  {readAlertIds.has(a.id) && <span className="alert-read-label">Lido</span>}
                </div>
              ))}
              {selectMode && <div className="alert-actions"><button className="alert-mark-read" disabled={!selectedAlerts.size} onClick={markSelectedRead}>Marcar como lido{selectedAlerts.size ? ` (${selectedAlerts.size})` : ''}</button></div>}
              <Link to="/alertas" className="pop-f" onClick={() => setOpen(false)}>Ver histórico de alertas</Link>
            </div>
          )}
        </div>
        <div className="account-wrap" ref={accountRef}>
          <button className="avatar" onClick={() => { setAccountOpen(!accountOpen); setOpen(false) }} title="Conta e aparência"
            aria-label="AD: abrir menu da conta" aria-haspopup="menu" aria-expanded={accountOpen}>AD</button>
          {accountOpen && (
            <div className="account-pop" role="menu" aria-label="Menu da conta">
              <div className="account-heading"><span className="account-avatar">AD</span><span><b>Administrador</b><small>Painel NexForge</small></span></div>
              <div className="account-divider" />
              <div className="account-section">Aparência</div>
              {themes.map(([id, label, Icon]) => (
                <button key={id} role="menuitemradio" aria-checked={theme === id} className="account-option" onClick={() => setTheme(id)}>
                  <Icon size={16} /><span>{label}</span>{theme === id && <Check size={15} className="account-check" />}
                </button>
              ))}
              <div className="account-divider" />
              <button role="menuitem" className="account-option account-logout" onClick={signOut}><LogOut size={16} /><span>Sair</span></button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
