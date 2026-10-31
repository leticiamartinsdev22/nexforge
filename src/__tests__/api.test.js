import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiNetworkError, ApiTimeoutError, AuthError, fetchMetrics, fetchSession } from '../api.js'

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('agent API wrapper', () => {
  it('returns a validated successful metrics response', async () => {
    fetch.mockResolvedValue(jsonResponse({ range: '1h', available: true, history: [{ cpu: 12 }] }))
    await expect(fetchMetrics('1h')).resolves.toMatchObject({ available: true, history: [{ cpu: 12 }] })
    expect(fetch).toHaveBeenCalledWith('/api/metrics?range=1h', expect.objectContaining({ credentials: 'include' }))
  })

  it('converts HTTP 401 into an authentication error', async () => {
    fetch.mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401))
    await expect(fetchSession()).rejects.toBeInstanceOf(AuthError)
  })

  it('preserves HTTP 500 status and agent error code', async () => {
    fetch.mockResolvedValue(jsonResponse({ error: 'metrics_unavailable' }, 500))
    await expect(fetchMetrics('1h')).rejects.toMatchObject({
      name: 'ApiError', status: 500, code: 'metrics_unavailable',
    })
  })

  it('rejects a successful response containing invalid JSON', async () => {
    fetch.mockResolvedValue(new Response('<html>invalid</html>', { status: 200 }))
    await expect(fetchSession()).rejects.toMatchObject({ name: 'ApiError', code: 'invalid_response' })
  })

  it('rejects a JSON response with an invalid data shape', async () => {
    fetch.mockResolvedValue(jsonResponse({ range: '1h', history: 'not-an-array' }))
    await expect(fetchMetrics('1h')).rejects.toMatchObject({ name: 'ApiError', code: 'invalid_history' })
  })

  it('converts network failures into ApiNetworkError', async () => {
    fetch.mockRejectedValue(new TypeError('network unavailable'))
    await expect(fetchSession()).rejects.toBeInstanceOf(ApiNetworkError)
  })

  it('aborts requests at the configured timeout', async () => {
    vi.useFakeTimers()
    fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const request = fetchSession({ timeoutMs: 25 })
    const assertion = expect(request).rejects.toBeInstanceOf(ApiTimeoutError)
    await vi.advanceTimersByTimeAsync(25)
    await assertion
  })
})
