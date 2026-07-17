import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useLocation } from 'react-router-dom'
import { api } from './api/client'
import ForcePasswordChange from './pages/ForcePasswordChange'

export interface AuthUser {
  id: number
  email: string
  displayName: string | null
  role: 'admin' | 'user'
  mustChangePassword: boolean
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api<{ user: AuthUser }>('/api/auth/me'),
    retry: false,               // 401 = deslogado, não adianta re-tentar
    staleTime: 5 * 60_000,
  })
  return (
    <AuthContext.Provider value={{ user: data?.user ?? null, loading: isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

/** Atualiza o cache da sessão após login/troca de senha (evita um refetch de /me). */
export function useSetAuthUser() {
  const qc = useQueryClient()
  return (user: AuthUser) => qc.setQueryData(['auth', 'me'], { user })
}

/** Invalida a sessão em cache (logout). */
export function useClearAuth() {
  const qc = useQueryClient()
  return () => {
    qc.setQueryData(['auth', 'me'], null)
    qc.clear() // dados per-user não devem sobreviver à troca de usuário
  }
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <p className="pt-6 text-slate-ink">Carregando…</p>
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (user.mustChangePassword) return <ForcePasswordChange />
  return <>{children}</>
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="pt-6 text-slate-ink">Carregando…</p>
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}
