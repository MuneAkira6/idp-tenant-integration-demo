/**
 * The sign-in entry. Both ways in leave through `startSignIn` in the gate: an integrated tenant goes
 * to the platform, guarded; the tenant that is not integrated gets its own password form, unchanged
 * (FR-031). There is no other exit to sign-in in this client (FR-027).
 */

import { LOOP_ERROR_ROUTE } from '@acme/contracts'
import { type ReactNode, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { signInWithPassword } from '../api.ts'
import { startSignIn } from '../auth/gate.tsx'

export function SignInPage(): ReactNode {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tenant = params.get('tenant') ?? ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const goToPlatform = (which: string) => {
    const outcome = startSignIn(which, which !== 'local')
    if (outcome === 'loop') navigate(LOOP_ERROR_ROUTE, { replace: true })
    if (outcome === 'password') navigate(`/signin?tenant=${which}`, { replace: true })
  }

  return (
    <section data-testid="page-signin">
      <h1>Sign in to Acme Tasks</h1>
      <button type="button" data-testid="signin-tenant-a" onClick={() => goToPlatform('tenant-a')}>
        Sign in with your group account (tenant-a)
      </button>
      <button type="button" data-testid="signin-tenant-b" onClick={() => goToPlatform('tenant-b')}>
        Sign in with your group account (tenant-b)
      </button>

      <form
        data-testid="password-form"
        onSubmit={(event) => {
          event.preventDefault()
          void (async () => {
            const result = await signInWithPassword({ tenant: tenant || 'local', email, password })
            if (result.ok) {
              // Back in through the gate, which asks the registry where this tenant lands (FR-026).
              window.location.assign('/')
              return
            }
            setMessage(result.message)
          })()
        }}
      >
        <label htmlFor="email">E-mail address</label>
        <input id="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" data-testid="password-submit">
          Sign in
        </button>
        {message ? <p data-testid="signin-error">{message}</p> : null}
      </form>
    </section>
  )
}

/** Where both stages of the loop guard end (FR-028), with the link that clears them. */
export function LoopErrorPage(): ReactNode {
  const navigate = useNavigate()
  return (
    <section data-testid="page-error-loop">
      <h1>Sign-in is looping</h1>
      <p>Acme Tasks stopped the sign-in because it kept starting again.</p>
      <button
        type="button"
        data-testid="loop-clear"
        onClick={() => {
          void import('../auth/loop-guard.ts').then(({ clearLoopGuard }) => {
            clearLoopGuard(window.sessionStorage)
            navigate('/signin', { replace: true })
          })
        }}
      >
        Try again
      </button>
    </section>
  )
}
