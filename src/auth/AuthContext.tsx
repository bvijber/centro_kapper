import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { loginFn, logoutFn, refreshSessionFn } from './auth.functions'
import type { SafeUser } from './auth.schemas'

export type UserRole = 'customer' | 'owner'

type AuthContextValue = {
  user: SafeUser | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<SafeUser>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    void refreshSessionFn()
      .then((currentUser) => {
        if (active) setUser(currentUser)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function signIn(email: string, password: string): Promise<SafeUser> {
    const signedInUser = await loginFn({ data: { email, password } })
    setUser(signedInUser)
    return signedInUser
  }

  async function signOut(): Promise<void> {
    await logoutFn()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
