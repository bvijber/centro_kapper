/**
 * Gedeelde timerketen voor automatisch verversen.
 *
 * De scheduler regelt alleen de timing: hooguit één lopende load, geen
 * parallelle timers, exponentiële back-off bij fouten, pauze bij een
 * verborgen tabblad en stop zodra `shouldContinue` faalt. Data en state
 * blijven bij de caller.
 *
 * De bestaande wachtrijpolling gebruikt deze implementatie; de klantflow
 * zelf verandert daarbij niet.
 */

type TimeoutFn = (fn: () => void, ms: number) => unknown
type ClearTimeoutFn = (id: unknown) => void

function defaultSetTimeout(fn: () => void, ms: number): unknown {
  return setTimeout(fn, ms)
}

function defaultClearTimeout(id: unknown): void {
  clearTimeout(id as ReturnType<typeof setTimeout>)
}

export const POLL_BASE_INTERVAL_MS = 12_000
export const POLL_MAX_INTERVAL_MS = 120_000

/** Basisinterval 12s, verdubbelend bij fouten tot maximaal 120s. */
export function pollDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return POLL_BASE_INTERVAL_MS
  return Math.min(POLL_MAX_INTERVAL_MS, POLL_BASE_INTERVAL_MS * 2 ** consecutiveFailures)
}

export type PollSchedulerDeps = {
  setTimeoutFn?: TimeoutFn
  clearTimeoutFn?: ClearTimeoutFn
  isTabVisible?: () => boolean
  subscribeVisibility?: (listener: () => void) => () => void
}

function defaultIsTabVisible(): boolean {
  return typeof document === 'undefined' || !document.hidden
}

function defaultSubscribeVisibility(listener: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}

export class PollScheduler {
  private timer: unknown = null
  private inFlight = false
  private failures = 0
  private running = false
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly options: {
      load: () => Promise<void>
      shouldContinue: () => boolean
      baseIntervalMs?: number
    } & PollSchedulerDeps,
  ) {}

  get consecutiveFailures(): number {
    return this.failures
  }

  get isRunning(): boolean {
    return this.running
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.unsubscribe = (this.options.subscribeVisibility ?? defaultSubscribeVisibility)(() => {
      if ((this.options.isTabVisible ?? defaultIsTabVisible)() && this.running) void this.tick()
    })
    this.schedule(this.options.baseIntervalMs ?? POLL_BASE_INTERVAL_MS)
  }

  stop(): void {
    this.running = false
    if (this.timer !== null) {
      ;(this.options.clearTimeoutFn ?? defaultClearTimeout)(this.timer)
      this.timer = null
    }
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  refreshNow(): void {
    void this.tick()
  }

  private schedule(delayMs: number): void {
    if (this.timer !== null) {
      ;(this.options.clearTimeoutFn ?? defaultClearTimeout)(this.timer)
      this.timer = null
    }
    if (!this.running) return
    this.timer = (this.options.setTimeoutFn ?? defaultSetTimeout)(() => void this.tick(), delayMs)
  }

  private async tick(): Promise<void> {
    if (!this.running || this.inFlight) return
    if (!this.options.shouldContinue()) {
      this.stop()
      return
    }
    if (!(this.options.isTabVisible ?? defaultIsTabVisible)()) {
      this.schedule(this.options.baseIntervalMs ?? POLL_BASE_INTERVAL_MS)
      return
    }
    this.inFlight = true
    try {
      await this.options.load()
      this.failures = 0
    } catch {
      this.failures += 1
    } finally {
      this.inFlight = false
      if (!this.running) return
      if (!this.options.shouldContinue()) {
        this.stop()
        return
      }
      this.schedule(pollDelayMs(this.failures))
    }
  }
}
