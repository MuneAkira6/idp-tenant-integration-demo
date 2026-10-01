/**
 * Application roles and the one mapping table from platform roles to them.
 *
 * FROZEN in G0 on 2026-09-30 (constitution VII); rewritten as AS-BUILT in G6.
 * Source: data-model.md ("users", Role derivation), spec.md Permissions, research R-18.
 *
 * This table exists exactly once in the repository (checklist L6). Both readers use it: the sign-in
 * path, which writes the derived roles onto the user (FR-011, FR-012), and the Bearer path, which
 * derives them in memory from the token and never writes them (FR-034).
 */

/** The application roles, lowest first. `member` is the lowest (spec.md, Permissions). */
export const APPLICATION_ROLES = ['member', 'manager', 'admin'] as const

export type ApplicationRole = (typeof APPLICATION_ROLES)[number]

/** The lowest application role: what an unmapped platform role yields (FR-013). */
export const LOWEST_APPLICATION_ROLE: ApplicationRole = 'member'

/**
 * The platform clients whose roles the application knows (research R-1). A role of any other client
 * is not part of the union.
 */
export const PLATFORM_ROLE_CLIENTS = ['acme-tasks', 'acme-reports'] as const

export type PlatformRoleClient = (typeof PLATFORM_ROLE_CLIENTS)[number]

/**
 * platform client role -> application role. Measured against the realms of infra/keycloak/realms/
 * (facts F13): `resource_access` is keyed by client id and lists the client's roles.
 *
 * `acme-reports:legacy-viewer` is deliberately absent: it is the unmapped role FR-013 is tested with.
 */
export const ROLE_MAPPING: Record<PlatformRoleClient, Record<string, ApplicationRole>> = {
  'acme-tasks': {
    'tasks-admin': 'admin',
    'tasks-manager': 'manager',
    'tasks-user': 'member',
  },
  'acme-reports': {
    'reports-admin': 'admin',
    'reports-viewer': 'member',
  },
}

/** One platform role, as it appears in `resource_access`. */
export type PlatformRoleRef = { client: string; role: string }

/** What a derivation produced: the roles, and the platform roles that had no mapping (FR-013). */
export type DerivedRoles = {
  roles: ApplicationRole[]
  unmapped: PlatformRoleRef[]
}

/** Sort roles into the fixed order of APPLICATION_ROLES so that two derivations compare by value. */
export function sortRoles(roles: Iterable<ApplicationRole>): ApplicationRole[] {
  const set = new Set(roles)
  return APPLICATION_ROLES.filter((role) => set.has(role))
}

/** True when two role lists hold the same roles, whatever their order (FR-012: do not write). */
export function sameRoles(a: readonly ApplicationRole[], b: readonly ApplicationRole[]): boolean {
  const left = sortRoles(a)
  const right = sortRoles(b)
  return left.length === right.length && left.every((role, i) => role === right[i])
}
