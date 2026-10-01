/**
 * The one gate (T052, FR-027, FR-028, contracts/web.md).
 *
 * Every route that needs a user renders through `AuthGate`, and **every** path to sign-in goes
 * through `startSignIn` — there is no other `window.location` assignment in this client, which is
 * what checklist L11 searches for. Putting the loop guard here is the whole point: a second way out
 * would be a way past the guard.
 */

import { LOOP_ERROR_ROUTE, type SessionInfo } from '@acme/contracts'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { fetchSession } from '../api.ts'
import { decideSignIn, rememberCompletedSignIn } from './loop-guard.ts'

const SessionContext = createContext<SessionInfo | null>(null)

export function useSession(): SessionInfo {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession is only valid inside an AuthGate')
  return session
}

/**
 * The only exit to sign-in. For an integrated tenant it is the platform, guarded; for the tenant
 * that is not integrated it is the application's own password form.
 */
/** Which tenant the client is signing into, so that a return with no query can try again. */
export const SIGN_IN_TENANT = 'acme.signin.tenant'

export function startSignIn(
  tenant: string,
  integrated: boolean,
): 'redirected' | 'loop' | 'password' {
  window.sessionStorage.setItem(SIGN_IN_TENANT, tenant)
  if (!integrated) return 'password'
  const decision = decideSignIn(window.sessionStorage, new Date())
  if (decision.action === 'loop') return 'loop'
  window.location.assign(`/auth/login?tenant=${encodeURIComponent(tenant)}`)
  return 'redirected'
}

export type AuthGateProps = { children: ReactNode }

export function AuthGate({ children }: AuthGateProps): ReactNode {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'anonymous'>('loading')
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchSession()
      if (cancelled) return
      if (result.status === 'ok' && result.value.signedIn) {
        rememberCompletedSignIn(window.sessionStorage, result.value.sessionCreatedAt)
        setSession(result.value)
        setState('ready')
        return
      }
      setState('anonymous')
      const tenant =
        new URLSearchParams(window.location.search).get('tenant') ??
        window.sessionStorage.getItem(SIGN_IN_TENANT)
      if (!tenant) {
        navigate('/signin', { replace: true })
        return
      }
      const outcome = startSignIn(tenant, tenant !== 'local')
      if (outcome === 'loop') navigate(LOOP_ERROR_ROUTE, { replace: true })
      if (outcome === 'password') navigate(`/signin?tenant=${tenant}`, { replace: true })
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  if (state === 'loading') return <p data-testid="gate-loading">Loading…</p>
  if (state === 'anonymous' || !session) return <p data-testid="gate-anonymous">Signing in…</p>
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}
