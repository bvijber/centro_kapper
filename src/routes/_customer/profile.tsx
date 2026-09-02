import { createFileRoute } from '@tanstack/react-router'
import { CustomerProfile } from '../../pages/CustomerProfile'
export const Route = createFileRoute('/_customer/profile')({ component: CustomerProfile })
