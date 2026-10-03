import { CalendarDays, ChevronRight, Clock3, LayoutDashboard, LogOut, Settings, UserRound } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { OwnerProfileDTO } from '../profiles/profiles.service.server'
import { getMyOwnerProfileFn, updateMyOwnerProfileFn } from '../profiles/profiles.functions'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { OwnerBottomNav } from '../components/OwnerBottomNav'
import { publicErrorMessage } from '../components/publicError'
import logo from '../assets/logo_centro_kapper.jpeg'

function errorMessage(caught: unknown): string {
  return publicErrorMessage(caught)
}

export function OwnerProfile() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<OwnerProfileDTO | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getMyOwnerProfileFn()
      setProfile(result)
      setDisplayName(result.displayName)
      setPhone(result.phone)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const logout = async () => {
    setLoggingOut(true)
    await signOut()
    await navigate({ to: '/login', replace: true })
  }

  const save = async () => {
    setError('')
    setSuccess('')
    if (!displayName.trim() || !phone.trim()) return setError('Vul je naam en telefoonnummer in.')
    setSaving(true)
    try {
      const result = await updateMyOwnerProfileFn({ data: { displayName: displayName.trim(), phone: phone.trim() } })
      setProfile(result)
      setSuccess('Profiel bijgewerkt.')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return <main className="page shell profile-page owner-profile-page">
    <header className="topbar"><div className="brand"><img src={logo} alt="Centro Kapper" /><span>Centro <b>Kapper</b></span></div><span className="staff-label">EIGENAAR</span></header>
    <p className="eyebrow">Profiel</p>
    <h1 className="staff-title">Beheer je<br /><em>account en salon</em></h1>
    {error && <p className="form-error" role="alert">{error}</p>}
    {success && <p className="success-message" role="status">{success}</p>}
    {loading ? <p className="lead">Bezig met laden...</p> : (
      <>
        <Card className="profile-card">
          <UserRound />
          <div><b>{profile?.displayName}</b><small>Eigenaar · {profile?.email}</small></div>
        </Card>
        <Card className="profile-form">
          <label>Naam *<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label>Telefoonnummer *<input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" /></label>
          <Button onClick={() => void save()} disabled={saving}>{saving ? 'Bezig...' : 'Profiel opslaan'}</Button>
        </Card>
      </>
    )}
    <section className="owner-profile-nav">
      <div className="section-heading"><h2>Beheer</h2></div>
      <Link className="staff-link" to="/owner"><Card><LayoutDashboard /><div><b>Dashboard</b><small>Omzet, vandaag en verzoeken</small></div><ChevronRight /></Card></Link>
      <Link className="staff-link" to="/owner/appointments"><Card><CalendarDays /><div><b>Afspraken</b><small>Plan en beheer afspraken</small></div><ChevronRight /></Card></Link>
      <Link className="staff-link" to="/owner/queue"><Card><Clock3 /><div><b>Wachtrij</b><small>Beheer de actieve wachtrij</small></div><ChevronRight /></Card></Link>
      <Link className="staff-link" to="/owner/settings"><Card><Settings /><div><b>Salon &amp; instellingen</b><small>Diensten, tijden en salon</small></div><ChevronRight /></Card></Link>
    </section>
    <button className="logout-button" onClick={() => void logout()} disabled={loggingOut}><LogOut size={17} aria-hidden="true" /> {loggingOut ? 'Bezig...' : 'Uitloggen'}</button>
    <OwnerBottomNav />
  </main>
}
