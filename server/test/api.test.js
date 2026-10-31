import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function startAgent(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexforge-api-test-'))
  const configPath = path.join(directory, 'config.json')
  fs.writeFileSync(configPath, JSON.stringify({
    server: { name: 'NexForge test', region: 'WSL', provider: 'local' },
    apps: {},
    domains: [],
    backups: {},
    thresholds: { disk: 90, ram: 90 },
  }))
  const port = await freePort()
  const env = { ...process.env }
  for (const name of Object.keys(env)) {
    if (name.startsWith('DATABASE_') || name === 'DATABASE_URL' || name === 'PANEL_PASSWORD_FILE' || name === 'PANEL_SECRET_FILE' || name === 'HOST_METRICS_FILE' || name === 'HOST_ACTIONS_DIR') {
      delete env[name]
    }
  }
  Object.assign(env, {
    PANEL_PASSWORD: 'checkup-password',
    PANEL_SECRET: 'checkup-secret-0123456789abcdef',
    CONFIG_PATH: configPath,
    NEXFORGE_DATA_DIR: path.join(directory, 'data'),
    DOCKER_HOST: 'tcp://127.0.0.1:1',
    HOST: '127.0.0.1',
    PORT: String(port),
    CORS_ORIGIN: 'http://localhost:4173',
    POLL_MS: '1',
    TRUST_PROXY: 'false',
  })

  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: serverRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk })
  child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk })
  const base = 'http://127.0.0.1:' + port

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await Promise.race([once(child, 'exit'), delay(5000)])
    }
    if (child.exitCode === null) {
      child.kill('SIGKILL')
      await once(child, 'exit')
    }
    fs.rmSync(directory, { recursive: true, force: true })
  })

  let ready = false
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Agent exited before ready: ' + output)
    try {
      const response = await fetch(base + '/api/health')
      if (response.ok) { ready = true; break }
    } catch {}
    await delay(250)
  }
  assert.equal(ready, true, 'agent did not become ready')
  return { base, request: (route, options) => fetch(base + route, options), child }
}

test('all agent read endpoints authenticate and degrade without Docker', async (t) => {
  const { request, child } = await startAgent(t)
  const publicHealth = await request('/api/health')
  assert.equal(publicHealth.status, 200)
  const health = await publicHealth.json()
  assert.equal(health.available, true)
  assert.equal(health.dockerAvailable, false)

  const protectedPaths = [
    '/api/metrics',
    '/api/history',
    '/api/containers',
    '/api/processes',
    '/api/logs',
    '/api/logs/unlisted',
    '/api/alerts',
    '/api/security',
    '/api/domains',
    '/api/databases',
    '/api/backups',
  ]

  for (const route of protectedPaths) {
    const anonymous = await request(route)
    assert.equal(anonymous.status, 401, route + ' without token')
    const invalid = await request(route, { headers: { Authorization: 'Bearer invalid-checkup-token' } })
    assert.equal(invalid.status, 401, route + ' with invalid token')
  }

  const badLogin = await request('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong-password' }),
  })
  assert.equal(badLogin.status, 401)

  const login = await request('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'checkup-password' }),
  })
  assert.equal(login.status, 200)
  assert.equal((await login.json()).authenticated, true)
  const cookie = login.headers.get('set-cookie')
  const token = /^nexforge_session=([^;]+)/.exec(cookie)?.[1]
  assert.ok(token)
  const authHeaders = { Authorization: 'Bearer ' + token }

  const responses = new Map()
  for (const route of protectedPaths) {
    const response = await request(route, { headers: authHeaders })
    assert.equal(response.status, 200, route + ' with valid token')
    responses.set(route, await response.json())
  }

  for (const route of ['/api/containers', '/api/processes', '/api/logs', '/api/logs/unlisted', '/api/databases']) {
    assert.equal(responses.get(route).available, false, route + ' without Docker')
    assert.deepEqual(responses.get(route).items ?? responses.get(route).lines ?? [], [])
  }
  assert.equal(responses.get('/api/metrics').available, false)
  assert.deepEqual(responses.get('/api/metrics').history, [])
  assert.equal(responses.get('/api/history').available, true)
  assert.ok(Array.isArray(responses.get('/api/history').history.cpu))
  assert.ok(responses.get('/api/history').history.cpu.length <= 30)
  assert.ok(Array.isArray(responses.get('/api/alerts').items))
  assert.ok(responses.get('/api/security').security)
  assert.ok(Array.isArray(responses.get('/api/domains').items))
  assert.equal(responses.get('/api/backups').available, false)

  const unconfiguredBackup = await request('/api/actions/backup', { method: 'POST', headers: authHeaders })
  assert.equal(unconfiguredBackup.status, 501)
  assert.deepEqual(await unconfiguredBackup.json(), { error: 'not_configured' })

  const badRange = await request('/api/metrics?range=invalid', { headers: authHeaders })
  assert.equal(badRange.status, 400)
  assert.deepEqual(await badRange.json(), { error: 'invalid_range' })

  const malformed = await request('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid-json',
  })
  assert.equal(malformed.status, 400)
  const malformedBody = await malformed.text()
  assert.ok(!malformedBody.includes('SyntaxError'))
  assert.ok(!malformedBody.includes(serverRoot))

  const tooLarge = await request('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'x'.repeat(3000) }),
  })
  assert.equal(tooLarge.status, 413)
  assert.deepEqual(await tooLarge.json(), { error: 'request_too_large' })

  const allowed = await request('/api/health', { headers: { Origin: 'http://localhost:4173' } })
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:4173')
  const denied = await request('/api/health', { headers: { Origin: 'http://attacker.invalid' } })
  assert.equal(denied.headers.get('access-control-allow-origin'), null)
  assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff')
  assert.ok(allowed.headers.get('x-frame-options'))
  assert.equal(allowed.headers.get('x-powered-by'), null)

  const snapshot = await request('/api/snapshot', { headers: authHeaders })
  assert.equal(snapshot.status, 200)
  assert.equal((await snapshot.json()).docker.available, false)

  const logout = await request('/api/logout', { method: 'POST', headers: authHeaders })
  assert.equal(logout.status, 204)
  const expired = await request('/api/session', { headers: authHeaders })
  assert.equal(expired.status, 401)

  const unknown = await request('/api/not-a-route', { headers: authHeaders })
  assert.equal(unknown.status, 404)
  assert.deepEqual(await unknown.json(), { error: 'not_found' })

  const burst = await Promise.all(Array.from({ length: 160 }, () => request('/api/health')))
  assert.ok(burst.some((response) => response.status === 429), 'burst should be rate limited')
  assert.equal(child.exitCode, null, 'agent remains alive after a request burst')
})
