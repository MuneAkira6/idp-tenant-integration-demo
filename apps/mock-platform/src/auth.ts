/**
 * The mock platform authenticates the caller of its tenant and device APIs (contracts/platform.md):
 * a Bearer token from the `platform` realm's `acme-tasks-sync` client, verified against that realm's
 * published keys.
 *
 * The check is `azp` and the audience, because facts F15 measured that a service-account token
 * carries no application role: `resource_access` holds only Keycloak's own `account` roles, so there
 * is nothing role-shaped to check. It imports only from `packages/contracts`.
 */

import {
  audiences,
  PLATFORM_SYNC_AUDIENCE,
  PLATFORM_SYNC_CLIENT_ID,
  PLATFORM_TOKEN_ALGORITHM,
  TOKEN_CLOCK_TOLERANCE_SECONDS,
} from '@acme/contracts'
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose'

export type PlatformAuth = {
  /** null when no issuer is configured: then the mock accepts any Bearer, for unit tests. */
  issuer: string | null
  verify(authorization: string | undefined): Promise<{ ok: true } | { ok: false; status: number }>
}

export function newPlatformAuth(issuer: string | null): PlatformAuth {
  let keySet: Promise<JWTVerifyGetKey> | null = null

  async function keys(): Promise<JWTVerifyGetKey> {
    if (!keySet) {
      keySet = (async () => {
        const response = await fetch(`${issuer}/.well-known/openid-configuration`)
        const metadata = (await response.json()) as { jwks_uri: string }
        return createRemoteJWKSet(new URL(metadata.jwks_uri))
      })()
    }
    return keySet
  }

  return {
    issuer,
    async verify(authorization) {
      if (!authorization?.startsWith('Bearer ')) return { ok: false, status: 401 }
      if (!issuer) return { ok: true }
      const token = authorization.slice('Bearer '.length)
      try {
        const { payload } = await jwtVerify(token, await keys(), {
          issuer,
          algorithms: [PLATFORM_TOKEN_ALGORITHM],
          clockTolerance: TOKEN_CLOCK_TOLERANCE_SECONDS,
        })
        const claims = payload as { azp?: string; aud?: string | string[] }
        if (claims.azp !== PLATFORM_SYNC_CLIENT_ID) return { ok: false, status: 403 }
        if (!audiences(claims).includes(PLATFORM_SYNC_AUDIENCE)) return { ok: false, status: 403 }
        return { ok: true }
      } catch {
        return { ok: false, status: 401 }
      }
    },
  }
}
