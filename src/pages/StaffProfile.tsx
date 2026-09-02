import { LogOut, Scissors } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { StaffBottomNav } from '../components/StaffBottomNav'
export function StaffProfile() { const { signOut } = useAuth(); return <main className="page shell profile-page"><header className="topbar"><div className="brand"><span>Centro <b>Kapper</b></span></div></header><p className="eyebrow">TEAMPROFIEL</p><h1 className="staff-title">Centro Kapper<br /><em>team.</em></h1><Card className="profile-card"><Scissors /><div><b>Sam Vermeer</b><small>Barber & eigenaar</small></div></Card><button className="logout-button" onClick={signOut}><LogOut size={17} /> Uitloggen</button><StaffBottomNav /></main> }
