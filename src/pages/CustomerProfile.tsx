import { LogOut, UserRound } from 'lucide-react'
import { BottomNav } from '../components/BottomNav'
import { Card } from '../components/Card'
import { CustomerHeader } from '../components/CustomerHeader'
import { useAuth } from '../auth/AuthContext'
export function CustomerProfile() { const { signOut } = useAuth(); return <main className="page shell profile-page"><CustomerHeader /><p className="eyebrow">MIJN ACCOUNT</p><h1 className="staff-title">Mijn<br /><em>profiel.</em></h1><Card className="profile-card"><UserRound /><div><b>Daan Jansen</b><small>Klant bij Centro Kapper</small></div></Card><button className="logout-button" onClick={signOut}><LogOut size={17} /> Uitloggen</button><BottomNav /></main> }
