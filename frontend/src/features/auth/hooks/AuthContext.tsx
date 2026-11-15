import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AuthContext } from './authTypes'
import { changePassword as changePasswordRequest, login as loginRequest, logout as logoutRequest, restoreSession } from '@/features/auth/api/authApi'
import { setAccessToken, setSessionExpiredHandler } from '@/lib/api/apiClient'
import type { AuthStatus, ChangePasswordRequest, CurrentUser, LoginRequest } from '@/types/auth'

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('initializing')
  const [user, setUserState] = useState<CurrentUser | null>(null)
  const queryClient = useQueryClient()

  const clearSession = useCallback(() => {
    setAccessToken(null)
    setUserState(null)
    setStatus('unauthenticated')
    queryClient.clear()
  }, [queryClient])

  useEffect(() => {
    setSessionExpiredHandler(clearSession)
    let active = true
    void restoreSession().then((currentUser) => {
      if (active) { setUserState(currentUser); setStatus('authenticated') }
    }).catch(() => {
      if (active) clearSession()
    })
    return () => { active = false; setSessionExpiredHandler(null) }
  }, [clearSession])

  const login = useCallback(async (request: LoginRequest) => {
    const currentUser = await loginRequest(request)
    queryClient.clear()
    setUserState(currentUser)
    setStatus('authenticated')
    return currentUser
  }, [queryClient])

  const logout = useCallback(async () => {
    try { await logoutRequest() } catch { toast.error('Không thể kết nối để thu hồi phiên. Thiết bị này đã được đăng xuất.'); setAccessToken(null) }
    clearSession()
  }, [clearSession])

  const changePassword = useCallback(async (request: ChangePasswordRequest) => {
    await changePasswordRequest(request)
    clearSession()
  }, [clearSession])

  const setUser = useCallback((currentUser: CurrentUser) => setUserState(currentUser), [])
  const value = useMemo(() => ({ status, user, login, logout, changePassword, setUser }), [status, user, login, logout, changePassword, setUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

