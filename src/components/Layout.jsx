import { Outlet, useLocation } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import FilterChips from './FilterChips'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { DataProvider } from '../store'
import { useData } from '../store-utils'

const NO_CHIPS = ['/topologia', '/configuracoes']

function LayoutFrame() {
  const { pathname } = useLocation()
  const { meta, refresh } = useData()
  const waiting = meta.mode !== 'live'
  return (
    <>
      <Sidebar />
      <div className="main">
        <Topbar />
        <main className="pg">
          {waiting ? (
            <section className="panel" role={meta.mode === 'error' ? 'alert' : 'status'} aria-live="polite">
              <div className="panel-title">{meta.mode === 'error' ? 'Servidor offline' : 'Conectando ao agente…'}</div>
              <div className="panel-sub" style={{ marginTop: 8 }}>{meta.error || 'Aguardando dados reais do agente NexForge.'}</div>
              {meta.mode === 'error' && <button type="button" className="hero-btn" style={{ marginTop: 18 }} onClick={() => { void refresh() }}><RefreshCw size={16} aria-hidden="true" /> Tentar novamente</button>}
            </section>
          ) : <>
            {!NO_CHIPS.includes(pathname) && <FilterChips />}
            <Outlet />
          </>}
        </main>
      </div>
    </>
  )
}

export default function Layout() {
  return <DataProvider><LayoutFrame /></DataProvider>
}
