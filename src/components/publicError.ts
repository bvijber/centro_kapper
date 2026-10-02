export function publicErrorMessage(error: unknown, fallback = 'Er ging iets mis. Probeer het opnieuw.'): string {
  const message = error instanceof Error ? error.message : ''
  if (!message || /sql|database|stack|undefined|internal|drizzle|postgres/i.test(message)) return fallback
  return message.length <= 180 ? message : fallback
}
