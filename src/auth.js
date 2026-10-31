import { AuthError, loginRequest, logoutRequest } from './api'

export const logout = () => { void logoutRequest().catch(() => {}) }

export async function login(password) {
  try {
    const result = await loginRequest(password)
    if (result.status === 429) return 'limit'
    return result.ok && result.data?.authenticated === true
  } catch (error) {
    if (error instanceof AuthError) return false
    return 'network'
  }
}
