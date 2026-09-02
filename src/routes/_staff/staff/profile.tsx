import { createFileRoute } from '@tanstack/react-router'
import { StaffProfile } from '../../../pages/StaffProfile'
export const Route = createFileRoute('/_staff/staff/profile')({ component: StaffProfile })
