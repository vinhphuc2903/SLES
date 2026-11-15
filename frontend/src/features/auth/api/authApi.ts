import { apiClient, authApi, setAccessToken } from '@/lib/api/apiClient'
import type { AuthResponse, ChangePasswordRequest, CurrentUser, LoginRequest } from '@/types/auth'

let sessionRestorePromise: Promise<CurrentUser> | null = null

export async function login(request: LoginRequest): Promise<CurrentUser> {
  const { data } = await authApi.post<AuthResponse>('/api/auth/login', request)
  setAccessToken(data.accessToken)
  const { data: user } = await apiClient.get<CurrentUser>('/api/auth/me')
  return user
}

export function restoreSession(): Promise<CurrentUser> {
  if (!sessionRestorePromise) {
    sessionRestorePromise = authApi.post<AuthResponse>('/api/auth/refresh').then(({ data }) => {
      setAccessToken(data.accessToken)
      return apiClient.get<CurrentUser>('/api/auth/me').then((response) => response.data)
    }).finally(() => {
      sessionRestorePromise = null
    })
  }
  return sessionRestorePromise
}

export async function logout() {
  try {
    await authApi.post('/api/auth/logout')
  } finally {
    setAccessToken(null)
  }
}

export async function changePassword(request: ChangePasswordRequest) {
  await apiClient.put('/api/auth/change-password', request)
  setAccessToken(null)
}

export async function getCurrentUser() {
  const { data } = await apiClient.get<CurrentUser>('/api/auth/me')
  return data
}
