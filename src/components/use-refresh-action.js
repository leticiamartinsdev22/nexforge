import { useCallback, useRef, useState } from 'react'
import { useToast } from './toast-context'

export function useRefreshAction({ refresh, pendingText = 'Verificando...', successText = 'Atualizado com sucesso', errorText = 'Servidor offline' } = {}) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const running = useRef(false)

  const run = useCallback(async (event) => {
    event?.preventDefault?.()
    if (!refresh || running.current) return false

    running.current = true
    const toastId = showToast({
      title: pendingText,
      tone: 'info',
      duration: 0,
      loading: true,
    })

    setLoading(true)
    setStatus({ text: pendingText, tone: 'info' })

    try {
      const result = await refresh()
      if (result === false) throw new Error(errorText)
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        throw new Error(result.msg || errorText)
      }
      setStatus({ text: successText, tone: 'success' })
      showToast({ id: toastId, title: successText, tone: 'success', duration: 3000, loading: false })
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : errorText
      setStatus({ text: message || errorText, tone: 'error' })
      showToast({ id: toastId, title: message || errorText, tone: 'error', duration: 4000, loading: false })
      return false
    } finally {
      running.current = false
      setLoading(false)
    }
  }, [errorText, pendingText, refresh, showToast, successText])

  return { run, loading, status }
}
