import { createFileRoute } from '@tanstack/react-router'
import { OwnerProfile } from '../../../pages/OwnerProfile'

export const Route = createFileRoute('/_owner/owner/profile')({ component: OwnerProfile })
