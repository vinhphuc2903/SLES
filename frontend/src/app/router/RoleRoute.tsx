import { Navigate, Outlet } from 'react-router'
import type { UserRole } from '@/types/auth'
import { useAuth } from '@/features/auth/hooks/useCurrentUser'

export function RoleRoute({ roles }: { roles: UserRole[] }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return roles.includes(user.role) ? <Outlet /> : <Navigate to="/403" replace />
}
