import { createFileRoute } from '@tanstack/react-router'
import { CreateAccount } from '../pages/CreateAccount'
export const Route = createFileRoute('/create-account')({ component: CreateAccount })
