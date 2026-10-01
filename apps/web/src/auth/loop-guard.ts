/**
 * The two-stage loop guard (T052, FR-028, SC-007, contracts/web.md).
 *
 * Stage 1: a one-time marker per sign-in. The gate sets it before sending the browser to the
 * platform; a second attempt while it is set stops instead of redirecting.
 *
 * Stage 2: a sign-in that would start within `LOOP_GUARD_WINDOW_SECONDS` of a completed one is a
 * loop. The completed one is `sessionCreatedAt` from `GET /auth/session`, remembered when the gate
 * last saw a session.
 *
 * The decision is a pure function of the clock and the stored state, so both stages can be read and
 * tested without a browser; `gate.tsx` is the only caller.
 */

import { LOOP_GUARD_MARKER, LOOP_GUARD_WINDOW_SECONDS } from '@acme/contracts'

const LAST_SIGN_IN = 'acme.signin.completed'

/** The part of `Storage` this module uses, so a test can pass a plain object. */
export type MarkerStore = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type SignInDecision = { action: 'redirect' } | { action: 'loop'; stage: 1 | 2 }

export function decideSignIn(store: MarkerStore, now: Date): SignInDecision {
  // Stage 2 first: a sign-in that completed moments ago means the platform is sending us straight
  // back, and the marker of stage 1 may have been cleared by that very sign-in.
  const completedAt = store.getItem(LAST_SIGN_IN)
  if (completedAt) {
    const since = (now.getTime() - Number(completedAt)) / 1000
    if (since >= 0 && since < LOOP_GUARD_WINDOW_SECONDS) return { action: 'loop', stage: 2 }
  }
  // Stage 1: one attempt per sign-in.
  if (store.getItem(LOOP_GUARD_MARKER)) return { action: 'loop', stage: 1 }
  store.setItem(LOOP_GUARD_MARKER, String(now.getTime()))
  return { action: 'redirect' }
}

/** Called when the gate sees a session: the sign-in finished, so stage 1's marker is spent. */
export function rememberCompletedSignIn(
  store: MarkerStore,
  sessionCreatedAt: string | undefined,
): void {
  store.removeItem(LOOP_GUARD_MARKER)
  if (sessionCreatedAt) store.setItem(LAST_SIGN_IN, String(new Date(sessionCreatedAt).getTime()))
}

/** The link on the error page clears both, so the user can try again (contracts/web.md). */
export function clearLoopGuard(store: MarkerStore): void {
  store.removeItem(LOOP_GUARD_MARKER)
  store.removeItem(LAST_SIGN_IN)
}
