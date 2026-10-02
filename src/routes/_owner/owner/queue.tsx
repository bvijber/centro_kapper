import { createFileRoute } from '@tanstack/react-router'
import { OwnerQueue } from '../../../pages/OwnerQueue'

export const Route = createFileRoute('/_owner/owner/queue')({ component: OwnerQueue })
