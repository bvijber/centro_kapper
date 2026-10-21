import { Bell, CheckCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

import {
  getOwnerNotificationsFn,
  markAllOwnerNotificationsReadFn,
  markOwnerNotificationReadFn,
} from '../notifications/owner-notification.functions'
import { formatNotificationTimestamp, ownerNotificationTarget } from '../notifications/owner-notification.presentation'
import {
  OWNER_NOTIFICATION_STREAM_PATH,
  mergeOwnerNotifications,
} from '../notifications/owner-notification.stream'
import { OwnerNotificationStreamClient } from '../notifications/owner-notification.stream-connection'
import type { OwnerNotificationDTO } from '../notifications/owner-notification.service.server'
import { PollScheduler } from '../polling/poll-scheduler'
import { publicErrorMessage } from './publicError'

/** Terugvalinterval wanneer de SSE-verbinding niet beschikbaar is. */
const BELL_POLL_INTERVAL_MS = 30_000

/**
 * Interne notificatiebel voor de eigenaar (BUSINESS_RULES.md §29).
 *
 * De bel ontvangt updates via een SSE-stroom en haalt de meldingen zelf op
 * via de bestaande beveiligde Server Functions. Wanneer de stream niet
 * beschikbaar is, valt de bel terug op polling. De teller en de leesstatus
 * komen server-side; de UI leidt ze niet client-side af.
 */
export function OwnerNotificationBell() {
  const [items, setItems] = useState<OwnerNotificationDTO[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const mountedRef = useRef(true)
  const requestIdRef = useRef(0)
  const navigate = useNavigate()

  const load = useCallback(async (): Promise<void> => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    try {
      const result = await getOwnerNotificationsFn()
      // Alleen de meest recente aanroep mag de state bijwerken; zo kan een
      // oudere reactie de lijst niet terugzetten.
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      setItems(mergeOwnerNotifications(result.items))
      setUnread(result.unread)
      setError('')
    } catch (caught) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      setError(publicErrorMessage(caught, 'Meldingen konden niet worden geladen.'))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void load()

    // Terugval: de polling draait alleen wanneer de stroom niet beschikbaar is.
    const fallback = new PollScheduler({
      load: () => load(),
      shouldContinue: () => mountedRef.current,
      baseIntervalMs: BELL_POLL_INTERVAL_MS,
    })

    const stream = new OwnerNotificationStreamClient({
      path: OWNER_NOTIFICATION_STREAM_PATH,
      onConnected: () => {
        fallback.stop()
        // Na een (her)verbinding de meldingen opnieuw ophalen: gemiste
        // updates worden zo alsnog teruggevonden.
        void load()
      },
      onDisconnected: () => {
        fallback.start()
        fallback.refreshNow()
      },
      onNotification: () => {
        void load()
      },
    })
    stream.start()

    return () => {
      mountedRef.current = false
      stream.stop()
      fallback.stop()
    }
  }, [load])

  const openNotification = async (item: OwnerNotificationDTO): Promise<void> => {
    if (!item.read) {
      try {
        await markOwnerNotificationReadFn({ data: { id: item.id } })
      } catch {
        // Het markeren als gelezen mag de navigatie niet blokkeren.
      }
    }
    setOpen(false)
    if (ownerNotificationTarget(item.event) === '/owner/queue') {
      navigate({ to: '/owner/queue' })
    } else {
      navigate({ to: '/owner/appointments' })
    }
    void load()
  }

  const markAllRead = async (): Promise<void> => {
    try {
      await markAllOwnerNotificationsReadFn()
      setUnread(0)
      setItems((current) => current.map((item) => ({ ...item, read: true })))
      setError('')
    } catch (caught) {
      setError(publicErrorMessage(caught, 'Meldingen konden niet als gelezen worden gemarkeerd.'))
    }
  }

  return (
    <div className="owner-notifications">
      <button
        type="button"
        className="notification-bell"
        aria-label={unread > 0 ? `Meldingen, ${unread} ongelezen` : 'Meldingen'}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={22} aria-hidden="true" />
        {unread > 0 && <span className="notification-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {unread > 0 ? `${unread} ongelezen meldingen` : 'Geen ongelezen meldingen'}
      </span>
      {open && (
        <div className="notification-panel" role="group" aria-label="Meldingen">
          <div className="notification-panel-header">
            <p className="eyebrow">MELDINGEN</p>
            {unread > 0 && (
              <button type="button" className="notification-mark-all" onClick={() => void markAllRead()}>
                <CheckCheck size={15} aria-hidden="true" /> Alles gelezen
              </button>
            )}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {loading ? (
            <p className="lead">Meldingen laden...</p>
          ) : items.length === 0 ? (
            <p className="queue-explanation">Er zijn geen meldingen.</p>
          ) : (
            <ul className="notification-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notification-item${item.read ? '' : ' unread'}`}
                    onClick={() => void openNotification(item)}
                  >
                    <span className="notification-item-title">{item.title}</span>
                    <span className="notification-item-body">{item.body}</span>
                    <span className="notification-item-time">{formatNotificationTimestamp(item.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
