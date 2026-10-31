import { RefreshCw } from 'lucide-react'
import { useRefreshAction } from './use-refresh-action'

export function RefreshActionButton({
  refresh,
  label = 'Verificar agora',
  pendingLabel = 'Verificando...',
  successText = 'Atualizado com sucesso',
  errorText = 'Servidor offline',
  className = '',
  statusClassName = '',
  children,
  icon: Icon = RefreshCw,
  ...buttonProps
}) {
  const { run, loading, status } = useRefreshAction({ refresh, pendingText: pendingLabel, successText, errorText })

  return (
    <div className="action-button-wrap">
      <button type="button" className={className} onClick={run} disabled={loading} {...buttonProps}>
        {loading ? (
          <>
            <Icon size={16} className="spin" />
            <span>{pendingLabel}</span>
          </>
        ) : (
          children ?? <>
            <Icon size={16} />
            <span>{label}</span>
          </>
        )}
      </button>
      {status && <div className={'action-button-status ' + statusClassName + ' ' + status.tone}>{status.text}</div>}
    </div>
  )
}
