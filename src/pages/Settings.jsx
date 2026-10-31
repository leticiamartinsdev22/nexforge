import { Panel, Pill } from '../components/ui'
import { useData } from '../store-utils'
import { APP_NAME, LIVE, POLL_MS } from '../config'

export default function Settings() {
  const { meta, backup, server } = useData()
  const warnings = meta.warnings ?? []
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
      <Panel title="Geral" sub="Informações do painel">
        <div className="kv"><span>Nome do painel</span><b>{APP_NAME}</b></div>
        <div className="kv"><span>Modo</span><Pill tone={LIVE ? 'ok' : 'warn'}>{LIVE ? 'Ao vivo' : 'Aguardando agente'}</Pill></div>
        <div className="kv"><span>Atualização automática</span><b>{POLL_MS / 1000}s</b></div>
        <div className="kv"><span>Última atualização</span><b>{meta.updatedAt.toLocaleTimeString('pt-BR')}</b></div>
        <div style={{ marginTop: 18, fontSize: 12.5, color: 'var(--dimmer)' }}>
          Nome em src/config.js · intervalo em VITE_POLL_MS (painel) e POLL_MS (agente).
        </div>
      </Panel>
      <Panel title="Agente" sub="Fonte dos dados reais">
        <div className="kv"><span>Fonte dos dados</span><b>{LIVE ? 'Agente (server/)' : 'Aguardando agente'}</b></div>
        <div className="kv"><span>Conexão</span><Pill tone={meta.mode === 'error' ? 'bad' : 'ok'}>{meta.mode === 'error' ? 'Sem conexão' : meta.mode === 'demo' ? 'Aguardando agente' : 'Conectado'}</Pill></div>
        <div className="kv"><span>Backup configurado</span><Pill tone={backup.enabled ? 'ok' : 'muted'}>{backup.enabled ? 'Sim' : 'Não'}</Pill></div>
        <div className="kv"><span>Origem das métricas</span><b>{server.source ?? 'Aguardando agente'}</b></div>
        <div className="kv"><span>Última amostra do host</span><b>{server.metricsAt ? new Date(server.metricsAt).toLocaleTimeString('pt-BR') : 'Aguardando dados'}</b></div>
        {warnings.map((w) => <div key={w} className="msg bad">{w}</div>)}
      </Panel>
    </div>
  )
}
