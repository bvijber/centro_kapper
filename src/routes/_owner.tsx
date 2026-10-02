import { createFileRoute, redirect } from '@tanstack/react-router'
import { RequireAuth } from '../components/RouteGuards'
import { getCurrentUserFn } from '../auth/auth.functions'

export const Route = createFileRoute('/_owner')({
  beforeLoad: async () => {
    const user = await getCurrentUserFn()
    if (!user) throw redirect({ to: '/login' })
    if (user.role !== 'owner') throw redirect({ to: '/home' })
  },
  component: () => <RequireAuth role="owner" />,
})
