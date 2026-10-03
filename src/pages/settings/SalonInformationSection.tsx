import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import type { BusinessProfile } from './types'

type Props = {
  profile: BusinessProfile
  onChange: (next: BusinessProfile) => void
  saving: boolean
  onSave: () => void
}

export function SalonInformationSection({ profile, onChange, saving, onSave }: Props) {
  return <Card className="owner-settings-section">
    <p className="eyebrow">SALONINFORMATIE</p>
    <label>Naam<input value={profile.name} onChange={(event) => onChange({ ...profile, name: event.target.value })} /></label>
    <label>Adres<input value={profile.address} onChange={(event) => onChange({ ...profile, address: event.target.value })} /></label>
    <label>Telefoon<input type="tel" value={profile.phone} onChange={(event) => onChange({ ...profile, phone: event.target.value })} /></label>
    <Button onClick={onSave} disabled={saving}>{saving ? 'Bezig...' : 'Opslaan'}</Button>
  </Card>
}
