import { formatPriceCents } from '../../appointments/appointment.presentation'
import type { Service } from './types'

type Props = {
  service: Service
  saving: boolean
  onEdit: () => void
  onToggle: () => void
}

export function ServiceListItem({ service, saving, onEdit, onToggle }: Props) {
  return <div className="service-list-item">
    <div className="service-list-head">
      <b>{service.name}</b>
      <span className={service.active ? 'service-status' : 'service-status inactive'}>{service.active ? 'Actief' : 'Inactief'}</span>
    </div>
    <p>{service.description}</p>
    <span className="service-list-meta">{service.durationMinutes} min · {formatPriceCents(service.priceCents)}</span>
    <div className="service-list-actions">
      <button type="button" disabled={saving} onClick={onEdit}>Bewerken</button>
      <button type="button" disabled={saving} onClick={onToggle}>{service.active ? 'Deactiveren' : 'Activeren'}</button>
    </div>
  </div>
}
