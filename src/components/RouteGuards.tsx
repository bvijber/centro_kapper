import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth, type UserRole } from '../auth/AuthContext'

export function RequireAuth({ role }: { role?: UserRole }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (role && user.role !== role) return <Navigate to={user.role === 'staff' ? '/staff' : '/home'} replace />
  return <Outlet />
}
