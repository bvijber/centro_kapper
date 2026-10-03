import { useState } from 'react'
import { X } from 'lucide-react'

type Props = {
  onClose: () => void
  onSubmit: (input: { blockDate: string }) => Promise<string | null>
}

export function BlockEditor({ onClose, onSubmit }: Props) {
  const [blockDate, setBlockDate] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setError('')
    if (!blockDate) return setError('Kies een datum.')
    setSubmitting(true)
    const message = await onSubmit({ blockDate })
    setSubmitting(false)
    if (message) setError(message)
    else onClose()
  }

  return <div className="modal-backdrop">
    <section className="appointment-form" role="dialog" aria-modal="true" aria-labelledby="block-editor-title" tabIndex={-1} autoFocus onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
      <div className="modal-heading">
        <div><p className="eyebrow">BLOKKADE</p><h2 id="block-editor-title">Dag blokkeren</h2></div>
        <button onClick={onClose} aria-label="Sluiten"><X /></button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <label>Datum<input type="date" value={blockDate} onChange={(event) => setBlockDate(event.target.value)} /></label>
      <p className="lead">Op deze dag kunnen geen afspraken worden geboekt.</p>
      <div className="modal-actions">
        <button className="cancel-modal" onClick={onClose}>Annuleren</button>
        <button className="button" onClick={() => void submit()} disabled={submitting}>{submitting ? 'Bezig...' : 'Blokkeren'}</button>
      </div>
    </section>
  </div>
}
