export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT'

export interface CurrentUser {
  id: string
  username: string
  fullName: string
  role: UserRole
  gradeId: string | null
  mustChangePassword: boolean
}

export interface AuthResponse {
  accessToken: string
  accessTokenExpiresAt: string
  user: CurrentUser
}

export interface LoginRequest {
  username: string
  password: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated'
