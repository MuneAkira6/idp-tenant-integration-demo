/**
 * Sign-in through the platform: the authorisation code flow with PKCE, the callback, the refresh and
 * the platform-side logout (T014, T017, T018; research R-3 and R-5).
 *
 * Everything the browser is trusted with lives in one short-lived, HttpOnly, SameSite=Lax cookie that
 * carries `state`, the PKCE verifier and the nonce, encrypted with `TOKEN_ENC_KEY`. A callback that
 * arrives without that cookie, or with a different `state`, is refused: that is what binds a sign-in
 * to the browser that started it (FR-001).
 */

import type { PlatformAccessTokenClaims } from '@acme/contracts'
import { decodeJwt } from 'jose'
import * as client from 'openid-client'
import { MINUTE_MS } from '../clock.ts'
import type { Config, PlatformTenantConfig } from '../config.ts'
import { decryptToken, encryptToken } from './crypto.ts'
import type { PlatformTokens } from './session.ts'

/** How long a started sign-in may take to come back. */
export const FLOW_LIFETIME_MS = 10 * MINUTE_MS

export type FlowState = {
  tenantId: string
  state: string
  nonce: string
  codeVerifier: string
  /** epoch milliseconds, so an abandoned flow cannot be replayed a day later */
  startedAt: number
}

/** One discovery per issuer, kept for the process's life; Keycloak is on http, hence the execute. */
const discovered = new Map<string, Promise<client.Configuration>>()

export function forgetDiscovery(): void {
  discovered.clear()
}

export async function configurationFor(
  tenant: PlatformTenantConfig,
): Promise<client.Configuration> {
  const cached = discovered.get(tenant.issuer)
  if (cached) return cached
  const pending = client.discovery(
    new URL(tenant.issuer),
    tenant.clientId ?? '',
    tenant.clientSecret ?? '',
    undefined,
    // The demo stack speaks http on localhost (research R-15); the library refuses that by default.
    { execute: [client.allowInsecureRequests] },
  )
  discovered.set(tenant.issuer, pending)
  try {
    return await pending
  } catch (error) {
    discovered.delete(tenant.issuer)
    throw error
  }
}

export function encodeFlow(key: Buffer, flow: FlowState): string {
  return encryptToken(key, JSON.stringify(flow))
}

export function decodeFlow(key: Buffer, encoded: string | undefined): FlowState | null {
  if (!encoded) return null
  try {
    return JSON.parse(decryptToken(key, encoded)) as FlowState
  } catch {
    return null
  }
}

export type LoginRedirect = { authorizationUrl: string; flowCookie: string }

export async function startLogin(
  config: Config,
  tenant: PlatformTenantConfig,
  now: Date,
): Promise<LoginRedirect> {
  const configuration = await configurationFor(tenant)
  const codeVerifier = client.randomPKCECodeVerifier()
  const flow: FlowState = {
    tenantId: tenant.tenantId,
    state: client.randomState(),
    nonce: client.randomNonce(),
    codeVerifier,
    startedAt: now.getTime(),
  }
  const authorizationUrl = client.buildAuthorizationUrl(configuration, {
    redirect_uri: callbackUrl(config),
    scope: 'openid email profile',
    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    state: flow.state,
    nonce: flow.nonce,
  })
  if (!config.tokenEncryptionKey) throw new Error('TOKEN_ENC_KEY is required to start a sign-in')
  return {
    authorizationUrl: authorizationUrl.href,
    flowCookie: encodeFlow(config.tokenEncryptionKey, flow),
  }
}

/**
 * The callback URL is built from the API's configured public URL, never from the request's `Host`
 * header: a request may claim any host, and FR-005 says the host decides nothing.
 */
export function callbackUrl(config: Config): string {
  return `${config.api.publicUrl}/auth/callback`
}

export type CallbackResult = {
  tokens: PlatformTokens
  /** the verified ID token: who signed in, and the issuer that names their tenant (FR-005) */
  claims: client.IDToken
  /**
   * The access token's claims. `resource_access` is there and **not** in the ID token (facts F18),
   * so this is where the roles of FR-011 come from. It is read, not re-verified: it arrived in the
   * same token-endpoint response as the ID token that was verified, over the back channel.
   */
  accessClaims: PlatformAccessTokenClaims
}

