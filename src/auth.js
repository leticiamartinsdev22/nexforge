import { LIVE } from './config'
import { AuthError, loginRequest, logoutRequest } from './api'

const KEY = 'nexforge_local_auth'
if (LIVE) localStorage.removeItem('nexforge_token')
export const isAuth = () => !LIVE && localStorage.getItem(KEY) === 'local'
export const logout = () => {
  localStorage.removeItem(KEY)
  if (LIVE) void logoutRequest().catch(() => {})
}

export async function login(password) {
  if (!LIVE) {
    localStorage.setItem(KEY, 'local')
    return true
  }
  try {
    const result = await loginRequest(password)
    if (result.status === 429) return 'limit'
    return result.ok && result.data?.authenticated === true
  } catch (error) {
    if (error instanceof AuthError) return false
    return 'network'
  }
}
