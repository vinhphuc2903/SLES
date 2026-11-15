import axios, { type InternalAxiosRequestConfig } from 'axios'
import type { AuthResponse } from '@/types/auth'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
export const apiBaseUrl = configuredBaseUrl || '/'

let accessToken: string | null = null
let onSessionExpired: (() => void) | null = null
let refreshPromise: Promise<string> | null = null

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 20_000,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  withCredentials: true,
})

export const authApi = axios.create({ baseURL: apiBaseUrl, timeout: 20_000, withCredentials: true })

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

function isSameOriginRequest(config: InternalAxiosRequestConfig) {
  const requestUrl = config.url ?? ''
  if (/^https?:\/\//i.test(requestUrl)) {
    try {
      return new URL(requestUrl).origin === window.location.origin
    } catch {
      return false
    }
  }
  return true
}

async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = authApi.post<AuthResponse>('/api/auth/refresh').then(({ data }) => {
      setAccessToken(data.accessToken)
      return data.accessToken
    }).finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

apiClient.interceptors.request.use((config) => {
  if (accessToken && isSameOriginRequest(config)) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

apiClient.interceptors.response.use((response) => response, async (error: unknown) => {
  if (!axios.isAxiosError(error) || error.response?.status !== 401) return Promise.reject(error)
  const config = error.config as (InternalAxiosRequestConfig & { _slesRetried?: boolean }) | undefined
  const url = config?.url ?? ''
  if (!config || !isSameOriginRequest(config) || config._slesRetried || /\/api\/auth\/(login|refresh|logout)$/.test(url)) return Promise.reject(error)

  config._slesRetried = true
  try {
    const token = await refreshAccessToken()
    config.headers.Authorization = `Bearer ${token}`
    return await apiClient.request(config)
  } catch (refreshError) {
    setAccessToken(null)
    onSessionExpired?.()
    return Promise.reject(refreshError)
  }
})

export const tokenStore = {
  get: () => accessToken,
  clear: () => setAccessToken(null),
}
