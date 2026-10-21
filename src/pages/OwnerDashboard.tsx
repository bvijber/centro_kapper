import { CalendarDays, CheckCircle2, ChevronRight, Euro, Inbox, UsersRound } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/Card'
import { getOwnerDashboardFn } from '../dashboard/dashboard.functions'
import type { OwnerDashboardDTO } from '../dashboard/dashboard.service.server'
import { OwnerBottomNav } from '../components/OwnerBottomNav'
import { OwnerHeader } from '../components/OwnerHeader'
import { publicErrorMessage } from '../components/publicError'

function errorMessage(caught: unknown): string {
  return publicErrorMessage(caught)
}

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace('.', ',')}`

export function OwnerDashboard() {
  const { user } = useAuth()
  const [metrics, setMetrics] = useState<OwnerDashboardDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void getOwnerDashboardFn()
      .then(setMetrics)
      .catch((caught) => setError(errorMessage(caught)))
      .finally(() => setLoading(false))
  }, [])

  const deltaText = metrics?.revenueDeltaPercent == null
    ? undefined
    : `${metrics.revenueDeltaPercent >= 0 ? '+' : ''}${metrics.revenueDeltaPercent}% ten opzichte van vorige maand`

  return <main className="page shell staff-page owner-dashboard-page">
    <OwnerHeader />
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
        </div>
      </>
    )}
    {!loading && !error && metrics && (
       <Link className="staff-link" to="/owner/queue"><Card><UsersRound /><div><b>Wachtrij beheren</b><small>Beheer de actieve wachtrij</small></div><ChevronRight /></Card></Link>
    )}
    <OwnerBottomNav />
  </main>
}
