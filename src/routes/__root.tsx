import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Outlet, createRootRoute, HeadContent, Scripts, type ErrorComponentProps } from '@tanstack/react-router'
import { AuthProvider } from '../auth/AuthContext'
import { registerServiceWorker } from '../pwa/register-sw'
import '../styles/theme.css'

function RootDocument({ children }: { children: ReactNode }) {
  return <html lang="nl"><head><HeadContent /></head><body><div id="root">{children}</div><Scripts /></body></html>
}

function RootComponent() {
  useEffect(() => { registerServiceWorker() }, [])
  return <RootDocument><AuthProvider><Outlet /></AuthProvider></RootDocument>
}

 function RootError({ error: _error }: ErrorComponentProps) {
  return <main className="page shell"><p className="eyebrow">CENTRO KAPPER</p><h1>Er ging iets mis.</h1><p className="lead">Probeer het opnieuw. Als het probleem blijft bestaan, neem dan contact op met de eigenaar.</p></main>
}

function RootNotFound() {
  return <main className="page shell"><p className="eyebrow">CENTRO KAPPER</p><h1>Pagina niet gevonden.</h1></main>
}

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: RootError,
  notFoundComponent: RootNotFound,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#090909' },
      { name: 'description', content: 'Boek eenvoudig je volgende knipbeurt bij Centro Kapper.' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'apple-mobile-web-app-title', content: 'Centro Kapper' },
      { title: 'Centro Kapper' },
    ],
    links: [
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
    ],
  }),
})
