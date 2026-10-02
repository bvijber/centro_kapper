import type { ReactNode } from 'react'
import { Outlet, createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
import { AuthProvider } from '../auth/AuthContext'
import '../styles/theme.css'

function RootDocument({ children }: { children: ReactNode }) {
  return <html lang="nl"><head><HeadContent /></head><body><div id="root">{children}</div><Scripts /></body></html>
}

function RootComponent() {
  return <RootDocument><AuthProvider><Outlet /></AuthProvider></RootDocument>
}

 function RootError({ error: _error }: { error: Error }) {
  return <main className="page shell"><p className="eyebrow">CENTRO KAPPER</p><h1>Er ging iets mis.</h1><p className="lead">Probeer het opnieuw. Als het probleem blijft bestaan, neem dan contact op met de eigenaar.</p></main>
}

function RootNotFound() {
  return <main className="page shell"><p className="eyebrow">CENTRO KAPPER</p><h1>Pagina niet gevonden.</h1></main>
}

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: RootError,
  notFoundComponent: RootNotFound,
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { name: 'theme-color', content: '#090909' }, { title: 'Centro Kapper' }] }),
})
