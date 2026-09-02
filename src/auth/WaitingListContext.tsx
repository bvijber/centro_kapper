import { createContext, useContext, useState, type ReactNode } from 'react'

export type WaitingStatus = 'Wachtend' | 'Geaccepteerd' | 'Aan de beurt' | 'Geweigerd' | 'Afgerond'
export type WaitingEntry = { id: number; customer: string; phone: string; service: string; note?: string; joinedAt: string; status: WaitingStatus }
type WaitingListValue = { entries: WaitingEntry[]; customerEntry: WaitingEntry | undefined; join: (service: string, note: string) => void; leave: (id: number) => void; update: (id: number, status: WaitingStatus) => void }
const WaitingListContext = createContext<WaitingListValue | undefined>(undefined)
const initialEntries: WaitingEntry[] = [
  { id: 201, customer: 'Noah Smit', phone: '+31 6 23 45 67 89', service: 'Knippen + baard', joinedAt: '10:14', status: 'Wachtend' },
  { id: 202, customer: 'Finn de Boer', phone: '+31 6 34 56 78 90', service: 'Baard trimmen', joinedAt: '10:21', status: 'Geaccepteerd' },
]
export function WaitingListProvider({ children }: { children: ReactNode }) { const [entries, setEntries] = useState(initialEntries); const customerEntry = entries.find(entry => entry.id === 999); const join = (service: string, note: string) => setEntries(current => [...current, { id: 999, customer: 'Daan Jansen', phone: '+31 6 12 34 56 78', service, note: note || undefined, joinedAt: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }), status: 'Wachtend' }]); const leave = (id: number) => setEntries(current => current.filter(entry => entry.id !== id)); const update = (id: number, status: WaitingStatus) => setEntries(current => current.map(entry => entry.id === id ? { ...entry, status } : entry)); return <WaitingListContext.Provider value={{ entries, customerEntry, join, leave, update }}>{children}</WaitingListContext.Provider> }
export function useWaitingList() { const context = useContext(WaitingListContext); if (!context) throw new Error('useWaitingList must be used within WaitingListProvider'); return context }
