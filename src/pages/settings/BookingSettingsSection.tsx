import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import type { BookingSettings } from './types'

type Props = {
  booking: BookingSettings
  onChange: (next: BookingSettings) => void
  saving: boolean
  onSave: () => void
}

function Choice({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: string }) {
  return <label className={checked ? 'selected' : ''}>
    <input type="radio" name={name} checked={checked} onChange={onChange} />
    {children}
  </label>
}

export function BookingSettingsSection({ booking, onChange, saving, onSave }: Props) {
  return <Card className="owner-settings-section">
    <p className="eyebrow">BOEKINGSINSTELLINGEN</p>
    <label>Buffer
      <span className="input-unit-row">
        <input type="number" min="0" value={booking.bufferMinutes} onChange={(event) => onChange({ ...booking, bufferMinutes: Number(event.target.value) })} />
        <span className="input-unit">minuten</span>
      </span>
    </label>
    <label>Annuleringstermijn
      <span className="input-unit-row">
        <input type="number" min="0" value={booking.cancellationDeadlineMinutes} onChange={(event) => onChange({ ...booking, cancellationDeadlineMinutes: Number(event.target.value) })} />
        <span className="input-unit">minuten</span>
      </span>
    </label>
    <div className="booking-choice-group">
      <span className="booking-choice-title" id="overlap-choice-label">Bij overlappende afspraken</span>
      <div className="booking-choices" role="radiogroup" aria-labelledby="overlap-choice-label">
        <Choice name="overlap-behavior" checked={booking.overlapBehavior === 'block'} onChange={() => onChange({ ...booking, overlapBehavior: 'block' })}>Blokkeren</Choice>
        <Choice name="overlap-behavior" checked={booking.overlapBehavior === 'allow_with_warning'} onChange={() => onChange({ ...booking, overlapBehavior: 'allow_with_warning' })}>Toestaan</Choice>
      </div>
      <p className="booking-choice-hint">Bij toestaan volgt een waarschuwing en moet je de afspraak expliciet bevestigen.</p>
    </div>
    <p className="booking-choice-hint">Een no-show geeft het tijdslot altijd automatisch vrij.</p>
    <Button onClick={onSave} disabled={saving}>{saving ? 'Bezig...' : 'Opslaan'}</Button>
  </Card>
}
