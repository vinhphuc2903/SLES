import { createContext } from 'react'
import type { AuthStatus, ChangePasswordRequest, CurrentUser, LoginRequest } from '@/types/auth'

export interface AuthContextValue {
  status: AuthStatus
  user: CurrentUser | null
  login: (request: LoginRequest) => Promise<CurrentUser>
  logout: () => Promise<void>
  changePassword: (request: ChangePasswordRequest) => Promise<void>
  setUser: (user: CurrentUser) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
