import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./appointment.functions', () => ({
  listAppointmentsFn: vi.fn(),
  listCancellationRequestsFn: vi.fn(),
}))

import { listAppointmentsFn, listCancellationRequestsFn } from './appointment.functions'
import { APPOINTMENTS_POLL_INTERVAL_MS, fetchAppointmentsSnapshot } from './appointment.polling'

const mockedAppointments = vi.mocked(listAppointmentsFn)
const mockedRequests = vi.mocked(listCancellationRequestsFn)

describe('fetchAppointmentsSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedAppointments.mockResolvedValue([{ id: 'appointment-1' }] as unknown as Awaited<ReturnType<typeof listAppointmentsFn>>)
    mockedRequests.mockResolvedValue([{ request: { id: 'request-1' } }] as unknown as Awaited<ReturnType<typeof listCancellationRequestsFn>>)
  })

  it('haalt afspraken en annuleringsverzoeken op via de bestaande Server Functions', async () => {
    const snapshot = await fetchAppointmentsSnapshot()

    expect(mockedAppointments).toHaveBeenCalledTimes(1)
    expect(mockedAppointments).toHaveBeenCalledWith({ data: {} })
    expect(mockedRequests).toHaveBeenCalledTimes(1)
    expect(mockedRequests).toHaveBeenCalledWith({ data: {} })
    expect(snapshot.appointments).toHaveLength(1)
    expect(snapshot.requests).toHaveLength(1)
  })

  it('gebruikt een eigen interval voor de automatische verversing', () => {
    expect(APPOINTMENTS_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(20_000)
    expect(APPOINTMENTS_POLL_INTERVAL_MS).toBeLessThanOrEqual(30_000)
  })

  it('propageert een fout zodat de scheduler een back-off kan toepassen', async () => {
    mockedAppointments.mockRejectedValueOnce(new Error('netwerkfout'))
    await expect(fetchAppointmentsSnapshot()).rejects.toThrow('netwerkfout')
  })
})
