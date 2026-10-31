import { API_URL } from './config'

const DEFAULT_TIMEOUT_MS = 10000

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'api_error' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export class AuthError extends ApiError {
  constructor() {
    super('Sessão expirada. Entre novamente.', { status: 401, code: 'unauthorized' })
    this.name = 'AuthError'
  }
}

export class ApiNetworkError extends ApiError {
  constructor() {
    super('Sem conexão com o agente.', { code: 'network_error' })
    this.name = 'ApiNetworkError'
  }
}

export class ApiTimeoutError extends ApiNetworkError {
  constructor() {
    super()
    this.message = 'Tempo limite ao consultar o agente.'
    this.code = 'timeout'
    this.name = 'ApiTimeoutError'
  }
}

async function perform(method, path, { body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const requestSignal = signal && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([controller.signal, signal])
    : controller.signal

  try {
    const response = await fetch(API_URL + path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: requestSignal,
    })
    if (response.status === 401) throw new AuthError()

    const text = response.status === 204 ? '' : await response.text()
    let data = null
    let invalidJson = false
    if (text.trim()) {
      try { data = JSON.parse(text) } catch { invalidJson = true }
    }

    if (!response.ok) {
      return { ok: false, status: response.status, data, error: invalidJson ? 'invalid_response' : data?.error }
    }
    if (response.status !== 204 && (invalidJson || data === null || typeof data !== 'object')) {
      throw new ApiError('A resposta do agente está em formato inválido.', {
        status: response.status,
        code: 'invalid_response',
      })
    }
    return { ok: true, status: response.status, data }
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (signal?.aborted) throw error
    if (timedOut || error?.name === 'AbortError') throw new ApiTimeoutError()
    throw new ApiNetworkError()
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

async function get(path, options) {
  const response = await perform('GET', path, options)
  if (!response.ok) {
    throw new ApiError('O agente respondeu com HTTP ' + response.status + '.', {
      status: response.status,
      code: response.error ?? 'http_error',
    })
  }
  return response.data
}

const requireArray = (value, field) => {
  if (!Array.isArray(value)) {
    throw new ApiError('A resposta do agente está em formato inválido.', { code: 'invalid_' + field })
  }
}

export async function fetchSnapshot(options) {
  const snapshot = await get('/api/snapshot', options)
  if (!snapshot.server || typeof snapshot.server !== 'object' || Array.isArray(snapshot.server)) {
    throw new ApiError('A resposta do agente está em formato inválido.', { code: 'invalid_snapshot' })
  }
  for (const field of ['apps', 'domains', 'dbs', 'backups', 'alerts', 'events', 'hardening', 'logSources']) {
    requireArray(snapshot[field], field)
  }
  if (!snapshot.security || typeof snapshot.security !== 'object' || !snapshot.backup || typeof snapshot.backup !== 'object') {
    throw new ApiError('A resposta do agente está em formato inválido.', { code: 'invalid_snapshot' })
  }
  return snapshot
}

export async function fetchMetrics(range, options) {
  const result = await get('/api/metrics?range=' + encodeURIComponent(range), options)
  requireArray(result.history, 'history')
  return result
}

export async function fetchLogs(source, options) {
  const result = await get('/api/logs/' + encodeURIComponent(source), options)
  requireArray(result.lines, 'logs')
  return result
}

export const fetchHostUpdates = (options) => get('/api/host-updates', options)
export const fetchSession = (options) => get('/api/session', options)
export const loginRequest = (password) => perform('POST', '/api/login', { body: { password } })
export const logoutRequest = () => perform('POST', '/api/logout')

export function send(method, path, body, options) {
  return perform(method, path, { ...options, body })
}
