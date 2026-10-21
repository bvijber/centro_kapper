import { describe, expect, it } from 'vitest'

import {
  appointmentBookedNotificationText,
  appointmentCancelledNotificationText,
  formatNotificationTimestamp,
  ownerNotificationTarget,
  queueJoinedNotificationText,
  queueLeftNotificationText,
} from './owner-notification.presentation'

describe('owner notification presentation', () => {
  it('includes the customer name in the internal notification text', () => {
    expect(queueJoinedNotificationText('Jan Jansen').body).toBe('Jan Jansen is toegevoegd aan de wachtrij.')
    expect(queueLeftNotificationText('Jan Jansen').body).toBe('Jan Jansen heeft de wachtrij verlaten.')
    expect(appointmentBookedNotificationText('Jan Jansen').body).toBe('Jan Jansen heeft een afspraak geboekt.')
    expect(appointmentCancelledNotificationText('Jan Jansen').body).toBe(
      'De afspraak van Jan Jansen is geannuleerd.',
    )
  })

  it('falls back to a general message when the customer name is unknown', () => {
    expect(queueJoinedNotificationText(null).body).toBe('Er is een nieuwe klant toegevoegd aan de wachtrij.')
    expect(queueJoinedNotificationText('   ').body).toBe('Er is een nieuwe klant toegevoegd aan de wachtrij.')
    expect(queueLeftNotificationText(undefined).body).toBe('Een klant heeft de wachtrij verlaten.')
    expect(appointmentBookedNotificationText(null).body).toBe('Er is een nieuwe afspraak geboekt.')
    expect(appointmentCancelledNotificationText(null).body).toBe('Een afspraak is geannuleerd.')
  })

  it('maps every event to the relevant owner page', () => {
    expect(ownerNotificationTarget('queue_joined')).toBe('/owner/queue')
    expect(ownerNotificationTarget('queue_left')).toBe('/owner/queue')
    expect(ownerNotificationTarget('appointment_booked')).toBe('/owner/appointments')
    expect(ownerNotificationTarget('appointment_cancelled')).toBe('/owner/appointments')
  })

  it('formats recent notifications as relative time', () => {
    const now = new Date('2026-10-21T12:00:00.000Z')
    expect(formatNotificationTimestamp(new Date('2026-10-21T11:59:30.000Z'), now)).toBe('zojuist')
    expect(formatNotificationTimestamp(new Date('2026-10-21T11:45:00.000Z'), now)).toBe('15 min geleden')
    expect(formatNotificationTimestamp(new Date('2026-10-21T09:00:00.000Z'), now)).toBe('3 uur geleden')
    expect(formatNotificationTimestamp(new Date('2026-10-19T11:00:00.000Z'), now)).toContain('okt')
    // De waarde kan ook als ISO-string binnenkomen.
    expect(formatNotificationTimestamp('2026-10-19T11:00:00.000Z', now)).toContain('okt')
    expect(formatNotificationTimestamp('geen datum', now)).toBe('')
  })
})
