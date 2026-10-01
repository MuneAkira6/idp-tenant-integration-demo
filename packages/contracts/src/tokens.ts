/**
 * The platform token shapes, as measured on the stack of this run — not as documented.
 *
 * FROZEN in G0 on 2026-09-30 (constitution VII, research R-2); rewritten as AS-BUILT in G6.
 * Source: facts.md F12 (no `aud` before the audience mapper), F13 (tenant-a), F14 (tenant-b),
 * F15 (the `acme-tasks-sync` service token), F16 (the JWKS of each realm).
 */

/**
 * `resource_access` as Keycloak writes it: keyed by client id, each with its list of client roles
 * (F13: alice has one client, carol has two).
 */
export type ResourceAccess = Record<string, { roles?: string[] } | undefined>

/**
 * The claims of a platform access token that this application reads.
 *
 * `aud` is `string | string[]`: measured as the plain string `"acme-tasks-api"` for alice and as
 * `["acme-tasks-api", "acme-reports"]` for carol, who holds a role in a second client (F13). A verifier
 * that assumed an array would have refused alice's token.
 */
export type PlatformAccessTokenClaims = {
  iss: string
  sub: string
  aud?: string | string[]
  azp?: string
  exp: number
  iat?: number
  resource_access?: ResourceAccess
  preferred_username?: string
  email?: string
  name?: string
  sid?: string
}

/** The signing algorithm every realm publishes for `use: "sig"` (F16). */
export const PLATFORM_TOKEN_ALGORITHM = 'RS256'

/**
 * The audience the tenant realms' `acme-tasks` clients put into an access token, through the audience
 * mapper added after F12 showed there was no `aud` at all. One string for both tenant realms (F14).
 */
export const PLATFORM_API_AUDIENCE = 'acme-tasks-api'

/** The audience of the platform realm's service token (F15), which the mock platform checks. */
export const PLATFORM_SYNC_AUDIENCE = 'platform-api'

/** The `azp` of the client-credentials caller of the tenant and device APIs (F15). */
export const PLATFORM_SYNC_CLIENT_ID = 'acme-tasks-sync'

/** Clock tolerance for `exp` and `iat`, in seconds (research R-4). */
export const TOKEN_CLOCK_TOLERANCE_SECONDS = 30

/** Read `aud` in either measured form. */
export function audiences(claims: Pick<PlatformAccessTokenClaims, 'aud'>): string[] {
  if (claims.aud === undefined) return []
  return typeof claims.aud === 'string' ? [claims.aud] : claims.aud
}
