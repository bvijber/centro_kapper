import { useState } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { BUSINESS_TIMEZONE, formatAmsterdamTime, parseAmsterdamLocal } from '../../timezone'
import { BlockEditor } from './BlockEditor'
import { BreakEditor } from './BreakEditor'
import type { BreakPeriod, WholeDayBlock } from './types'

type Props = {
  breaks: BreakPeriod[]
  blocks: WholeDayBlock[]
  saving: boolean
  onCreateBreak: (input: { startsAt: Date; endsAt: Date }) => Promise<string | null>
  onCreateBlock: (input: { blockDate: string }) => Promise<string | null>
  onDeleteBreak: (id: string) => void
  onDeleteBlock: (id: string) => void
}

const weekdayFormat = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', timeZone: BUSINESS_TIMEZONE })
const blockDateFormat = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: BUSINESS_TIMEZONE })

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function breakLabel(item: BreakPeriod): string {
  return `${capitalize(weekdayFormat.format(item.startsAt))} · ${formatAmsterdamTime(item.startsAt)}–${formatAmsterdamTime(item.endsAt)}`
}

function blockLabel(item: WholeDayBlock): string {
  const date = parseAmsterdamLocal(item.blockDate, '00:00')
  return date ? capitalize(blockDateFormat.format(date)) : item.blockDate
}

export function BreaksAndBlocksSection({ breaks, blocks, saving, onCreateBreak, onCreateBlock, onDeleteBreak, onDeleteBlock }: Props) {
  const [editor, setEditor] = useState<'break' | 'block' | null>(null)

  return <>
    <Card className="owner-settings-section owner-settings-lists">
      <p className="eyebrow">PAUZES EN BLOKKADES</p>
      <div className="settings-group-title"><h3>Pauzes</h3></div>
      {breaks.length === 0 ? <p className="settings-empty">Nog geen pauzes.</p> : breaks.map((item) => (
        <div className="settings-item" key={item.id}>
          <div><b>{breakLabel(item)}</b></div>
          <button type="button" disabled={saving} onClick={() => onDeleteBreak(item.id)}>Verwijderen</button>
        </div>
      ))}
      <Button onClick={() => setEditor('break')} disabled={saving}>Pauze toevoegen</Button>
      <div className="settings-group-title"><h3>Blokkades</h3></div>
      {blocks.length === 0 ? <p className="settings-empty">Nog geen geblokkeerde dagen.</p> : blocks.map((item) => (
        <div className="settings-item" key={item.id}>
          <div><b>{blockLabel(item)}</b></div>
          <button type="button" disabled={saving} onClick={() => onDeleteBlock(item.id)}>Verwijderen</button>
        </div>
      ))}
      <Button onClick={() => setEditor('block')} disabled={saving}>Dag blokkeren</Button>
    </Card>
    {editor === 'break' && <BreakEditor onClose={() => setEditor(null)} onSubmit={onCreateBreak} />}
    {editor === 'block' && <BlockEditor onClose={() => setEditor(null)} onSubmit={onCreateBlock} />}
  </>
}
