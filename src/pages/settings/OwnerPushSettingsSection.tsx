import { useEffect, useState } from 'react'

import { Card } from '../../components/Card'
import { OwnerPushOptIn } from '../../components/OwnerPushOptIn'
import { publicErrorMessage } from '../../components/publicError'
import {
  listOwnerPushSubscriptionsFn,
  unregisterOwnerPushSubscriptionFn,
} from '../../push/owner-push.functions'

type Device = { id: string; label: string; active: boolean; createdAt: string }

/**
 * Instellingensectie voor de pushmeldingen van de eigenaar
 * (BUSINESS_RULES.md §29 "Eigenaarpush").
 *
 * Push is per apparaat te schakelen. De lijst toont de eigen apparaten van de
 * eigenaar zonder endpoints; het uitschakelen van één apparaat heeft geen
 * invloed op de andere apparaten. De interne notificatiebel blijft altijd
 * beschikbaar.
 */
export function OwnerPushSettingsSection() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const rows = await listOwnerPushSubscriptionsFn()
      setDevices(rows)
      setError('')
    } catch (caught) {
      setError(publicErrorMessage(caught, 'De apparaten konden niet worden geladen.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const disableDevice = async (id: string) => {
    setBusyId(id)
    setError('')
    try {
      await unregisterOwnerPushSubscriptionFn({ data: { id } })
      await load()
    } catch (caught) {
      setError(publicErrorMessage(caught, 'Het apparaat kon niet worden uitgeschakeld.'))
    } finally {
      setBusyId(null)
    }
  }

  return <Card className="owner-settings-section">
    <p className="eyebrow">PUSHMELDINGEN</p>
    <p className="queue-explanation">Ontvang een melding op je eigen apparaten. Meldingen bevatten geen klantgegevens; de details bekijk je in de notificatiebel.</p>
    <OwnerPushOptIn onChanged={() => void load()} />
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loading && devices.length > 0 && <>
      <div className="settings-group-title"><h3>Apparaten</h3></div>
      {devices.map((device) => <div key={device.id} className="settings-item">
        <b>{device.label}{device.active ? '' : ' · uitgeschakeld'}</b>
        {device.active && <button type="button" disabled={busyId === device.id} onClick={() => void disableDevice(device.id)}>
          {busyId === device.id ? 'Bezig...' : 'Uitschakelen'}
        </button>}
      </div>)}
    </>}
  </Card>
}
