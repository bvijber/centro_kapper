import { z } from 'zod'

export const ownerNotificationIdSchema = z.object({
  id: z.string().uuid('Ongeldige notificatie-id.'),
})

export type OwnerNotificationIdInput = z.infer<typeof ownerNotificationIdSchema>
