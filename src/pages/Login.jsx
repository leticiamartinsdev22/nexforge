import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../auth'
import { APP_NAME, APP_TAG } from '../config'
import Logo from '../components/Logo'

export default function Login() {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const navigate = useNavigate()
  const submit = async (e) => {
    e.preventDefault()
    const r = await login(pw)
    if (r === true) navigate('/')
    else setErr(r === 'network' ? 'Não foi possível falar com a API.' : r === 'limit' ? 'Muitas tentativas. Aguarde 15 minutos.' : 'Senha inválida.')
  }
  return (
    <div className="login">
      <Logo size={520} className="login-wm" />
      <form className="login-card" onSubmit={submit}>
        <div style={{ display: 'grid', placeItems: 'center' }}><Logo size={74} /></div>
        <div style={{ marginTop: 14, fontSize: 22, fontWeight: 800, letterSpacing: '.1em' }}>
          {APP_NAME.slice(0, 3).toUpperCase()}<span style={{ color: 'var(--blue)' }}>{APP_NAME.slice(3).toUpperCase()}</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 9.5, letterSpacing: '.28em', color: 'var(--blue)', fontWeight: 700 }}>{APP_TAG}</div>
        <div style={{ marginTop: 28, fontSize: 18, fontWeight: 700 }}>Painel de infraestrutura</div>
        <div style={{ marginTop: 6, marginBottom: 26, fontSize: 14, color: 'var(--dimmer)' }}>Acesso restrito à infraestrutura</div>
        <input className="login-in" type="password" autoFocus placeholder="Senha" value={pw}
          onChange={(e) => { setPw(e.target.value); setErr('') }} />
        {err && <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--bad)' }}>{err}</div>}
        <button className="login-btn">Entrar</button>
      </form>
    </div>
  )
}
