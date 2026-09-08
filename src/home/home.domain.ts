import { formatAmsterdamDateKey, getAmsterdamDateTimeParts, getAmsterdamWeekday } from '../timezone'

export type HomeOpenStatus = {
  label: 'Nu open' | 'Gesloten'
  detail: string
}

export type HomeOpeningHour = { weekday: number; isOpen: boolean; openingTime: string | null; closingTime: string | null }

const DAY_ABBREVIATIONS = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'] as const

export function summarizeOpeningHours(hours: HomeOpeningHour[]): string {
  const ordered = [...hours].sort((a, b) => {
    const order = (weekday: number) => (weekday === 0 ? 6 : weekday - 1)
    return order(a.weekday) - order(b.weekday)
  })
  const openDays = ordered.filter((entry) => entry.isOpen && entry.openingTime && entry.closingTime)
  if (openDays.length === 0) return 'Gesloten'
  if (openDays.length === 7) {
    const first = openDays[0]
    return `Ma–Zo · ${first.openingTime}–${first.closingTime}`
  }
  const segments: Array<{ days: number[]; openingTime: string; closingTime: string }> = []
  for (const entry of openDays) {
    const last = segments[segments.length - 1]
    if (last && last.openingTime === entry.openingTime && last.closingTime === entry.closingTime) {
      last.days.push(entry.weekday)
    } else {
      segments.push({ days: [entry.weekday], openingTime: entry.openingTime!, closingTime: entry.closingTime! })
    }
  }
  return segments.map((segment) => {
    const names = segment.days.map((weekday) => DAY_ABBREVIATIONS[weekday])
    const days = segment.days.length === 1 ? names[0] : `${names[0]}–${names[names.length - 1]}`
    return `${days} · ${segment.openingTime}–${segment.closingTime}`
  }).join(' · ')
}

export function computeOpenStatus(hours: HomeOpeningHour[], now: Date): HomeOpenStatus {
  const weekday = getAmsterdamWeekday(formatAmsterdamDateKey(now))
  const today = hours.find((entry) => entry.weekday === weekday)
  const parts = getAmsterdamDateTimeParts(now)
  const current = `${parts.hour.toString().padStart(2, '0')}:${parts.minute.toString().padStart(2, '0')}`

  if (!today?.isOpen || !today.openingTime || !today.closingTime) {
    return { label: 'Gesloten', detail: 'Vandaag gesloten' }
  }
  if (current < today.openingTime) {
    return { label: 'Gesloten', detail: `Opent vandaag om ${today.openingTime}` }
  }
  if (current >= today.closingTime) {
    return { label: 'Gesloten', detail: 'Vandaag gesloten' }
  }
  return { label: 'Nu open', detail: `Sluit vandaag om ${today.closingTime}` }
}