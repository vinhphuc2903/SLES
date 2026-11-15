import { AxiosError, type AxiosAdapter } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { restoreSession } from '@/features/auth/api/authApi'
import { normalizeApiError } from './apiErrors'
import { apiClient, authApi, setAccessToken, setSessionExpiredHandler, tokenStore } from './apiClient'

afterEach(() => {
  setAccessToken(null)
  setSessionExpiredHandler(null)
  vi.restoreAllMocks()
})

describe('API authentication client', () => {
  it('keeps access token in memory and adds it to same-origin API requests', async () => {
    setAccessToken('memory-only-token')
    let authorization = ''
    apiClient.defaults.adapter = (async (config) => {
      authorization = String(config.headers.Authorization ?? '')
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config }
    }) satisfies AxiosAdapter

    await apiClient.get('/api/private')
    expect(authorization).toBe('Bearer memory-only-token')
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(tokenStore.get()).toBe('memory-only-token')
  })

  it('shares one refresh between concurrent 401 responses and retries each request once', async () => {
    setAccessToken('expired-token')
    let refreshCount = 0
    let protectedRequestCount = 0
    authApi.defaults.adapter = (async (config) => {
      refreshCount += 1
      return { data: { accessToken: 'fresh-token', accessTokenExpiresAt: new Date().toISOString(), user: { id: 'u', username: 'u', fullName: 'User', role: 'STUDENT', gradeId: null, mustChangePassword: false } }, status: 200, statusText: 'OK', headers: {}, config }
    }) satisfies AxiosAdapter
    apiClient.defaults.adapter = (async (config) => {
      protectedRequestCount += 1
      if (config.headers.Authorization !== 'Bearer fresh-token') {
        throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, { status: 401, statusText: 'Unauthorized', headers: {}, config, data: { error: { code: 'invalid_access_token', message: 'Invalid token.' } } })
      }
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config }
    }) satisfies AxiosAdapter

    const [first, second] = await Promise.all([apiClient.get('/api/private/a'), apiClient.get('/api/private/b')])
    expect(first.data.ok).toBe(true)
    expect(second.data.ok).toBe(true)
    expect(refreshCount).toBe(1)
    expect(protectedRequestCount).toBe(4)
    expect(tokenStore.get()).toBe('fresh-token')
  })

  it('does not send a bearer token to unrelated absolute URLs', async () => {
    setAccessToken('memory-only-token')
    let authorization: unknown
    apiClient.defaults.adapter = (async (config) => {
      authorization = config.headers.Authorization
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
    }) satisfies AxiosAdapter
    await apiClient.get('https://example.invalid/resource')
    expect(authorization).toBeUndefined()
  })

  it('deduplicates session restoration across React Strict Mode effect remounts', async () => {
    let refreshCount = 0
    let profileCount = 0
    authApi.defaults.adapter = (async (config) => {
      refreshCount += 1
      return { data: { accessToken: 'restored-token', accessTokenExpiresAt: new Date().toISOString(), user: { id: 'u', username: 'u', fullName: 'User', role: 'TEACHER', gradeId: null, mustChangePassword: false } }, status: 200, statusText: 'OK', headers: {}, config }
    }) satisfies AxiosAdapter
    apiClient.defaults.adapter = (async (config) => {
      profileCount += 1
      return { data: { id: 'u', username: 'u', fullName: 'User', role: 'TEACHER', gradeId: null, mustChangePassword: false }, status: 200, statusText: 'OK', headers: {}, config }
    }) satisfies AxiosAdapter

    const [first, second] = await Promise.all([restoreSession(), restoreSession()])
    expect(first).toEqual(second)
    expect(refreshCount).toBe(1)
    expect(profileCount).toBe(1)
  })

  it('clears the session after one failed refresh and does not loop', async () => {
    setAccessToken('expired-token')
    const sessionExpired = vi.fn()
    setSessionExpiredHandler(sessionExpired)
    let protectedRequestCount = 0
    apiClient.defaults.adapter = (async (config) => {
      protectedRequestCount += 1
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, { status: 401, statusText: 'Unauthorized', headers: {}, config, data: {} })
    }) satisfies AxiosAdapter
    authApi.defaults.adapter = (async (config) => {
      throw new AxiosError('Invalid refresh', 'ERR_BAD_REQUEST', config, undefined, { status: 401, statusText: 'Unauthorized', headers: {}, config, data: {} })
    }) satisfies AxiosAdapter

    await expect(apiClient.get('/api/private')).rejects.toBeInstanceOf(AxiosError)
    expect(protectedRequestCount).toBe(1)
    expect(sessionExpired).toHaveBeenCalledOnce()
    expect(tokenStore.get()).toBeNull()
  })

  it('normalizes backend error envelopes and validation problem details', () => {
    const backendError = normalizeApiError({ isAxiosError: true, response: { status: 409, data: { error: { code: 'conflict', message: 'Cannot continue.' } } } })
    const validationError = normalizeApiError({ isAxiosError: true, response: { status: 400, data: { errors: { NewPassword: ['Too short.'] }, title: 'One or more validation errors occurred.' } } })
    expect(backendError.message).toBe('Cannot continue.')
    expect(backendError.code).toBe('conflict')
    expect(validationError.fieldErrors.NewPassword).toBe('Too short.')
  })
})
