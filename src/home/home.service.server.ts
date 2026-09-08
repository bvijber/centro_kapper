import { listBookableServices } from '../appointments/appointment.service.server'
import { getBusinessProfile, getOpeningHours } from '../settings/settings.service.server'
import { computeOpenStatus, summarizeOpeningHours, type HomeOpenStatus, type HomeOpeningHour } from './home.domain'
import type { BookableServiceDTO } from '../appointments/appointment.service.server'

export type HomeDTO = {
  business: { name: string; address: string; phone: string }
  hoursSummary: string
  openStatus: HomeOpenStatus
  services: BookableServiceDTO[]
}

export async function getHomeData(): Promise<HomeDTO> {
  const [business, hours, services] = await Promise.all([getBusinessProfile(), getOpeningHours(), listBookableServices()])
  const normalized: HomeOpeningHour[] = hours.map((hour) => ({
    weekday: hour.weekday,
    isOpen: hour.isOpen,
    openingTime: hour.openingTime?.slice(0, 5) ?? null,
    closingTime: hour.closingTime?.slice(0, 5) ?? null,
  }))
  return {
    business: business ?? { name: 'Centro Kapper', address: '', phone: '' },
    hoursSummary: summarizeOpeningHours(normalized),
    openStatus: computeOpenStatus(normalized, new Date()),
    services,
  }
}