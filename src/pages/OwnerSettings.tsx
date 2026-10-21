import { LogOut } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { OwnerBottomNav } from '../components/OwnerBottomNav'
import { OwnerHeader } from '../components/OwnerHeader'
import { OwnerSettingsSections } from './OwnerSettingsSections'

export function OwnerSettings() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  const logout = async () => { setLoggingOut(true); await signOut(); await navigate({ to: '/login', replace: true }) }

  return <main className="page shell staff-page owner-settings-page">
    <OwnerHeader />
    <p className="eyebrow">Instellingen</p>
    <h1 className="staff-title">Beheer je<br /><em>salon</em></h1>
    <p className="lead">Beheer je saloninformatie, boekingen, openingstijden en diensten.</p>
    <OwnerSettingsSections />
    <button className="logout-button" onClick={() => void logout()} disabled={loggingOut}><LogOut size={17} aria-hidden="true" /> {loggingOut ? 'Bezig...' : 'Uitloggen'}</button>
    <OwnerBottomNav />
  </main>
}
