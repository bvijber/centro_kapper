import { CalendarDays, CheckCircle2, ChevronRight, Euro, Inbox, UsersRound } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { getStaffDashboardFn } from '../dashboard/dashboard.functions'
import type { StaffDashboardDTO } from '../dashboard/dashboard.service.server'
import logo from '../assets/logo_centro_kapper.jpeg'
import { StaffBottomNav } from '../components/StaffBottomNav'

function errorMessage(caught: unknown): string {
  return String(caught).replace(/^Error:\s*/, '')
}

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace('.', ',')}`

export function StaffDashboard() {
  const { user } = useAuth()
  const [metrics, setMetrics] = useState<StaffDashboardDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void getStaffDashboardFn()
      .then(setMetrics)
      .catch((caught) => setError(errorMessage(caught)))
      .finally(() => setLoading(false))
  }, [])

  const deltaText = metrics?.revenueDeltaPercent == null
    ? undefined
    : `${metrics.revenueDeltaPercent >= 0 ? '+' : ''}${metrics.revenueDeltaPercent}% ten opzichte van vorige maand`

  return <main className="page shell staff-page">
    <header className="topbar">
      <div className="brand"><img src={logo} alt="Centro Kapper" /><span>Centro <b>Kapper</b></span></div>
      <span className="staff-label">TEAM</span>
    </header>
    <p className="eyebrow">CENTRO KAPPER · BEHEER</p>
    <h1 className="staff-title">Goedemorgen,<br /><em>{user?.name}.</em></h1>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p className="lead">Bezig met laden...</p> : metrics && (
      <>
        <Card className="revenue-card">
          <span>OMZET DEZE MAAND</span>
          <strong>{euro(metrics.revenueThisMonthCents)}</strong>
          <small>{deltaText ?? 'Nog geen omzet deze maand'}</small>
          <Euro />
        </Card>
        <div className="metrics">
          <Card><CalendarDays /><span>Vandaag</span><strong>{metrics.appointmentsToday}</strong><small>afspraken</small></Card>
          <Card><CheckCircle2 /><span>Voltooid</span><strong>{metrics.completedToday}</strong><small>vandaag</small></Card>
          <Card><Inbox /><span>Verzoeken</span><strong>{metrics.pendingCancellationRequests}</strong><small>openstaand</small></Card>
          <Card><UsersRound /><span>Team</span><strong>{metrics.activeStaff}</strong><small>barber</small></Card>
        </div>
      </>
    )}
    {!loading && !error && metrics && (
      <Link className="staff-link" to="/staff/queue"><Card><UsersRound /><div><b>Wachtrij beheren</b><small>Beheer de actieve wachtrij</small></div><ChevronRight /></Card></Link>
    )}
    <StaffBottomNav />
  </main>
}
