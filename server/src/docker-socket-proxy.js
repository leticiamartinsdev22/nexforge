import http from 'node:http'

const SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock'
const VERSION_PREFIX = /^\/v\d+\.\d+(?=\/)/

function allowedPath(url) {
  let path
  try { path = new URL(url, 'http://docker-api').pathname.replace(VERSION_PREFIX, '') } catch { return false }
  return path === '/_ping'
    || path === '/version'
    || path === '/containers/json'
    || /^\/containers\/[a-f\d]{12,64}\/(?:json|stats|logs)$/i.test(path)
}

http.createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { Allow: 'GET', 'Content-Type': 'application/json' })
    return res.end('{"error":"method_not_allowed"}')
  }
  if (!allowedPath(req.url)) {
    res.writeHead(403, { 'Content-Type': 'application/json' })
    return res.end('{"error":"docker_api_path_forbidden"}')
  }

  const upstream = http.request({
    socketPath: SOCKET,
    path: req.url,
    method: 'GET',
    headers: { accept: req.headers.accept ?? '*/*', connection: 'close' },
  }, (response) => {
    const headers = { ...response.headers }
    delete headers.connection
    delete headers['keep-alive']
    res.writeHead(response.statusCode ?? 502, headers)
    response.pipe(res)
  })
  upstream.setTimeout(30000, () => upstream.destroy(new Error('Docker API timeout')))
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end('{"error":"docker_api_unavailable"}')
  })
  upstream.end()
}).listen(2375, '0.0.0.0')
