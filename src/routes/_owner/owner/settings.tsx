import { createFileRoute } from '@tanstack/react-router'
import { OwnerSettings } from '../../../pages/OwnerSettings'

export const Route = createFileRoute('/_owner/owner/settings')({ component: OwnerSettings })
