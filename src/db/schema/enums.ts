import { pgEnum } from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', ['customer', 'staff'])

export const appointmentStatusEnum = pgEnum('appointment_status', [
  'new',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
])

export const cancellationRequestStatusEnum = pgEnum('cancellation_request_status', [
  'pending',
  'approved',
  'rejected',
  'withdrawn',
])

export const waitingListStatusEnum = pgEnum('waiting_list_status', [
  'waiting',
  'accepted',
  'called',
  'rejected',
  'completed',
  'cancelled',
])
