/**
 * Clientzijde beheer van de SSE-verbinding voor eigenaar-notificaties.
 *
 * Dit module is client-veilig (geen serverimports) en houdt de
 * verbindingslogica gescheiden van de component, zodat de werking te testen
 * is zonder browseromgeving.
 *
 * De verbinding is een signaal, geen bron van waarheid: bij het openen van de
 * verbinding en bij elke signaal haalt de client de meldingen opnieuw op via
 * de bestaande beveiligde Server Functions.
 */

import {
  OWNER_NOTIFICATION_STREAM_EVENT_HEARTBEAT,
  OWNER_NOTIFICATION_STREAM_EVENT_NOTIFICATION,
  OWNER_NOTIFICATION_STREAM_EVENT_READY,
  OWNER_NOTIFICATION_STREAM_PATH,
  isStreamStale,
  nextStreamRetryDelayMs,
} from './owner-notification.stream'

/** De minimale vorm van een EventSource die deze client nodig heeft. */
export type OwnerNotificationStreamSource = {
  onopen: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  addEventListener: (type: string, listener: () => void) => void
  close: () => void
}

export type OwnerNotificationStreamClientOptions = {
  path?: string
  /** De verbinding is tot stand gekomen. */
  onConnected?: () => void
  /** De verbinding is verbroken of niet beschikbaar; start de terugval. */
  onDisconnected?: () => void
  /** Er is mogelijk een nieuwe melding beschikbaar. */
  onNotification?: () => void
  /** Controleert periodiek of de stream nog leeft. */
  watchdogIntervalMs?: number
  createSource?: (path: string) => OwnerNotificationStreamSource
  setTimeoutFn?: (fn: () => void, ms: number) => unknown
  clearTimeoutFn?: (id: unknown) => void
  setIntervalFn?: (fn: () => void, ms: number) => unknown
  clearIntervalFn?: (id: unknown) => void
}

const DEFAULT_WATCHDOG_INTERVAL_MS = 10_000

export class OwnerNotificationStreamClient {
  private source: OwnerNotificationStreamSource | null = null
  private retryTimer: unknown = null
  private watchdogTimer: unknown = null
  private attempt = 0
  private lastSignalAt = 0
  private stopped = true

  constructor(private readonly options: OwnerNotificationStreamClientOptions = {}) {}

  get isConnected(): boolean {
    return this.source !== null
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.connect()
    const setIntervalFn = this.options.setIntervalFn ?? ((fn: () => void, ms: number) => setInterval(fn, ms))
    this.watchdogTimer = setIntervalFn(() => this.checkLiveness(), this.options.watchdogIntervalMs ?? DEFAULT_WATCHDOG_INTERVAL_MS)
  }

  stop(): void {
    this.stopped = true
    this.closeSource()
    if (this.retryTimer !== null) {
      const clearTimeoutFn = this.options.clearTimeoutFn ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>))
      clearTimeoutFn(this.retryTimer)
      this.retryTimer = null
    }
    if (this.watchdogTimer !== null) {
      const clearIntervalFn = this.options.clearIntervalFn ?? ((id: unknown) => clearInterval(id as ReturnType<typeof setInterval>))
      clearIntervalFn(this.watchdogTimer)
      this.watchdogTimer = null
    }
  }

  private closeSource(): void {
    if (!this.source) return
    this.source.close()
    this.source = null
  }

  private connect(): void {
    if (this.stopped) return
    const path = this.options.path ?? OWNER_NOTIFICATION_STREAM_PATH
    let source: OwnerNotificationStreamSource
    try {
      const createSource = this.options.createSource ?? ((target: string) => new EventSource(target) as unknown as OwnerNotificationStreamSource)
      source = createSource(path)
    } catch {
      this.options.onDisconnected?.()
      this.scheduleRetry()
      return
    }
    this.source = source

    source.onopen = () => {
      this.attempt = 0
      this.lastSignalAt = Date.now()
      this.options.onConnected?.()
    }
    source.addEventListener(OWNER_NOTIFICATION_STREAM_EVENT_READY, () => {
      this.lastSignalAt = Date.now()
    })
    source.addEventListener(OWNER_NOTIFICATION_STREAM_EVENT_HEARTBEAT, () => {
      this.lastSignalAt = Date.now()
    })
    source.addEventListener(OWNER_NOTIFICATION_STREAM_EVENT_NOTIFICATION, () => {
      this.lastSignalAt = Date.now()
      this.options.onNotification?.()
    })
    source.onerror = () => {
      this.lastSignalAt = Date.now()
      this.closeSource()
      this.options.onDisconnected?.()
      this.scheduleRetry()
    }
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer !== null) return
    const delay = nextStreamRetryDelayMs(this.attempt)
    this.attempt += 1
    const setTimeoutFn = this.options.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
    this.retryTimer = setTimeoutFn(() => {
      this.retryTimer = null
      this.connect()
    }, delay)
  }

  private checkLiveness(): void {
    if (this.stopped || !this.source) return
    if (!isStreamStale(this.lastSignalAt)) return
    this.closeSource()
    this.options.onDisconnected?.()
    this.scheduleRetry()
  }
}
