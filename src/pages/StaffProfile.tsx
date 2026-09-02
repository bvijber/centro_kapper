import { LogOut, Scissors } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useNavigate } from '@tanstack/react-router'
import { Card } from '../components/Card'
import { StaffBottomNav } from '../components/StaffBottomNav'
export function StaffProfile() { const { user, signOut } = useAuth(); const navigate = useNavigate(); const logout = async () => { await signOut(); await navigate({ to: '/login', replace: true }) }; return <main className="page shell profile-page"><header className="topbar"><div className="brand"><span>Centro <b>Kapper</b></span></div></header><p className="eyebrow">TEAMPROFIEL</p><h1 className="staff-title">Centro Kapper<br /><em>team.</em></h1><Card className="profile-card"><Scissors /><div><b>{user?.name}</b><small>Barber & eigenaar</small></div></Card><button className="logout-button" onClick={() => void logout()}><LogOut size={17} /> Uitloggen</button><StaffBottomNav /></main> }
