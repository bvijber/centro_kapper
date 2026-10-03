import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import type { OpeningHour } from './types'

type Props = {
  hours: OpeningHour[]
  onChange: (next: OpeningHour[]) => void
  saving: boolean
  onSave: () => void
}

const DAY_NAMES = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag']
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function OpeningHoursSection({ hours, onChange, saving, onSave }: Props) {
  const updateHour = (weekday: number, patch: Partial<OpeningHour>) => {
    onChange(hours.map((item) => item.weekday === weekday ? { ...item, ...patch } : item))
  }

  return <Card className="owner-settings-section">
    <p className="eyebrow">OPENINGSTIJDEN</p>
    <div className="hours-list">
      {DISPLAY_ORDER.map((weekday) => {
        const hour = hours.find((item) => item.weekday === weekday)
        if (!hour) return null
        const dayName = DAY_NAMES[weekday]
        const dayId = `opening-hours-day-${weekday}`
        const openingId = `opening-hours-open-${weekday}`
        const closingId = `opening-hours-close-${weekday}`
        return <div className="hours-row" key={weekday}>
          <label className="hours-day" htmlFor={dayId}>
            <input id={dayId} type="checkbox" checked={hour.isOpen} onChange={(event) => updateHour(weekday, { isOpen: event.target.checked })} />
            <span>{dayName}</span>
          </label>
          <div className="hours-times">
            <label className="visually-hidden" htmlFor={openingId}>Openingstijd {dayName}</label>
            <input id={openingId} type="time" value={hour.openingTime ?? ''} disabled={!hour.isOpen} onChange={(event) => updateHour(weekday, { openingTime: event.target.value })} />
            <span className="hours-sep" aria-hidden="true">–</span>
            <label className="visually-hidden" htmlFor={closingId}>Sluitingstijd {dayName}</label>
            <input id={closingId} type="time" value={hour.closingTime ?? ''} disabled={!hour.isOpen} onChange={(event) => updateHour(weekday, { closingTime: event.target.value })} />
          </div>
        </div>
      })}
    </div>
    <Button onClick={onSave} disabled={saving}>{saving ? 'Bezig...' : 'Openingstijden opslaan'}</Button>
  </Card>
}
