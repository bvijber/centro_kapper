import { LogOut, UserRound } from 'lucide-react'
import { BottomNav } from '../components/BottomNav'
import { Card } from '../components/Card'
import { CustomerHeader } from '../components/CustomerHeader'
import { useAuth } from '../auth/AuthContext'
import { useNavigate } from '@tanstack/react-router'
export function CustomerProfile() { const { user, signOut } = useAuth(); const navigate = useNavigate(); const logout = async () => { await signOut(); await navigate({ to: '/login', replace: true }) }; return <main className="page shell profile-page"><CustomerHeader /><p className="eyebrow">MIJN ACCOUNT</p><h1 className="staff-title">Mijn<br /><em>profiel.</em></h1><Card className="profile-card"><UserRound /><div><b>{user?.name}</b><small>Klant bij Centro Kapper</small></div></Card><button className="logout-button" onClick={() => void logout()}><LogOut size={17} /> Uitloggen</button><BottomNav /></main> }
