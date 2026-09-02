import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '../components/RouteGuards'
import { getCurrentUserFn } from '../auth/auth.functions'
import { redirect } from '@tanstack/react-router'
export const Route = createFileRoute('/_customer')({ beforeLoad: async () => { const user = await getCurrentUserFn(); if (!user) throw redirect({ to: '/login' }); if (user.role !== 'customer') throw redirect({ to: '/staff' }) }, component: () => <RequireAuth role="customer" /> })
