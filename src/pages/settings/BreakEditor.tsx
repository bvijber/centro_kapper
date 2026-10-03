import { useState } from 'react'
import { X } from 'lucide-react'
import { parseAmsterdamLocal } from '../../timezone'

type Props = {
  onClose: () => void
  onSubmit: (input: { startsAt: Date; endsAt: Date }) => Promise<string | null>
}

export function BreakEditor({ onClose, onSubmit }: Props) {
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setError('')
    const startsAt = parseAmsterdamLocal(startDate, startTime)
    const endsAt = parseAmsterdamLocal(endDate, endTime)
    if (!startsAt || !endsAt) return setError('Vul een geldige datum en tijd in.')
    if (endsAt <= startsAt) return setError('Het einde moet na het begin liggen.')
    setSubmitting(true)
    const message = await onSubmit({ startsAt, endsAt })
    setSubmitting(false)
    if (message) setError(message)
    else onClose()
  }

  return <div className="modal-backdrop">
    <section className="appointment-form" role="dialog" aria-modal="true" aria-labelledby="break-editor-title" tabIndex={-1} autoFocus onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
      <div className="modal-heading">
        <div><p className="eyebrow">PAUZE</p><h2 id="break-editor-title">Pauze toevoegen</h2></div>
        <button onClick={onClose} aria-label="Sluiten"><X /></button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-row">
        <label>Van<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label>Tijd<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
      </div>
      <div className="form-row">
        <label>Tot<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        <label>Tijd<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
      </div>
      <div className="modal-actions">
        <button className="cancel-modal" onClick={onClose}>Annuleren</button>
        <button className="button" onClick={() => void submit()} disabled={submitting}>{submitting ? 'Bezig...' : 'Toevoegen'}</button>
      </div>
    </section>
  </div>
}