export async function completeLogin(
  config: Config,
  tenant: PlatformTenantConfig,
  flow: FlowState,
  requestUrl: string,
  now: Date,
): Promise<CallbackResult> {
  const configuration = await configurationFor(tenant)
  // Reconstructed from the configured public URL plus the query the IdP sent — again, not from Host.
  const currentUrl = new URL(requestUrl, config.api.publicUrl)
  const response = await client.authorizationCodeGrant(configuration, currentUrl, {
    pkceCodeVerifier: flow.codeVerifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    idTokenExpected: true,
  })
  const claims = response.claims()
  if (!claims) throw new Error('the token response carried no ID token')
  if (!response.refresh_token) throw new Error('the token response carried no refresh token')
  return {
    claims,
    accessClaims: decodeJwt(response.access_token) as PlatformAccessTokenClaims,
    tokens: {
      issuer: claims.iss,
      ...(typeof claims.sid === 'string' ? { sid: claims.sid } : {}),
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      accessExpiresAt: new Date(now.getTime() + (response.expiresIn() ?? 0) * 1000),
    },
  }
}

/**
 * The distinction FR-004 rests on.
 *
 * `refused` — the platform answered, and its answer was "no" (an OAuth error with a 4xx status, such
 * as `invalid_grant` after the session was revoked). It has told us about the user, so the application
 * session ends.
 *
 * `unreachable` — no answer, or a 5xx. The platform has told us nothing about the user, so the
 * session survives and the refresh is tried again later.
 */
export type RefreshFailureKind = 'refused' | 'unreachable'

export function classifyRefreshFailure(error: unknown): RefreshFailureKind {
  if (error instanceof client.ResponseBodyError) {
    return error.status >= 400 && error.status < 500 ? 'refused' : 'unreachable'
  }
  if (error instanceof client.WWWAuthenticateChallengeError) return 'refused'
  return 'unreachable'
}

export type RefreshOutcome =
  | { kind: 'refreshed'; tokens: PlatformTokens }
  | { kind: 'refused'; error: unknown }
  | { kind: 'unreachable'; error: unknown }

/**
 * `classify` is injectable for one reason only: the control of AC-4 passes a classifier that treats
 * every failure alike, and the test then shows that one of the two cases ends wrongly.
 */
export async function refreshPlatformTokens(
  tenant: PlatformTenantConfig,
  refreshToken: string,
  now: Date,
  classify: (error: unknown) => RefreshFailureKind = classifyRefreshFailure,
): Promise<RefreshOutcome> {
  try {
    const configuration = await configurationFor(tenant)
    const response = await client.refreshTokenGrant(configuration, refreshToken)
    return {
      kind: 'refreshed',
      tokens: {
        issuer: tenant.issuer,
        accessToken: response.access_token,
        refreshToken: response.refresh_token ?? refreshToken,
        accessExpiresAt: new Date(now.getTime() + (response.expiresIn() ?? 0) * 1000),
      },
    }
  } catch (error) {
    return classify(error) === 'refused'
      ? { kind: 'refused', error }
      : { kind: 'unreachable', error }
  }
}

/**
 * End the platform's own session as well (FR-006). Keycloak's end-session endpoint accepts the
 * refresh token with the client's credentials, which ends the SSO session server-side without sending
 * the browser anywhere — so the application's logout stays one request.
 */
export async function endPlatformSession(
  tenant: PlatformTenantConfig,
  refreshToken: string,
): Promise<{ status: number }> {
  const configuration = await configurationFor(tenant)
  const endpoint = configuration.serverMetadata().end_session_endpoint
  if (!endpoint) return { status: 0 }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: tenant.clientId ?? '',
      client_secret: tenant.clientSecret ?? '',
      refresh_token: refreshToken,
    }),
  })
  return { status: response.status }
}
