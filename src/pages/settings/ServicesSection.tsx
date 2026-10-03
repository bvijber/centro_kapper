import { useState } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { ServiceEditor } from './ServiceEditor'
import { ServiceListItem } from './ServiceListItem'
import type { Service, ServiceEditorValue } from './types'

type Props = {
  services: Service[]
  saving: boolean
  onSave: (value: ServiceEditorValue, serviceId?: string) => Promise<string | null>
  onToggle: (service: Service) => void
}

export function ServicesSection({ services, saving, onSave, onToggle }: Props) {
  const [editor, setEditor] = useState<{ mode: 'create' } | { mode: 'edit'; service: Service } | null>(null)

  const submit = async (value: ServiceEditorValue) => {
    return onSave(value, editor?.mode === 'edit' ? editor.service.id : undefined)
  }

  return <>
    <Card className="owner-settings-section">
      <p className="eyebrow">DIENSTEN</p>
      {services.length === 0
        ? <p className="settings-empty">Nog geen diensten.</p>
        : services.map((service) => (
          <ServiceListItem
            key={service.id}
            service={service}
            saving={saving}
            onEdit={() => setEditor({ mode: 'edit', service })}
            onToggle={() => onToggle(service)}
          />
        ))}
      <Button onClick={() => setEditor({ mode: 'create' })} disabled={saving}>Dienst toevoegen</Button>
    </Card>
    {editor && (
      <ServiceEditor
        service={editor.mode === 'edit' ? editor.service : undefined}
        onClose={() => setEditor(null)}
        onSubmit={submit}
      />
    )}
  </>
}
