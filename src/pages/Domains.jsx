import { useState } from 'react'
import { Globe, ShieldCheck, Clock, Trash2, Plus } from 'lucide-react'
import { useData, useQ, has } from '../store-utils'
import { Panel, Stats, Table, Pill, SDot } from '../components/ui'
import RowActions from '../components/RowActions'

const EMPTY_DOMAIN = { domain: '', app: '', provider: '', registryExpires: '' }

export default function Domains() {
  const { domains, addDomain, removeDomain } = useData()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY_DOMAIN)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const q = useQ()
  const rows = domains.filter((domain) => has(q, domain.domain, domain.app, domain.provider))
  const withSsl = domains.filter((domain) => domain.ssl != null)
  const withReg = domains.filter((domain) => domain.days != null)
  const min = withSsl.length ? withSsl.reduce((m, domain) => (domain.ssl < m.ssl ? domain : m)) : null
  const next = withReg.length ? withReg.reduce((m, domain) => (domain.days < m.days ? domain : m)) : null
  const cols = [
    { k: 'domain', h: 'Domínio', r: (domain) => <div className="cell"><SDot s={domain.ssl == null ? 'bad' : 'ok'} /><Globe size={16} color="#6b8cff" /><b className="strong">{domain.domain}</b></div> },
    { k: 'app', h: 'Aplicação', r: (domain) => domain.icon ? <span><span style={{ marginRight: 8 }}>{domain.icon}</span>{domain.app}</span> : <span style={{ color: 'var(--dimmer)' }}>{domain.app}</span> },
    { k: 'provider', h: 'Provedor', r: (domain) => domain.provider || 'Não informado' },
    { k: 'expires', h: 'Expiração do registro', r: (domain) => domain.expires },
    { k: 'days', h: 'Dias', r: (domain) => <b className="strong">{domain.days != null ? `${domain.days}d` : 'Sem data'}</b> },
    { k: 'ssl', h: 'SSL', r: (domain) => domain.ssl == null ? <Pill tone="bad">erro</Pill> : <Pill tone={domain.ssl < 15 ? 'bad' : domain.ssl < 30 ? 'warn' : 'ok'}>● {domain.ssl}d</Pill> },
    { k: 'renewal', h: 'Renovação', r: () => <span style={{ color: 'var(--dimmer)' }}>Não verificada</span> },
    { k: 'status', h: 'Status', r: (domain) => domain.ssl == null ? <Pill tone="bad">● Falha</Pill> : <Pill tone="ok">● Ativo</Pill> },
    { k: 'actions', h: '', r: (domain) => <RowActions label={`Ações de ${domain.domain}`} items={[{
      label: 'Remover do monitoramento', icon: Trash2, danger: true, onSelect: async () => {
        if (!window.confirm(`Remover ${domain.domain} do monitoramento?`)) return
        setBusy(true); const result = await removeDomain(domain.domain); setMessage({ ok: result.ok, text: result.msg }); setBusy(false)
      },
    }]} /> },
  ]

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMessage(null)
    const result = await addDomain(form)
    setMessage({ ok: result.ok, text: result.msg })
    if (result.ok) { setForm(EMPTY_DOMAIN); setAdding(false) }
    setBusy(false)
  }

  return (
    <div>
      <Stats items={[
        { icon: Globe, label: 'Domínios servidos', value: domains.length, sub: `${withReg.length} com expiração de registro`, tone: 'blue' },
        { icon: ShieldCheck, label: 'Certificados SSL', value: withSsl.filter((domain) => domain.ssl > 0).length, unit: `de ${domains.length}`, sub: 'validade consultada por TLS', tone: 'ok' },
        { icon: Clock, label: 'Menor prazo SSL', value: min ? min.ssl : 'N/D', unit: min ? 'd' : '', sub: min?.domain ?? 'Nenhum domínio monitorado', tone: 'blue' },
        { icon: Clock, label: 'Registro mais próximo', value: next ? next.days : 'N/D', unit: next ? 'd' : '', sub: next?.domain ?? 'Informe a validade do registro', tone: 'ok' },
        { icon: ShieldCheck, label: 'Renovação verificada', value: 0, unit: 'certs', sub: 'Não medida pelo agente', tone: 'warn' },
      ]} />
      <Panel title="Domínios e certificados" sub={`${domains.length} domínios monitorados · ${withReg.length} com registro monitorado`}
        action={<button type="button" className="alert-select-toggle" onClick={() => { setAdding((open) => !open); setMessage(null) }}><Plus size={14} /> Adicionar domínio</button>}>
        {rows.length > 0 && <Table cols={cols} rows={rows} />}
        {rows.length === 0 && <div className="empty-state">{domains.length ? 'Nenhum domínio corresponde à busca.' : 'Nenhum domínio configurado. Adicione um para monitorar DNS e validade do certificado TLS.'}</div>}
        {adding && <form className="domain-form" onSubmit={submit}>
          <label><span>Domínio</span><input className="field" required maxLength={253} placeholder="dominio.com.br" value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })} /></label>
          <label><span>Aplicação</span><input className="field" maxLength={80} placeholder="Nome da aplicação (opcional)" value={form.app} onChange={(event) => setForm({ ...form, app: event.target.value })} /></label>
          <label><span>Provedor de registro</span><input className="field" maxLength={80} placeholder="Ex.: Registro.br (opcional)" value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })} /></label>
          <label><span>Expiração do registro</span><input className="field" type="date" value={form.registryExpires} onChange={(event) => setForm({ ...form, registryExpires: event.target.value })} /></label>
          <div className="domain-form-note">Será monitorada a validade TLS em HTTPS. A expiração do registro é opcional e informada por você.</div>
          <div className="domain-form-actions">
            <button className="btn-acc" type="submit" disabled={busy}>{busy ? 'Salvando...' : 'Adicionar e monitorar'}</button>
            <button type="button" className="alert-select-toggle" onClick={() => { setAdding(false); setForm(EMPTY_DOMAIN) }}>Cancelar</button>
          </div>
        </form>}
        {message && <div className={`msg ${message.ok ? 'ok' : 'bad'}`} role="status">{message.text}</div>}
      </Panel>
    </div>
  )
}
