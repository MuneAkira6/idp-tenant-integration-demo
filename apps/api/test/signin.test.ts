/**
 * T012, T013, T015, T057, T058 — sign-in with the group account (US1).
 *
 * The flow is driven against the real Keycloak of the Compose stack: the API builds the authorisation
 * URL, a cookie jar plays the browser and submits the login form, and the callback is handed back to
 * the API. Nothing is mocked but the browser itself.
 */

import { FLOW_COOKIE, SESSION_COOKIE } from '@acme/contracts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { looksEncrypted, looksLikeJwt } from '../src/auth/crypto.ts'
import { forgetDiscovery } from '../src/auth/platform.ts'
import { tenantFromIssuer } from '../src/auth/tenant.ts'
import { systemClock } from '../src/clock.ts'
import { type Config, loadConfig } from '../src/config.ts'
import { seedConfiguredPlatformTenants, seedLocalTenant } from '../src/seed.ts'
import { buildApi } from '../src/server.ts'
import { openTestStore, type TestStore } from './helpers.ts'
import {
  callbackPathOf,
  cookieFromReply,
  integratedEnv,
  issuerOf,
  newBrowser,
  stackEnv,
} from './keycloak.ts'

let store: TestStore
let app: FastifyInstance
let config: Config
const clock = systemClock()

beforeAll(async () => {
  forgetDiscovery()
  store = await openTestStore('signin')
  config = loadConfig(integratedEnv())
  await seedLocalTenant(store, stackEnv().LOCAL_SEED_PASSWORD ?? 'unused', clock.now())
  await seedConfiguredPlatformTenants(store, config.platformTenants.values())
  app = buildApi({ config, collections: store, clock })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await store?.close()
})

/** Start a sign-in and return the authorisation URL with the flow cookie the API set. */
async function startSignIn(
  tenant: string,
): Promise<{ authorizationUrl: string; flowCookie: string }> {
  const reply = await app.inject({ method: 'GET', url: `/auth/login?tenant=${tenant}` })
  expect(reply.statusCode).toBe(302)
  const flowCookie = cookieFromReply(reply.headers as Record<string, unknown>, FLOW_COOKIE)
  expect(flowCookie).toBeTruthy()
  return { authorizationUrl: reply.headers.location as string, flowCookie: flowCookie as string }
}

describe('GET /auth/login (T014, FR-001)', () => {
  it('redirects to the tenant’s issuer with code + PKCE S256, state and a flow cookie', async () => {
    const { authorizationUrl, flowCookie } = await startSignIn('tenant-a')
    const url = new URL(authorizationUrl)
    expect(url.origin).toBe('http://localhost:18480')
    expect(url.pathname).toBe('/realms/tenant-a/protocol/openid-connect/auth')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:18400/auth/callback')
    expect(url.searchParams.get('state')).toBeTruthy()
    // The verifier never leaves the server in the clear: the cookie is ciphertext (FR-001, FR-003).
    expect(looksEncrypted(flowCookie)).toBe(true)
    expect(flowCookie).not.toContain(url.searchParams.get('code_challenge') as string)
  })

  it('answers 404 not_integrated for the tenant that is not integrated (T020)', async () => {
    const reply = await app.inject({ method: 'GET', url: '/auth/login?tenant=local' })
    expect(reply.statusCode).toBe(404)
    expect(reply.json()).toEqual({
      error: 'not_integrated',
      message: 'no platform sign-in is configured for local',
    })
  })
})

