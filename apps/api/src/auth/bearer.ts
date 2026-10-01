/**
 * A platform token on the existing API (T024, T069; research R-4, FR-007 to FR-010, FR-029, FR-034).
 *
 * The guard comes first: with no issuer configured every token is refused, before the token is looked
 * at (FR-029). Then the signature is verified against the issuer's published keys, with `iss` and
 * `exp`, and the audience is checked for **containment** — F13 measured `aud` as a plain string for a
 * user with one client role and as an array for one with roles in two clients, so `audiences()` of
 * `packages/contracts` is the only reader.
 *
 * What comes out is an in-memory principal. Its roles are derived from the token through the same
 * mapping table and are never written (FR-034); no session is created, and the only write the path
 * can make is the one-time creation of a user seen for the first time (FR-009, FR-010).
 */

import {
  API_ERRORS,
  audiences,
  LOWEST_APPLICATION_ROLE,
  PLATFORM_TOKEN_ALGORITHM,
  type PlatformAccessTokenClaims,
  TOKEN_CLOCK_TOLERANCE_SECONDS,
} from '@acme/contracts'
import { createRemoteJWKSet, customFetch, decodeJwt, type JWTVerifyGetKey, jwtVerify } from 'jose'
import type { Clock } from '../clock.ts'
import { bearerAvailable, type Config } from '../config.ts'
import type { Collections } from '../db.ts'
import { deriveApplicationRoles, unmappedRoleWarning } from '../roles.ts'
import { findOrCreatePlatformUser } from '../users.ts'
import type { Principal } from './session.ts'
import { tenantFromIssuer } from './tenant.ts'

/**
 * One remote key set per issuer (research R-4), with the fetches counted so that a test can show a
 * rotation cost exactly one refetch (AC-13).
 */
export type JwksRegistry = {
  keyFor(issuer: string): Promise<JWTVerifyGetKey>
  fetchCount(issuer: string): number
  forget(): void
}

export function newJwksRegistry(): JwksRegistry {
  const sets = new Map<string, Promise<JWTVerifyGetKey>>()
  const fetches = new Map<string, number>()

  async function build(issuer: string): Promise<JWTVerifyGetKey> {
    const discovery = await fetch(`${issuer}/.well-known/openid-configuration`)
    if (!discovery.ok) throw new Error(`discovery for ${issuer}: ${discovery.status}`)
    const metadata = (await discovery.json()) as { jwks_uri?: string }
    if (!metadata.jwks_uri) throw new Error(`discovery for ${issuer} has no jwks_uri`)
    return createRemoteJWKSet(new URL(metadata.jwks_uri), {
      // R-4 wants an unknown `kid` to trigger one refetch; jose's 30 s cooldown would defer it past
      // the rotation this demo has to show. A deployment would keep a cooldown and accept the delay.
      cooldownDuration: 0,
      [customFetch]: (url, options) => {
        fetches.set(issuer, (fetches.get(issuer) ?? 0) + 1)
        return fetch(url, options)
      },
    })
  }

  return {
    keyFor(issuer) {
      const existing = sets.get(issuer)
      if (existing) return existing
      const pending = build(issuer)
      sets.set(issuer, pending)
      pending.catch(() => sets.delete(issuer))
      return pending
    },
    fetchCount: (issuer) => fetches.get(issuer) ?? 0,
    forget() {
      sets.clear()
      fetches.clear()
    },
  }
}

export type BearerDeps = {
  config: Config
  collections: Collections
  clock: Clock
  jwks: JwksRegistry
  warn: (message: string) => void
  /** Only the controls of quickstart §4 set these; the running system never does. */
  testControls?: {
    /** AC-10's control: take the FR-029 guard away and see how far a token then gets. */
    skipNotConfiguredGuard?: boolean
    /** AC-43's control: read the principal's roles from the stored user instead of the token. */
    readRolesFromStoredUser?: boolean
  }
}

export type BearerResult =
  | { ok: true; principal: Principal; verified: PlatformAccessTokenClaims }
  | { ok: false; status: number; error: string; message: string }

const refuse = (message: string, error: string = API_ERRORS.invalidToken): BearerResult => ({
  ok: false,
  status: 401,
  error,
  message,
})

export async function authenticateBearer(deps: BearerDeps, token: string): Promise<BearerResult> {
  const { config, collections, clock, jwks } = deps

  // FR-029, first and before anything else: nothing configured means nothing is accepted.
  if (!deps.testControls?.skipNotConfiguredGuard && !bearerAvailable(config)) {
    return refuse('no platform issuer is configured, so every platform token is refused')
  }

  let issuer: string | undefined
  try {
    issuer = decodeJwt(token).iss
  } catch {
    return refuse('the bearer token is not a JWT')
  }

  const tenantId = tenantFromIssuer(config, issuer)
  if (!tenantId || !issuer)
    return refuse(`no tenant is configured for issuer ${issuer ?? '(none)'}`)

  let claims: PlatformAccessTokenClaims
  try {
    const keySet = await jwks.keyFor(issuer)
    const { payload } = await jwtVerify(token, keySet, {
      issuer,
      algorithms: [PLATFORM_TOKEN_ALGORITHM],
      clockTolerance: TOKEN_CLOCK_TOLERANCE_SECONDS,
      // `exp` is judged against the injectable clock (research R-11): the running system passes the
      // real one, and a test advances it instead of waiting out a token's lifetime (FR-032).
      currentDate: clock.now(),
    })
    claims = payload as PlatformAccessTokenClaims
  } catch (error) {
    return refuse(`the token did not verify: ${(error as Error).message}`)
  }

  // Containment, not equality: `aud` is a string for alice and an array for carol (facts F13).
  if (!audiences(claims).includes(config.platformAudience)) {
    return refuse(
      `the token is addressed to ${JSON.stringify(claims.aud ?? null)}, not to ${config.platformAudience}`,
    )
  }

  const tenant = await collections.tenants.findOne({ _id: tenantId })
  if (!tenant || tenant.state === 'deleted') {
    return {
      ok: false,
      status: 403,
      error: API_ERRORS.tenantDeleted,
      message: `tenant ${tenantId} is deleted`,
    }
  }

  // FR-034: derived here, in memory, on every request, and never written.
  const derived = deriveApplicationRoles(claims.resource_access)
  for (const ref of derived.unmapped) {
    deps.warn(unmappedRoleWarning(tenantId, claims.sub, ref))
  }

  // FR-009, FR-010: the only write this path may make, and only the first time.
  const { user } = await findOrCreatePlatformUser(
    collections,
    {
      tenantId,
      platformSubject: claims.sub,
      email: String(claims.email ?? `${claims.sub}@${tenantId}.example`),
      name: String(claims.name ?? claims.preferred_username ?? claims.sub),
      // Not the derived roles: FR-034 forbids writing those. A browser sign-in stores the derived
      // ones (FR-011); until then the stored value is the lowest role.
      roles: [LOWEST_APPLICATION_ROLE],
    },
    clock.now(),
  )

  const roles = deps.testControls?.readRolesFromStoredUser ? user.roles : derived.roles

  return {
    ok: true,
    verified: claims,
    principal: {
      tenantId,
      userId: String(user._id),
      roles,
      // A token principal has no session; the loop guard only ever reads this for a browser session.
      sessionCreatedAt: clock.now(),
    },
  }
}
