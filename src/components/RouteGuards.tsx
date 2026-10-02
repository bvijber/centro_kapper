import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth, type UserRole } from '../auth/AuthContext'

export function RequireAuth({ role }: { role?: UserRole }) {
  const { user, isLoading } = useAuth()
  const navigate = useNavigate()
  const destination = !user ? '/login' : user.role === 'owner' ? '/owner' : '/home'
  const blocked = !isLoading && (!user || (role && user.role !== role))

  useEffect(() => {
    if (blocked) void navigate({ to: destination, replace: true })
  }, [blocked, destination, navigate])

  if (isLoading || blocked) return null
  return <Outlet />
}
