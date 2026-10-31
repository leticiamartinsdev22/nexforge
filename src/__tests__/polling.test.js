import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startPolling } from '../polling.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('polling lifecycle', () => {
  it('clears its interval when the consumer unmounts', async () => {
    const task = vi.fn().mockResolvedValue('ready')
    const stop = startPolling({ intervalMs: 1000, task })
    await vi.advanceTimersByTimeAsync(0)
    expect(task).toHaveBeenCalledTimes(1)
    stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('does not publish a result after the consumer unmounts', async () => {
    let resolveTask
    const onResult = vi.fn()
    const task = vi.fn(() => new Promise((resolve) => { resolveTask = resolve }))
    const stop = startPolling({ intervalMs: 1000, task, onResult })
    await Promise.resolve()
    stop()
    resolveTask('late result')
    await Promise.resolve()
    await Promise.resolve()
    expect(onResult).not.toHaveBeenCalled()
  })

  it('does not start overlapping requests when a poll is still pending', async () => {
    const pending = []
    const task = vi.fn(() => new Promise((resolve) => pending.push(resolve)))
    const stop = startPolling({ intervalMs: 1000, task })
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(3500)
    expect(task).toHaveBeenCalledTimes(1)
    pending[0]('finished')
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(2)
    pending[1]('finished')
    stop()
  })

  it('aborts in-flight work and clears polling on cleanup', async () => {
    let requestSignal
    const task = vi.fn((signal) => {
      requestSignal = signal
      return new Promise(() => {})
    })
    const clear = vi.spyOn(globalThis, 'clearInterval')
    const stop = startPolling({ intervalMs: 1000, task })
    await Promise.resolve()
    stop()
    expect(requestSignal.aborted).toBe(true)
    expect(clear).toHaveBeenCalledTimes(1)
  })
})
