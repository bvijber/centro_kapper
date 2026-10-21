import { PollScheduler, type PollSchedulerDeps } from './poll-scheduler'

/**
 * Gedeelde logica voor automatische achtergrondverversing van paginadata.
 *
 * De logica is framework-onafhankelijk en daardoor zonder browser
 * uitvoerbaar te testen. `usePageRefresh` (`.ts`) koppelt hem aan React.
 *
 * Regels:
 * - de achtergrondverversing is altijd **stil**: hij raakt de laad- en
 *   foutstatus van de pagina niet, zodat bestaande inhoud zichtbaar blijft;
 * - er wordt alleen state toegepast wanneer de geladen inhoud daadwerkelijk
 *   is veranderd, zodat onnodige renders en flikkering worden voorkomen;
 * - alleen de meest recente load mag state toepassen; een oudere reactie
 *   overschrijft nooit nieuwere state;
 * - de bestaande `PollScheduler` regelt de timing: één lopende load,
 *   exponentiële back-off, pauze bij een verborgen tabblad en directe
 *   verversing bij zichtbaarheid.
 */

/**
 * Monotone tokens: alleen de meest recente load mag state toepassen.
 */
export function createRequestGuard(): { start: () => number; isCurrent: (id: number) => boolean } {
  let latest = 0
  return {
    start: () => {
      latest += 1
      return latest
    },
    isCurrent: (id: number) => id === latest,
  }
}

/**
 * Vergelijkt geladen gegevens op inhoud en niet op objectidentiteit, zodat
 * een ongewijzigde respons geen nieuwe render veroorzaakt.
 */
export function isRefreshEqual(previous: unknown, next: unknown): boolean {
  return JSON.stringify(previous) === JSON.stringify(next)
}

export type PageRefreshOptions<T> = {
  /** Haalt de actuele gegevens op via de bestaande Server Functions. */
  load: () => Promise<T>
  /** Past de gegevens toe; wordt alleen aangeroepen als de inhoud veranderde. */
  apply: (data: T) => void
  /** Zet de laadstatus; alleen gebruikt bij een interactieve lading. */
  setLoading?: (loading: boolean) => void
  /** Zet de foutmelding; alleen gebruikt bij een interactieve lading. */
  setError?: (message: string) => void
  /** Vertaalt een fout naar een publieke melding. */
  errorMessage?: (error: unknown) => string | undefined
  /** Terugvalmelding wanneer de fout niet vertaald kan worden. */
  fallbackErrorMessage?: string
  /** Interval tussen twee achtergrondverversingen. */
  intervalMs: number
  /** Stop de ververste wanneer de pagina niet meer relevant is. */
  shouldContinue?: () => boolean
  /** Injecteerbare timers en visibility-hook voor tests. */
  deps?: PollSchedulerDeps
}

/**
 * Automatische verversing van één gegevensbron op een pagina.
 *
 * `loadData()` is de stille laadactie en wordt door de scheduler gebruikt.
 * `loadInteractive()` is de laadactie die hoort bij een gebruikersactie: die
 * toont de laadstatus en vertaalt fouten voor de UI.
 */
export class PageRefresh<T> {
  private readonly scheduler: PollScheduler
  private readonly guard = createRequestGuard()
  private applied: T | null = null

  constructor(private readonly options: PageRefreshOptions<T>) {
    this.scheduler = new PollScheduler({
      load: async () => {
        await this.loadData()
      },
      shouldContinue: () => (this.options.shouldContinue ?? (() => true))(),
      baseIntervalMs: this.options.intervalMs,
      ...this.options.deps,
    })
  }

  /** De laatst toegepaste gegevens; `null` zolang er niets is toegepast. */
  get lastApplied(): T | null {
    return this.applied
  }

  get isRunning(): boolean {
    return this.scheduler.isRunning
  }

  /**
   * Haalt de gegevens op en past ze toe wanneer de inhoud veranderde.
   * Geeft `null` terug wanneer een nieuwere load deze al heeft vervangen.
   */
  async loadData(): Promise<T | null> {
    const id = this.guard.start()
    const data = await this.options.load()
    if (!this.guard.isCurrent(id)) return null
    this.applyIfChanged(data)
    return data
  }

  /**
   * Interactieve lading: toont de laadstatus en zet een publieke foutmelding.
   * Fouten worden niet doorgegooid; de pagina toont ze in de UI.
   */
  async loadInteractive(): Promise<void> {
    this.options.setLoading?.(true)
    try {
      await this.loadData()
    } catch (caught) {
      const message = this.options.errorMessage?.(caught) ?? this.options.fallbackErrorMessage
      if (message) this.options.setError?.(message)
    } finally {
      this.options.setLoading?.(false)
    }
  }

  start(): void {
    this.scheduler.start()
  }

  stop(): void {
    this.scheduler.stop()
  }

  refreshNow(): void {
    this.scheduler.refreshNow()
  }

  private applyIfChanged(data: T): void {
    if (this.applied !== null && isRefreshEqual(this.applied, data)) return
    this.applied = data
    this.options.apply(data)
  }
}
