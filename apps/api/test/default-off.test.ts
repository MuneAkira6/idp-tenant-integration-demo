/**
 * T019 — quickstart Q15: with no integration settings at all, nothing about the platform works and
 * the tenant that is not integrated is untouched (US8, FR-029, FR-030, SC-008).
 *
 * The configuration is built from an environment object that holds no platform settings, not from the
 * process environment: the absence this row proves must be deliberate, not an accident of ordering.
 */

import { EVENT_HEADERS, SESSION_COOKIE } from '@acme/contracts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newJwksRegistry } from '../src/auth/bearer.ts'
import { systemClock } from '../src/clock.ts'
import {
  bearerAvailable,
  devicePullAvailable,
  loadConfig,
  platformSignInAvailable,
  webhookSecretFor,
} from '../src/config.ts'
import { LOCAL_TENANT_ID, seedLocalTenant } from '../src/seed.ts'
import { buildApi } from '../src/server.ts'
import { openTestStore, type TestStore } from './helpers.ts'
import { cookieFromReply, directGrantToken, unconfiguredEnv } from './keycloak.ts'

const clock = systemClock()
const config = loadConfig(unconfiguredEnv())
const LOCAL_PASSWORD = 'a-password-only-this-test-knows'

let store: TestStore
let app: FastifyInstance
/** A genuine, currently valid platform token — the API must refuse it anyway. */
let platformToken: string

beforeAll(async () => {
  store = await openTestStore('default_off')
  await seedLocalTenant(store, LOCAL_PASSWORD, clock.now())
  // tenant-a exists in the database and is integrated; only the *settings* are missing.
  await store.tenants.insertOne({
    _id: 'tenant-a',
    name: 'Tenant A',
    integrated: true,
    issuer: 'http://localhost:18480/realms/tenant-a',
    state: 'active',
  })
  app = buildApi({ config, collections: store, clock })
  await app.ready()
  platformToken = await directGrantToken({
    realm: 'tenant-a',
    username: 'alice',
    secretName: 'ACME_TASKS_SECRET_TENANT_A',
  })
})

afterAll(async () => {
  await app?.close()
  await store?.close()
})

describe('the settings are genuinely absent', () => {
  it('every integration path reports itself unavailable', () => {
    expect(config.platformTenants.size).toBe(0)
    expect(platformSignInAvailable(config, 'tenant-a')).toBe(false)
    expect(bearerAvailable(config)).toBe(false)
    expect(webhookSecretFor(config, 'tenant.created')).toBeNull()
    expect(devicePullAvailable(config)).toBe(false)
    expect(config.tokenEncryptionKey).toBeNull()
  })
})

describe('platform sign-in is unavailable (FR-029)', () => {
  it('answers 404 not_integrated even for a tenant the database marks integrated', async () => {
    const reply = await app.inject({ method: 'GET', url: '/auth/login?tenant=tenant-a' })
    expect(reply.statusCode).toBe(404)
    expect(reply.json()).toEqual({
      error: 'not_integrated',
      message: 'no platform sign-in is configured for tenant-a',
    })
  })

  it('refuses a callback, because there is no key to read a flow cookie with', async () => {
    const reply = await app.inject({ method: 'GET', url: '/auth/callback?code=x&state=y' })
    expect(reply.statusCode).toBe(404)
    expect(reply.json()).toEqual({ error: 'not_integrated', message: 'TOKEN_ENC_KEY is not set' })
  })
})

