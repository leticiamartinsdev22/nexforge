import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { isAuth } from './auth'
import { LIVE } from './config'
import { fetchSession } from './api'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Servers from './pages/Servers'
import Apps from './pages/Apps'
import Domains from './pages/Domains'
import Databases from './pages/Databases'
import Backups from './pages/Backups'
import Monitoring from './pages/Monitoring'
import Alerts from './pages/Alerts'
import Logs from './pages/Logs'
import Security from './pages/Security'
import Topology from './pages/Topology'
import Settings from './pages/Settings'
import { ThemeProvider } from './theme'
import { ToastProvider } from './components/ToastProvider'

function Protected({ children }) {
  const [authenticated, setAuthenticated] = useState(() => LIVE ? null : isAuth())
  useEffect(() => {
    if (!LIVE) return undefined
    let active = true
    const controller = new AbortController()
    fetchSession({ signal: controller.signal })
      .then((response) => { if (active) setAuthenticated(response.authenticated === true) })
      .catch(() => { if (active) setAuthenticated(false) })
    return () => { active = false; controller.abort() }
  }, [])
  if (authenticated === null) return <div className="login">Verificando sessão segura…</div>
  return authenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <ToastProvider>
      <ThemeProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/" element={<Overview />} />
            <Route path="/servidores" element={<Servers />} />
            <Route path="/aplicacoes" element={<Apps />} />
            <Route path="/dominios" element={<Domains />} />
            <Route path="/bancos" element={<Databases />} />
            <Route path="/backups" element={<Backups />} />
            <Route path="/monitoramento" element={<Monitoring />} />
            <Route path="/alertas" element={<Alerts />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/seguranca" element={<Security />} />
            <Route path="/topologia" element={<Topology />} />
            <Route path="/configuracoes" element={<Settings />} />
          </Route>
        </Routes>
      </ThemeProvider>
    </ToastProvider>
  )
}
