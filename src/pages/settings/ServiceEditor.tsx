import { useState } from 'react'
import { X } from 'lucide-react'
import type { Service, ServiceEditorValue } from './types'
import { formatCentsAsEuro, parseEuroToCents } from '../../services/price'

type Props = {
  service?: Service
  onClose: () => void
  onSubmit: (value: ServiceEditorValue) => Promise<string | null>
}

export function ServiceEditor({ service, onClose, onSubmit }: Props) {
  const [name, setName] = useState(service?.name ?? '')
  const [description, setDescription] = useState(service?.description ?? '')
  const [duration, setDuration] = useState(service ? String(service.durationMinutes) : '')
  const [price, setPrice] = useState(service ? formatCentsAsEuro(service.priceCents) : '')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setError('')
    if (!name.trim()) return setError('Vul een naam in.')
    if (!description.trim()) return setError('Vul een beschrijving in.')
    const durationMinutes = Number(duration)
    if (!duration.trim() || !Number.isInteger(durationMinutes) || durationMinutes < 1) return setError('Duur moet minstens 1 minuut zijn.')
    const priceCents = parseEuroToCents(price)
    if (!price.trim()) return setError('Vul een prijs in.')
    if (priceCents === null) return setError('Prijs moet een geldig bedrag in euro\'s zijn, bijvoorbeeld 35 of 35,50.')
    setSubmitting(true)
    const message = await onSubmit({ name: name.trim(), description: description.trim(), durationMinutes, priceCents })
    setSubmitting(false)
    if (message) setError(message)
    else onClose()
  }

  return <div className="modal-backdrop">
    <section className="appointment-form" role="dialog" aria-modal="true" aria-labelledby="service-editor-title" tabIndex={-1} autoFocus onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
      <div className="modal-heading">
        <div><p className="eyebrow">DIENST</p><h2 id="service-editor-title">{service ? 'Dienst bewerken' : 'Dienst toevoegen'}</h2></div>
        <button onClick={onClose} aria-label="Sluiten"><X /></button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <label>Naam<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Beschrijving<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <div className="form-row">
        <label>Duur in minuten<input type="number" min="1" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
        <label>Prijs in euro's<div className="price-input"><span aria-hidden="true">€</span><input type="text" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} /></div></label>
      </div>
      <div className="modal-actions">
        <button className="cancel-modal" onClick={onClose}>Annuleren</button>
        <button className="button" onClick={() => void submit()} disabled={submitting}>{submitting ? 'Bezig...' : 'Opslaan'}</button>
      </div>
    </section>
  </div>
}
