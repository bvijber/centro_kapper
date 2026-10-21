import { Link } from '@tanstack/react-router'

import logo from '../assets/logo_centro_kapper.jpeg'
import { OwnerNotificationBell } from './OwnerNotificationBell'

/**
 * Gedeelde merkheader voor de eigenaarpagina's. De header bevat de
 * notificatiebel, zodat de teller en de meldingenlijst op alle
 * eigenaarpagina's op dezelfde manier beschikbaar zijn.
 */
export function OwnerHeader() {
  return (
    <header className="topbar">
      <Link to="/owner" className="brand">
        <img src={logo} alt="Centro Kapper" />
        <span>Centro <b>Kapper</b></span>
      </Link>
      <div className="owner-header-actions">
        <span className="staff-label">EIGENAAR</span>
        <OwnerNotificationBell />
      </div>
    </header>
  )
}
