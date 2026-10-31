import crypto from 'node:crypto'

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest()
const b64 = (s) => Buffer.from(s).toString('base64url')

export function makeAuth({ password, secret, ttlMs = 12 * 3600e3 }) {
  const sign = (p) => crypto.createHmac('sha256', secret).update(p).digest('base64url')
  const attempts = new Map() // ip -> timestamps das tentativas erradas
  const revoked = new Map()

  return {
    login(ip, pw) {
      const now = Date.now()
      if (attempts.size > 10000) {
        for (const [address, timestamps] of attempts) {
          const active = timestamps.filter((time) => now - time < 15 * 60e3)
          if (active.length) attempts.set(address, active)
          else attempts.delete(address)
          if (attempts.size <= 5000) break
        }
        while (attempts.size > 10000) attempts.delete(attempts.keys().next().value)
      }
      const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 15 * 60e3)
      if (recent.length >= 5) return { error: 'too_many' }
      if (!crypto.timingSafeEqual(sha(pw), sha(password))) {
        recent.push(now)
        attempts.set(ip, recent)
        return { error: 'invalid' }
      }
      attempts.delete(ip)
      const payload = b64(JSON.stringify({ exp: now + ttlMs }))
      return { token: `${payload}.${sign(payload)}` }
    },
    verify(token) {
      if (!token) return false
      const [payload, sig] = token.split('.')
      if (!payload || !sig) return false
      const a = Buffer.from(sig), b = Buffer.from(sign(payload))
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
      try {
        const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
        if (!Number.isFinite(exp) || exp <= Date.now() || revoked.has(token)) return false
        if (revoked.size > 10000) {
          for (const [value, expiresAt] of revoked) if (expiresAt <= Date.now()) revoked.delete(value)
          while (revoked.size > 10000) revoked.delete(revoked.keys().next().value)
        }
        return true
      } catch { return false }
    },
    revoke(token) {
      if (!this.verify(token)) return false
      const [payload] = token.split('.')
      try {
        const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
        revoked.set(token, exp)
        if (revoked.size > 10000) {
          for (const [value, expiresAt] of revoked) if (expiresAt <= Date.now()) revoked.delete(value)
          while (revoked.size > 10000) revoked.delete(revoked.keys().next().value)
        }
        return true
      } catch { return false }
    },
  }
}
