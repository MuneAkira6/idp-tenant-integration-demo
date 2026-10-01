/**
 * T052 — both stages of the loop guard as pure decisions (FR-028, SC-007, contracts/web.md).
 *
 * The browser behaviour is in `tests/e2e/loop.spec.ts`; this file pins the rule itself, including
 * stage 2, which a forced loop cannot reach because a looping client never sees a session to
 * remember.
 */

import { LOOP_GUARD_MARKER, LOOP_GUARD_WINDOW_SECONDS } from '@acme/contracts'
import { describe, expect, it } from 'vitest'
import {
  clearLoopGuard,
  decideSignIn,
  type MarkerStore,
  rememberCompletedSignIn,
} from '../src/auth/loop-guard.ts'

function store(
  initial: Record<string, string> = {},
): MarkerStore & { all(): Record<string, string> } {
  const data = { ...initial }
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
    removeItem: (key) => {
      delete data[key]
    },
    all: () => ({ ...data }),
  }
}

const NOW = new Date('2026-09-30T12:00:00.000Z')

describe('stage 1: one attempt per sign-in', () => {
  it('lets the first attempt through and sets the marker', () => {
    const state = store()
    expect(decideSignIn(state, NOW)).toEqual({ action: 'redirect' })
    expect(state.all()[LOOP_GUARD_MARKER]).toBe(String(NOW.getTime()))
  })

  it('stops the second attempt while the marker is set', () => {
    const state = store()
    decideSignIn(state, NOW)
    expect(decideSignIn(state, NOW)).toEqual({ action: 'loop', stage: 1 })
  })

  it('the marker is spent when a sign-in completes, so the next one may start', () => {
    const state = store()
    decideSignIn(state, NOW)
    // A sign-in that completed two minutes ago: outside the window of stage 2.
    const completedAt = new Date(NOW.getTime() - 2 * 60_000)
    rememberCompletedSignIn(state, completedAt.toISOString())
    expect(state.all()[LOOP_GUARD_MARKER]).toBeUndefined()
    expect(decideSignIn(state, NOW)).toEqual({ action: 'redirect' })
  })
})

describe('stage 2: a sign-in within 60 s of a completed one is a loop', () => {
  it('stops a sign-in that would start just after one completed', () => {
    const state = store()
    rememberCompletedSignIn(state, new Date(NOW.getTime() - 1_000).toISOString())
    expect(decideSignIn(state, NOW)).toEqual({ action: 'loop', stage: 2 })
  })

  it('stops it anywhere inside the window, and allows it just outside', () => {
    const inside = store()
    rememberCompletedSignIn(inside, new Date(NOW.getTime() - 59_000).toISOString())
    expect(decideSignIn(inside, NOW)).toEqual({ action: 'loop', stage: 2 })

    const outside = store()
    rememberCompletedSignIn(outside, new Date(NOW.getTime() - 61_000).toISOString())
    expect(decideSignIn(outside, NOW)).toEqual({ action: 'redirect' })

    expect(LOOP_GUARD_WINDOW_SECONDS).toBe(60)
  })

  it('catches the case stage 1 cannot: the completed sign-in cleared the marker', () => {
    const state = store()
    decideSignIn(state, NOW) // stage 1's marker is set
    rememberCompletedSignIn(state, new Date(NOW.getTime() - 1_000).toISOString()) // and cleared
    expect(state.all()[LOOP_GUARD_MARKER]).toBeUndefined()
    // Stage 1 would now let it through; stage 2 is what stops it.
    expect(decideSignIn(state, NOW)).toEqual({ action: 'loop', stage: 2 })
  })
})

describe('the error page’s link clears both stages', () => {
  it('lets a sign-in start again afterwards', () => {
    const state = store()
    decideSignIn(state, NOW)
    rememberCompletedSignIn(state, NOW.toISOString())
    expect(decideSignIn(state, NOW)).toEqual({ action: 'loop', stage: 2 })

    clearLoopGuard(state)
    expect(state.all()).toEqual({})
    expect(decideSignIn(state, NOW)).toEqual({ action: 'redirect' })
  })
})
