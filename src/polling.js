export function startPolling({ intervalMs, task, onResult, onError }) {
  let active = true
  let inFlight = false
  let controller = null

  const tick = async () => {
    if (!active || inFlight) return
    inFlight = true
    controller = new AbortController()
    const requestController = controller
    try {
      const result = await task(requestController.signal)
      if (active) onResult?.(result)
    } catch (error) {
      if (active && !requestController.signal.aborted) onError?.(error)
    } finally {
      if (controller === requestController) controller = null
      inFlight = false
    }
  }

  const timer = globalThis.setInterval(() => { void tick() }, intervalMs)
  void tick()

  return () => {
    if (!active) return
    active = false
    globalThis.clearInterval(timer)
    controller?.abort()
  }
}
