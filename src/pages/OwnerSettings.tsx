import { LogOut } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { OwnerBottomNav } from '../components/OwnerBottomNav'
import logo from '../assets/logo_centro_kapper.jpeg'
import { OwnerSettingsSections } from './OwnerSettingsSections'

export function OwnerSettings() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  const logout = async () => { setLoggingOut(true); await signOut(); await navigate({ to: '/login', replace: true }) }

  return <main className="page shell staff-page owner-settings-page">
    <header className="topbar"><div className="brand"><img src={logo} alt="Centro Kapper" /><span>Centro <b>Kapper</b></span></div><span className="staff-label">EIGENAAR</span></header>
    <p className="eyebrow">Instellingen</p>
    <h1 className="staff-title">Beheer je<br /><em>salon</em></h1>
    <p className="lead">Beheer je saloninformatie, boekingen, openingstijden en diensten.</p>
    <OwnerSettingsSections />
    <button className="logout-button" onClick={() => void logout()} disabled={loggingOut}><LogOut size={17} aria-hidden="true" /> {loggingOut ? 'Bezig...' : 'Uitloggen'}</button>
    <OwnerBottomNav />
  </main>
}
