import { createContext, useContext, useState, type ReactNode } from 'react'

export type UserRole = 'customer' | 'staff'
type MockUser = { role: UserRole; name: string }
type AuthContextValue = { user: MockUser | null; signIn: (role: UserRole) => void; signOut: () => void }

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(null)
  const signIn = (role: UserRole) => setUser({ role, name: role === 'staff' ? 'Sam' : 'Daan' })
  return <AuthContext.Provider value={{ user, signIn, signOut: () => setUser(null) }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
