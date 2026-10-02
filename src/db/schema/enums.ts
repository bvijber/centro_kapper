import { pgEnum } from 'drizzle-orm/pg-core'

// `staff` remains in the enum only for backwards-compatible migration of old rows.
// New runtime accounts and authorization use the single `owner` role.
export const userRoleEnum = pgEnum('user_role', ['customer', 'owner', 'staff'])

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
  'called',
  'in_service',
  'completed',
  'cancelled',
  'skipped',
])
