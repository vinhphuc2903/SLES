import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/features/auth/hooks/useCurrentUser'
import { LoadingScreen } from '@/components/feedback/LoadingScreen'

export function ProtectedRoute() {
  const { status, user } = useAuth()
  const location = useLocation()
  if (status === 'initializing') return <LoadingScreen label="Đang khôi phục phiên đăng nhập..." />
  if (status !== 'authenticated' || !user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />
  return <Outlet />
}
