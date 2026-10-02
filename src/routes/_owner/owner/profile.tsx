import { createFileRoute } from '@tanstack/react-router'
import { StaffProfile } from '../../../pages/StaffProfile'

export const Route = createFileRoute('/_owner/owner/profile')({ component: StaffProfile })
