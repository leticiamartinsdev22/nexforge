import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { NAV } from '../nav'
import { APP_NAME, APP_TAG } from '../config'
import { logout } from '../auth'
import Logo from './Logo'

export default function Sidebar() {
  const navigate = useNavigate()
  const first = APP_NAME.slice(0, 3).toUpperCase()
  const rest = APP_NAME.slice(3).toUpperCase()
  return (
    <aside className="sb">
      <div className="sb-logo">
        <Logo size={46} />
        <div>
          <div className="sb-name">{first}<b>{rest}</b></div>
          <div className="sb-tag">{APP_TAG}</div>
        </div>
      </div>
      <nav className="sb-nav">
        {NAV.map((g) => (
          <div key={g.section}>
            <div className="sb-label">{g.section}</div>
            {g.items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `sb-item ${isActive ? 'active' : ''}`}>
                <Icon size={19} strokeWidth={1.7} />{label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sb-foot">
        <span className="live"><span className="sdot" style={{ width: 8, height: 8 }} />Operacional</span>
        <button onClick={() => { logout(); navigate('/login') }}><LogOut size={14} />Sair</button>
      </div>
    </aside>
  )
}
