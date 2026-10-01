/**
 * Application roles derived from a platform token's `resource_access` (T029, FR-011 to FR-013).
 *
 * One derivation serves both ways in. The sign-in path stores what it derives, and only when it
 * differs (FR-012). The Bearer path derives the same way and stores nothing (FR-034) — the difference
 * is in the caller, not here.
 *
 * The mapping table itself is in `packages/contracts` and exists exactly once (checklist L6).
 */

import {
  type ApplicationRole,
  LOWEST_APPLICATION_ROLE,
  PLATFORM_ROLE_CLIENTS,
  type PlatformRoleRef,
  type ResourceAccess,
  ROLE_MAPPING,
  sameRoles,
  sortRoles,
} from '@acme/contracts'
import type { Collections, UserDoc } from './db.ts'

export type DerivedRoles = {
  roles: ApplicationRole[]
  /** the platform roles that had no mapping; each one contributed the lowest role (FR-013) */
  unmapped: PlatformRoleRef[]
}

/**
 * The union across the platform clients the application knows, through the mapping table.
 *
 * A role of a client the application does not know is not part of the union at all (FR-011 says
 * "across the platform clients it knows"); a role of a known client that the table does not map
 * yields the lowest role and is reported so the caller can log a warning naming it (FR-013).
 *
 * A token with no role in any known client derives no role. That is the literal union of nothing, and
 * it fails closed: the permission table then permits the principal nothing.
 */
export function deriveApplicationRoles(resourceAccess: ResourceAccess | undefined): DerivedRoles {
  const roles = new Set<ApplicationRole>()
  const unmapped: PlatformRoleRef[] = []

  for (const client of PLATFORM_ROLE_CLIENTS) {
    for (const role of resourceAccess?.[client]?.roles ?? []) {
      const mapped = ROLE_MAPPING[client][role]
      if (mapped) {
        roles.add(mapped)
      } else {
        unmapped.push({ client, role })
        roles.add(LOWEST_APPLICATION_ROLE)
      }
    }
  }

  return { roles: sortRoles(roles), unmapped }
}

/** The warning FR-013 asks for: it names the role that had no mapping. */
export function unmappedRoleWarning(
  tenantId: string,
  subject: string,
  ref: PlatformRoleRef,
): string {
  return `platform role ${ref.client}:${ref.role} has no mapping; ${subject} in ${tenantId} gets ${LOWEST_APPLICATION_ROLE}`
}

export type RoleSyncResult = { roles: ApplicationRole[]; written: boolean }

/**
 * Replace the stored roles with the derived ones — and write nothing when they are equal (FR-012,
 * SC-005). `rolesWrittenAt` moves only on a real change, which is what the count of AC-15 reads.
 */
export async function storeDerivedRoles(
  collections: Collections,
  user: UserDoc,
  derived: ApplicationRole[],
  now: Date,
): Promise<RoleSyncResult> {
  if (sameRoles(user.roles, derived)) return { roles: user.roles, written: false }
  await collections.users.updateOne(
    { _id: user._id },
    { $set: { roles: derived, rolesWrittenAt: now } },
  )
  return { roles: derived, written: true }
}
