/**
 * The visibility registry (T051, FR-026, contracts/web.md).
 *
 * One place decides what a tenant hides and where it lands, and it decides it from the frozen data in
 * `packages/contracts` — there is no second copy here. Every function answers "nothing hidden" before
 * looking at anything else when the tenant is not integrated, which is what makes the default-off
 * promise reach the user interface.
 */

import {
  INTEGRATED_VISIBILITY,
  NOT_INTEGRATED_VISIBILITY,
  type PageId,
  type RoutePath,
  type SectionId,
  type SessionInfo,
  type TabId,
  type Visibility,
} from '@acme/contracts'

export function visibilityFor(session: SessionInfo): Visibility {
  // First, and before anything else.
  if (!session.integrated) return NOT_INTEGRATED_VISIBILITY
  return INTEGRATED_VISIBILITY
}

export function isPageHidden(session: SessionInfo, page: PageId): boolean {
  if (!session.integrated) return false
  return visibilityFor(session).hiddenPages.includes(page)
}

export function isTabHidden(session: SessionInfo, tab: TabId): boolean {
  if (!session.integrated) return false
  return visibilityFor(session).hiddenTabs.includes(tab)
}

export function isSectionHidden(session: SessionInfo, section: SectionId): boolean {
  if (!session.integrated) return false
  return visibilityFor(session).hiddenSections.includes(section)
}

export function landingFor(session: SessionInfo): RoutePath {
  return visibilityFor(session).landing
}