describe('every platform token is refused (FR-029, SC-008)', () => {
  it('refuses a genuine, unexpired token from tenant-a with 401 invalid_token', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${platformToken}` },
    })
    expect(reply.statusCode).toBe(401)
    expect(reply.json()).toEqual({
      error: 'invalid_token',
      message: 'no platform issuer is configured, so every platform token is refused',
    })
  })

  it('writes nothing while refusing', async () => {
    const before = {
      users: await store.users.countDocuments({}),
      sessions: await store.sessions.countDocuments({}),
      tasks: await store.tasks.countDocuments({}),
    }
    for (let i = 0; i < 4; i += 1) {
      await app.inject({
        method: 'GET',
        url: '/api/tasks',
        headers: { authorization: `Bearer ${platformToken}` },
      })
    }
    expect({
      users: await store.users.countDocuments({}),
      sessions: await store.sessions.countDocuments({}),
      tasks: await store.tasks.countDocuments({}),
    }).toEqual(before)
  })
})

describe('every event is refused (FR-029, SC-008)', () => {
  it('answers 401 not_configured for a delivery of a known event type', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/webhooks/platform',
      headers: {
        [EVENT_HEADERS.delivery]: 'delivery-1',
        [EVENT_HEADERS.event]: 'tenant.created',
        [EVENT_HEADERS.timestamp]: String(Math.floor(clock.now().getTime() / 1000)),
        [EVENT_HEADERS.signature]: 'sha256=0000',
        'content-type': 'application/json',
      },
      payload: { tenantId: 'tenant-c', occurredAt: clock.now().toISOString() },
    })
    expect(reply.statusCode).toBe(401)
    expect(reply.json()).toEqual({
      error: 'not_configured',
      message: 'no signing secret is configured for event type tenant.created',
    })
    expect(await store.deliveries.countDocuments({})).toBe(0)
    expect(await store.tenants.countDocuments({ _id: 'tenant-c' })).toBe(0)
  })

  it('answers 401 not_configured for a delivery with no event type at all', async () => {
    const reply = await app.inject({ method: 'POST', url: '/webhooks/platform', payload: {} })
    expect(reply.statusCode).toBe(401)
    expect(reply.json().error).toBe('not_configured')
  })
})

describe('the tenant that is not integrated is untouched (FR-031, SC-008)', () => {
  it('signs in with its password and reads and creates its tasks', async () => {
    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/password',
      payload: { tenant: LOCAL_TENANT_ID, email: 'lena@local.example', password: LOCAL_PASSWORD },
    })
    expect(signIn.statusCode).toBe(200)
    const sessionId = cookieFromReply(
      signIn.headers as Record<string, unknown>,
      SESSION_COOKIE,
    ) as string
    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const read = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      cookies: { [SESSION_COOKIE]: sessionId },
    })
    expect(read.statusCode).toBe(200)
    expect(read.json().tasks.map((task: { title: string }) => task.title)).toEqual([
      'Write the weekly report',
      'Review the backlog',
    ])

    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      cookies: { [SESSION_COOKIE]: sessionId },
      payload: { title: 'A task created with nothing configured' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({
      tenantId: 'local',
      title: 'A task created with nothing configured',
    })
  })

  it('refuses a platform sign-in for it with not_integrated (T020)', async () => {
    const reply = await app.inject({ method: 'GET', url: '/auth/login?tenant=local' })
    expect(reply.statusCode).toBe(404)
    expect(reply.json().error).toBe('not_integrated')
  })

  it('refuses a wrong password with a code from the frozen contract', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/auth/password',
      payload: { tenant: LOCAL_TENANT_ID, email: 'lena@local.example', password: 'wrong' },
    })
    expect(reply.statusCode).toBe(401)
    expect(reply.json()).toEqual({ error: 'unauthenticated', message: 'invalid credentials' })
  })

  it('refuses a password sign-in for an integrated tenant, with a frozen code', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/auth/password',
      payload: { tenant: 'tenant-a', email: 'alice@tenant-a.example', password: LOCAL_PASSWORD },
    })
    expect(reply.statusCode).toBe(401)
    expect(reply.json()).toEqual({
      error: 'unauthenticated',
      message: 'tenant tenant-a signs in through the platform, not with a password',
    })
  })

  it('refuses an unknown tenant with not_found', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/auth/password',
      payload: { tenant: 'tenant-x', email: 'lena@local.example', password: LOCAL_PASSWORD },
    })
    expect(reply.statusCode).toBe(404)
    expect(reply.json()).toEqual({ error: 'not_found', message: 'no tenant tenant-x' })
  })
})

describe('CONTROL: the FR-029 guard is what refuses a token, not a later accident', () => {
  // G1 judged AC-7 while the Bearer path refused in both branches, so part of it was true by
  // absence. Token verification is real now (T024), and these controls re-prove AC-7's token arm:
  // they take the `bearerAvailable` guard away and show how far a genuine token then gets.
  it('control: with no issuer configured and the guard removed, the refusal comes from elsewhere', async () => {
    const jwks = newJwksRegistry()
    const guarded = buildApi({
      config,
      collections: store,
      clock,
      jwks,
      warn: () => {},
    })
    const unguarded = buildApi({
      config,
      collections: store,
      clock,
      jwks,
      warn: () => {},
      testControls: { skipNotConfiguredGuard: true },
    })
    await guarded.ready()
    await unguarded.ready()

    const green = await guarded.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${platformToken}` },
    })
    expect(green.json().message).toBe(
      'no platform issuer is configured, so every platform token is refused',
    )
    // Nothing was fetched: the guard stopped the request before any verification.
    expect(jwks.fetchCount('http://localhost:18480/realms/tenant-a')).toBe(0)

    const red = await unguarded.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${platformToken}` },
    })
    expect(red.statusCode).toBe(401)
    // A different refusal, further down the path: the FR-029 guard is a deliberate check and not a
    // restatement of what would have happened anyway.
    expect(red.json().message).toBe(
      'no tenant is configured for issuer http://localhost:18480/realms/tenant-a',
    )

    await guarded.close()
    await unguarded.close()
  })

  it('control: with the guard removed, a genuine token gets all the way through verification', async () => {
    // The other way to be unconfigured (`bearerAvailable` is issuers AND audience): the issuers are
    // there, the audience is not. With the guard, nothing is verified at all; without it, the token's
    // signature, issuer and expiry are checked against the realm's real keys, and only the audience
    // comparison is left standing between it and acceptance.
    const halfConfigured = loadConfig({
      ...unconfiguredEnv(),
      PLATFORM_ISSUERS: 'tenant-a=http://localhost:18480/realms/tenant-a',
    })
    expect(bearerAvailable(halfConfigured)).toBe(false)
    expect(halfConfigured.platformAudience).toBe('')

    const guardedJwks = newJwksRegistry()
    const guarded = buildApi({
      config: halfConfigured,
      collections: store,
      clock,
      jwks: guardedJwks,
      warn: () => {},
    })
    await guarded.ready()
    const green = await guarded.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${platformToken}` },
    })
    expect(green.statusCode).toBe(401)
    expect(green.json().message).toBe(
      'no platform issuer is configured, so every platform token is refused',
    )
    expect(guardedJwks.fetchCount('http://localhost:18480/realms/tenant-a')).toBe(0)

    const unguardedJwks = newJwksRegistry()
    const unguarded = buildApi({
      config: halfConfigured,
      collections: store,
      clock,
      jwks: unguardedJwks,
      warn: () => {},
      testControls: { skipNotConfiguredGuard: true },
    })
    await unguarded.ready()
    const red = await unguarded.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${platformToken}` },
    })
    expect(red.statusCode).toBe(401)
    // It verified: the key set was fetched and the signature, issuer and expiry all passed.
    expect(unguardedJwks.fetchCount('http://localhost:18480/realms/tenant-a')).toBe(1)
    expect(red.json().message).toBe('the token is addressed to "acme-tasks-api", not to ')

    await guarded.close()
    await unguarded.close()
  })
})
