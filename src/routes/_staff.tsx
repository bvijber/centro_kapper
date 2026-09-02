import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '../components/RouteGuards'
export const Route = createFileRoute('/_staff')({ component: () => <RequireAuth role="staff" /> })
