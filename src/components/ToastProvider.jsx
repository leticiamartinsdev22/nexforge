import { useCallback, useMemo, useState } from 'react'
import { ToastContext } from './toast-context'

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function ToastViewport({ toasts, dismissToast }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
          <div className="toast-icon" aria-hidden="true">
            {toast.loading ? <span className="toast-spinner" /> : toast.tone === 'success' ? '✓' : toast.tone === 'error' ? '!' : '•'}
          </div>
          <div className="toast-copy">
            <div className="toast-title">{toast.title}</div>
            {toast.detail && <div className="toast-detail">{toast.detail}</div>}
          </div>
          {!toast.loading && (
            <button type="button" className="toast-close" aria-label="Fechar notificação" onClick={() => dismissToast(toast.id)}>
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((toast) => {
    const id = toast.id ?? uid()
    const next = {
      id,
      tone: 'info',
      duration: 3000,
      loading: false,
      closable: true,
      ...toast,
    }

    setToasts((current) => {
      if (toast.id) {
        return current.map((item) => (item.id === toast.id ? { ...item, ...next } : item))
      }
      return [...current, next]
    })

    if (next.duration > 0) {
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== id))
      }, next.duration)
    }

    return id
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismissToast={dismissToast} />
    </ToastContext.Provider>
  )
}

