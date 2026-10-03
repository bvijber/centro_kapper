import type { listServicesFn } from '../../services/services.functions'
import type { getBookingSettingsFn, getSettingsFn } from '../../settings/settings.functions'

export type Service = Awaited<ReturnType<typeof listServicesFn>>[number]

type SettingsData = Awaited<ReturnType<typeof getSettingsFn>>
export type OpeningHour = SettingsData['openingHours'][number]
export type BreakPeriod = SettingsData['breakPeriods'][number]
export type WholeDayBlock = SettingsData['wholeDayBlocks'][number]

export type BookingSettings = Awaited<ReturnType<typeof getBookingSettingsFn>>

export type BusinessProfile = { name: string; address: string; phone: string }

export type ServiceEditorValue = { name: string; description: string; durationMinutes: number; priceCents: number }
