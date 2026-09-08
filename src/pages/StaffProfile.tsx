import { LogOut, Scissors } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { StaffProfileDTO } from '../profiles/profiles.service.server'
import { getMyStaffProfileFn, updateMyStaffProfileFn } from '../profiles/profiles.functions'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { StaffBottomNav } from '../components/StaffBottomNav'

function errorMessage(caught: unknown): string {
  return String(caught).replace(/^Error:\s*/, '')
}

export function StaffProfile() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<StaffProfileDTO | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getMyStaffProfileFn()
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
    await signOut()
    await navigate({ to: '/login', replace: true })
  }

  const save = async () => {
    setError('')
    setSuccess('')
    if (!displayName.trim() || !phone.trim()) return setError('Vul je naam en telefoonnummer in.')
    setSaving(true)
    try {
      const result = await updateMyStaffProfileFn({ data: { displayName: displayName.trim(), phone: phone.trim() } })
      setProfile(result)
      setSuccess('Profiel bijgewerkt.')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return <main className="page shell profile-page">
    <header className="topbar"><div className="brand"><span>Centro <b>Kapper</b></span></div></header>
    <p className="eyebrow">TEAMPROFIEL</p>
    <h1 className="staff-title">Centro Kapper<br /><em>team.</em></h1>
    {error && <p className="form-error" role="alert">{error}</p>}
    {success && <p className="success-message" role="status">{success}</p>}
    {loading ? <p className="lead">Bezig met laden...</p> : (
      <>
        <Card className="profile-card">
          <Scissors />
          <div><b>{profile?.displayName}</b><small>Barber & eigenaar · {profile?.email}</small></div>
        </Card>
        <Card className="profile-form">
          <label>Naam *<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label>Telefoonnummer *<input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" /></label>
          <Button onClick={() => void save()} disabled={saving}>{saving ? 'Bezig...' : 'Profiel opslaan'}</Button>
        </Card>
      </>
    )}
    <button className="logout-button" onClick={() => void logout()}><LogOut size={17} /> Uitloggen</button>
    <StaffBottomNav />
  </main>
}
