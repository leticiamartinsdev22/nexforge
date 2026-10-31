import { Outlet, useLocation } from 'react-router-dom'
import FilterChips from './FilterChips'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { DataProvider } from '../store'

const NO_CHIPS = ['/topologia', '/configuracoes']

export default function Layout() {
  const { pathname } = useLocation()
  return (
    <DataProvider>
      <Sidebar />
      <div className="main">
        <Topbar />
        <main className="pg">
          {!NO_CHIPS.includes(pathname) && <FilterChips />}
          <Outlet />
        </main>
      </div>
    </DataProvider>
  )
}
