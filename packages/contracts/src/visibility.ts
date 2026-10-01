/**
 * The visibility registry's shape and its data: what an integrated tenant hides and where it lands.
 *
 * FROZEN in G0 on 2026-09-30 (constitution VII); rewritten as AS-BUILT in G6.
 * Source: contracts/web.md, spec.md clarification C5, FR-026.
 *
 * The registry is one place (FR-026). apps/web/src/visibility.ts implements `visibilityFor` against
 * this shape; nothing else in the web client decides what is hidden.
 */

import type { SessionInfo } from './api.ts'

export type PageId =
  | 'home'
  | 'board'
  | 'settings'
  | 'settings/password'
  | 'settings/delete-tenant'
  | 'users'
  | 'users/invite'
  | 'devices'
  | 'error/loop'

export type TabId = 'settings/security'

export type SectionId = 'users/pending-invitations'

export type RoutePath = string

export type Visibility = {
  /** routes that are not reachable and not linked */
  hiddenPages: PageId[]
  /** tabs inside visible pages */
  hiddenTabs: TabId[]
  /** sections inside visible pages */
  hiddenSections: SectionId[]
  /** where a completed sign-in lands */
  landing: RoutePath
}

/** The answer for a tenant that is not integrated: nothing hidden, the landing page as before. */
export const NOT_INTEGRATED_VISIBILITY: Visibility = {
  hiddenPages: [],
  hiddenTabs: [],
  hiddenSections: [],
  landing: '/home',
}

/** The answer for an integrated tenant: the three functions the platform owns, and the task board. */
export const INTEGRATED_VISIBILITY: Visibility = {
  hiddenPages: ['settings/password', 'users/invite', 'settings/delete-tenant'],
  hiddenTabs: ['settings/security'],
  hiddenSections: ['users/pending-invitations'],
  landing: '/board',
}

/** The signature apps/web/src/visibility.ts implements (contracts/web.md). */
export type VisibilityFor = (session: SessionInfo) => Visibility

/** Stage 2 of the loop guard: a sign-in starting within this many seconds of one is a loop (FR-028). */
export const LOOP_GUARD_WINDOW_SECONDS = 60

/** The error page both stages of the loop guard end on (contracts/web.md). */
export const LOOP_ERROR_ROUTE = '/error/loop'

/** Stage 1's one-time marker, in session storage. */
export const LOOP_GUARD_MARKER = 'acme.signin.attempt'
