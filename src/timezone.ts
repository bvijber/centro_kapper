export const BUSINESS_TIMEZONE = 'Europe/Amsterdam'

type LocalDateParts = { year: number; month: number; day: number }
type LocalDateTimeParts = LocalDateParts & { hour: number; minute: number }

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function parts(formatter: Intl.DateTimeFormat, value: Date): Record<string, string> {
  return Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]))
}

export function getAmsterdamDateParts(value: Date): LocalDateParts {
  const formatted = parts(dateFormatter, value)
  return { year: Number(formatted.year), month: Number(formatted.month), day: Number(formatted.day) }
}

export function getAmsterdamDateTimeParts(value: Date): LocalDateTimeParts {
  const formatted = parts(dateTimeFormatter, value)
  return { year: Number(formatted.year), month: Number(formatted.month), day: Number(formatted.day), hour: Number(formatted.hour), minute: Number(formatted.minute) }
}

export function formatAmsterdamDate(value: Date, locale = 'nl-NL'): string {
  return new Intl.DateTimeFormat(locale, { timeZone: BUSINESS_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short' }).format(value)
}

export function formatAmsterdamTime(value: Date, locale = 'nl-NL'): string {
  return new Intl.DateTimeFormat(locale, { timeZone: BUSINESS_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value)
}

export function formatAmsterdamDateKey(value: Date): string {
  const { year, month, day } = getAmsterdamDateParts(value)
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function localPartsAsUtc(parts: LocalDateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
}

function offsetAt(instant: Date): number {
  const local = getAmsterdamDateTimeParts(instant)
  return localPartsAsUtc(local) - instant.getTime()
}

export function parseAmsterdamLocal(date: string, time: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time)
  if (!dateMatch || !timeMatch) return null

  const local: LocalDateTimeParts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  }
  const localAsUtc = localPartsAsUtc(local)
  const candidates = new Set<number>()
  for (let hour = -36; hour <= 36; hour += 1) {
    const probe = new Date(localAsUtc + hour * 60 * 60 * 1000)
    const candidate = localAsUtc - offsetAt(probe)
    if (getAmsterdamDateTimeParts(new Date(candidate)).year === local.year
      && getAmsterdamDateTimeParts(new Date(candidate)).month === local.month
      && getAmsterdamDateTimeParts(new Date(candidate)).day === local.day
      && getAmsterdamDateTimeParts(new Date(candidate)).hour === local.hour
      && getAmsterdamDateTimeParts(new Date(candidate)).minute === local.minute) {
      candidates.add(candidate)
    }
  }
  if (candidates.size === 0) return null
  return new Date(Math.min(...candidates))
}

export function addCalendarDays(date: string, amount: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error('Invalid calendar date.')
  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + amount))
  return `${value.getUTCFullYear().toString().padStart(4, '0')}-${(value.getUTCMonth() + 1).toString().padStart(2, '0')}-${value.getUTCDate().toString().padStart(2, '0')}`
}

export function getAmsterdamWeekday(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error('Invalid calendar date.')
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)).getUTCDay()
}

export function getAmsterdamDayBounds(date: string): { start: Date; end: Date } | null {
  const next = addCalendarDays(date, 1)
  const start = parseAmsterdamLocal(date, '00:00')
  const end = parseAmsterdamLocal(next, '00:00')
  return start && end ? { start, end } : null
}
