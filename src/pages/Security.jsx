import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Clock, TriangleAlert, Globe, Check, RefreshCw, Download } from 'lucide-react'
import { useData } from '../store-utils'
import { Panel, Stats, Pill } from '../components/ui'
import { useRefreshAction } from '../components/use-refresh-action'

export default function Security() {
  const { domains, hardening, security: sec, runHostUpdate, refreshHostUpdates } = useData()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const { run: runCheckRefresh, loading: checking } = useRefreshAction({
    refresh: useCallback(async () => {
      const result = await runHostUpdate('check')
      if (!result.ok) throw new Error(result.msg || 'Servidor offline')
      return true
    }, [runHostUpdate]),
    pendingText: 'Verificando...',
    successText: 'Atualizado com sucesso',
    errorText: 'Servidor offline',
  })
  const ssl = domains.filter((domain) => domain.ssl != null)
  const min = ssl.length ? Math.min(...ssl.map((domain) => domain.ssl)) : null
  const updating = ['queued', 'running'].includes(sec.updateAction?.status)
  const canUpgrade = sec.updateAction?.status === 'done' && sec.updateAction?.action === 'check' && sec.packages > 0

  useEffect(() => {
    if (!updating) return undefined
    void refreshHostUpdates()
    const timer = window.setInterval(() => { void refreshHostUpdates() }, 4000)
    return () => window.clearInterval(timer)
  }, [updating, refreshHostUpdates])

  const requestAction = async (action) => {
    if (action === 'upgrade' && !window.confirm('Instalar atualizações do Ubuntu agora? O NexForge executa apenas apt-get upgrade -y, sem remover pacotes. Alguns serviços podem reiniciar durante a atualização.')) return
    setBusy(true); setMessage(null)
    const result = await runHostUpdate(action)
    setMessage({ ok: result.ok, text: result.msg })
    setBusy(false)
  }

  const updateLabel = sec.updateAction?.status === 'running' ? 'Executando no Ubuntu WSL…'
    : sec.updateAction?.status === 'queued' ? 'Aguardando o agente Ubuntu WSL…'
      : sec.updateAction?.status === 'failed' ? sec.updateAction.message ?? 'A última ação falhou.'
        : sec.updateAction?.message ?? (sec.updatesSupported ? 'Ainda não verificado' : 'Executor do Ubuntu WSL não configurado')

  return (
    <div>
      <Stats items={[
        { icon: ShieldCheck, label: 'Certificados verificados', value: ssl.filter((domain) => domain.ssl > 0).length, unit: `de ${domains.length}`, sub: 'Validade consultada por TLS', tone: ssl.length === domains.length ? 'ok' : 'warn' },
        { icon: Clock, label: 'Menor prazo SSL', value: min ?? 'N/D', unit: min != null ? 'd' : '', sub: 'Nenhum certificado monitorado', tone: 'blue' },
        { icon: TriangleAlert, label: 'Pacotes pendentes', value: sec.packages ?? 'Não verificado', sub: updating ? 'verificando no Ubuntu WSL' : sec.packages == null ? 'ainda não verificado' : sec.rebootPending ? 'reboot pendente' : 'Ubuntu WSL', tone: sec.packages == null ? 'warn' : sec.packages ? 'warn' : 'ok' },
        { icon: ShieldCheck, label: 'Checks de segurança', value: sec.checksOk, unit: `de ${sec.checksTotal}`, sub: domains.length ? 'Docker, disco, RAM e certificados' : 'Docker, disco e RAM; sem domínios configurados', tone: sec.checksOk === sec.checksTotal ? 'ok' : 'warn' },
        { icon: Globe, label: 'Listeners wildcard', value: sec.publicPorts, sub: 'bind em 0.0.0.0 ou ::; firewall não verificado', tone: 'warn' },
      ]} />
      <div className="grid" style={{ gridTemplateColumns: '1.55fr 1fr', alignItems: 'start' }}>
        <Panel title="Hardening declarado" sub="itens informados manualmente no config.json; não verificados pelo agente">
          {hardening.length === 0 && <div style={{ color: 'var(--dimmer)', fontSize: 13 }}>Nada configurado. Defina "hardening" no config.json do agente.</div>}
          {hardening.map(([title, detail]) => (
            <div key={title} className="check"><span className="ic"><Check size={19} /></span><div><div className="t">{title}</div><div className="d">{detail}</div></div></div>
          ))}
        </Panel>
        <Panel title="Atualizações do Ubuntu">
          <div className="kv"><span>Pacotes atualizáveis</span><b>{sec.packages ?? 'Não verificado'}</b></div>
          <div className="kv"><span>Reboot pendente</span><Pill tone={sec.rebootPending ? 'warn' : 'ok'}>{sec.rebootPending ? 'Sim' : 'Não'}</Pill></div>
          <div className="kv"><span>Último boot do Ubuntu</span><b>{sec.lastBoot}</b></div>
          <div className="update-status" role="status">{updateLabel}</div>
          <div className="update-actions">
            <button className="btn-acc" type="button" disabled={busy || updating || !sec.updatesSupported || checking} onClick={() => { void runCheckRefresh() }}>
              <RefreshCw size={15} className={checking ? 'spin' : ''} /> {checking ? 'Verificando...' : busy ? 'Enviando…' : 'Verificar atualizações'}
            </button>
            <button className="btn-acc update-install" type="button" disabled={busy || updating || !sec.updatesSupported || !canUpgrade} onClick={() => requestAction('upgrade')}>
              <Download size={15} /> Instalar atualizações
            </button>
          </div>
          {!sec.updatesSupported && <div className="msg bad">O agente precisa compartilhar a fila de ações com o coletor do Ubuntu WSL.</div>}
          {message && <div className={`msg ${message.ok ? 'ok' : 'bad'}`} role="status">{message.text}</div>}
          <div className="update-note">As ações rodam no Ubuntu WSL como root. A verificação atualiza apenas o índice; instalar usa apt-get upgrade e não remove pacotes.</div>
        </Panel>
      </div>
    </div>
  )
}