describe('GET /auth/callback: the sign-in ends in the application’s own session (T012, Q1)', () => {
  it('signs alice in, lands on /board and keeps the platform tokens encrypted on the server', async () => {
    const { authorizationUrl, flowCookie } = await startSignIn('tenant-a')
    const browser = newBrowser('alice', stackEnv().KEYCLOAK_SEED_PASSWORD as string)
    const { callbackUrl } = await browser.authorize(authorizationUrl)
    expect(callbackUrl).toContain('http://localhost:18400/auth/callback?')

    const reply = await app.inject({
      method: 'GET',
      url: callbackPathOf(callbackUrl as string),
      cookies: { [FLOW_COOKIE]: flowCookie },
    })
    expect(reply.statusCode).toBe(302)
    expect(reply.headers.location).toBe('http://localhost:18401/board')

    const sessionId = cookieFromReply(reply.headers as Record<string, unknown>, SESSION_COOKIE)
    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(looksLikeJwt(sessionId)).toBe(false)

    const info = await app.inject({
      method: 'GET',
      url: '/auth/session',
      cookies: { [SESSION_COOKIE]: sessionId as string },
    })
    expect(info.json()).toMatchObject({
      signedIn: true,
      tenantId: 'tenant-a',
      integrated: true,
      landing: '/board',
    })

    // FR-003: the platform's tokens are in the session document, as ciphertext, and nowhere else.
    const session = await store.sessions.findOne({ _id: sessionId as string })
    expect(session?.kind).toBe('platform')
    expect(session?.platform?.issuer).toBe('http://localhost:18480/realms/tenant-a')
    expect(looksEncrypted(session?.platform?.accessTokenEnc)).toBe(true)
    expect(looksEncrypted(session?.platform?.refreshTokenEnc)).toBe(true)
    const serialised = JSON.stringify(session)
    expect(serialised.split(/["\s,{}[\]]+/).some(looksLikeJwt)).toBe(false)

    // Nothing the browser received carries a platform token.
    const wire = JSON.stringify({ headers: reply.headers, body: reply.body })
    expect(wire.split(/["\s,;=]+/).some(looksLikeJwt)).toBe(false)
  })

  it('creates the user once; signing in again reuses it (FR-010)', async () => {
    const before = await store.users.countDocuments({ tenantId: 'tenant-a' })
    const { authorizationUrl, flowCookie } = await startSignIn('tenant-a')
    const browser = newBrowser('alice', stackEnv().KEYCLOAK_SEED_PASSWORD as string)
    const { callbackUrl } = await browser.authorize(authorizationUrl)
    await app.inject({
      method: 'GET',
      url: callbackPathOf(callbackUrl as string),
      cookies: { [FLOW_COOKIE]: flowCookie },
    })
    expect(await store.users.countDocuments({ tenantId: 'tenant-a' })).toBe(before)
  })
})

describe('a replayed callback (T013, Q2, FR-001)', () => {
  it('answers 400 state_mismatch in a browser that has no flow cookie', async () => {
    const { authorizationUrl, flowCookie } = await startSignIn('tenant-a')
    const browser = newBrowser('alice', stackEnv().KEYCLOAK_SEED_PASSWORD as string)
    const { callbackUrl } = await browser.authorize(authorizationUrl)

    const replayed = await app.inject({ method: 'GET', url: callbackPathOf(callbackUrl as string) })
    expect(replayed.statusCode).toBe(400)
    expect(replayed.json()).toEqual({
      error: 'state_mismatch',
      message: 'this callback does not belong to this browser',
    })
    expect(cookieFromReply(replayed.headers as Record<string, unknown>, SESSION_COOKIE)).toBeNull()

    // The same callback in the browser that started it still works, so the URL itself was valid.
    const accepted = await app.inject({
      method: 'GET',
      url: callbackPathOf(callbackUrl as string),
      cookies: { [FLOW_COOKIE]: flowCookie },
    })
    expect(accepted.statusCode).toBe(302)
  })

  it('answers 400 state_mismatch in a second browser that started its own sign-in', async () => {
    const first = await startSignIn('tenant-a')
    const second = await startSignIn('tenant-a')
    const browser = newBrowser('alice', stackEnv().KEYCLOAK_SEED_PASSWORD as string)
    const { callbackUrl } = await browser.authorize(first.authorizationUrl)

    const replayed = await app.inject({
      method: 'GET',
      url: callbackPathOf(callbackUrl as string),
      cookies: { [FLOW_COOKIE]: second.flowCookie },
    })
    expect(replayed.statusCode).toBe(400)
    expect(replayed.json().error).toBe('state_mismatch')
  })
})

describe('the tenant comes from the ID token’s issuer only (T057, T016, FR-005)', () => {
  it('lands in tenant-a although the request claims Host: tenant-b.localhost', async () => {
    const { authorizationUrl, flowCookie } = await startSignIn('tenant-a')
    const browser = newBrowser('alice', stackEnv().KEYCLOAK_SEED_PASSWORD as string)
    const { callbackUrl } = await browser.authorize(authorizationUrl)

    const reply = await app.inject({
      method: 'GET',
      url: callbackPathOf(callbackUrl as string),
      headers: { host: 'tenant-b.localhost' },
      cookies: { [FLOW_COOKIE]: flowCookie },
    })
    expect(reply.statusCode).toBe(302)
    const sessionId = cookieFromReply(reply.headers as Record<string, unknown>, SESSION_COOKIE)
    const session = await store.sessions.findOne({ _id: sessionId as string })
    expect(session?.tenantId).toBe('tenant-a')

    // The control for this row: a tenant derived from the Host header — the rule FR-005 forbids —
    // would have answered `tenant-b` for this very request, so the assertion above would fail if the
    // server consulted Host. Both candidates are real, configured tenants.
    const fromHost = 'tenant-b.localhost'.split('.')[0]
    expect(fromHost).toBe('tenant-b')
    expect(config.platformTenants.has('tenant-b')).toBe(true)
    expect(session?.tenantId).not.toBe(fromHost)
    // And the issuer really does name tenant-a, so the value did not come from somewhere accidental.
    expect(tenantFromIssuer(config, issuerOf('tenant-a'))).toBe('tenant-a')
    expect(tenantFromIssuer(config, issuerOf('tenant-b'))).toBe('tenant-b')
  })
})

describe('POST /auth/logout ends both sessions (T018, T058, FR-006)', () => {
  it('removes the application session and stops the IdP signing the browser in silently', async () => {
    const { authorizationUrl, flowCookie } = await startSignIn('tenant-a')
    const browser = newBrowser('alice', stackEnv().KEYCLOAK_SEED_PASSWORD as string)
    const { callbackUrl } = await browser.authorize(authorizationUrl)
    const signedIn = await app.inject({
      method: 'GET',
      url: callbackPathOf(callbackUrl as string),
      cookies: { [FLOW_COOKIE]: flowCookie },
    })
    const sessionId = cookieFromReply(
      signedIn.headers as Record<string, unknown>,
      SESSION_COOKIE,
    ) as string

    // Before logging out, the IdP signs this browser in again without showing a form.
    const beforeProbe = await startSignIn('tenant-a')
    expect((await browser.probeSilent(beforeProbe.authorizationUrl)).silent).toBe(true)

    const out = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { [SESSION_COOKIE]: sessionId },
    })
    expect(out.statusCode).toBe(200)
    expect(out.json().signedOut).toBe(true)
    expect(out.json().platformLogoutStatus).toBe(204)

    expect(await store.sessions.findOne({ _id: sessionId })).toBeNull()
    const after = await app.inject({
      method: 'GET',
      url: '/auth/session',
      cookies: { [SESSION_COOKIE]: sessionId },
    })
    expect(after.json()).toEqual({ signedIn: false })

    // And the IdP no longer signs the same browser in by itself: it shows the login form again.
    const afterProbe = await startSignIn('tenant-a')
    expect((await browser.probeSilent(afterProbe.authorizationUrl)).silent).toBe(false)
  })
})
