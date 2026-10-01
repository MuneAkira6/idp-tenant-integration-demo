/**
 * T021, T022, T059 — another client calls the existing API with a platform token (US2, Q4, Q5).
 *
 * The tokens are real: they come from the tenant realms of the Compose stack by direct grant, and
 * they are verified against the realms' published keys. The expired case advances the injected clock
 * instead of waiting out a token's lifetime, and says so (FR-032, research R-11).
 */

import { audiences, FLOW_COOKIE, SESSION_COOKIE } from '@acme/contracts'
import type { FastifyInstance } from 'fastify'
import { decodeJwt } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newJwksRegistry } from '../src/auth/bearer.ts'
import { forgetDiscovery } from '../src/auth/platform.ts'
import { MINUTE_MS, manualClock, systemClock } from '../src/clock.ts'
import { type Config, loadConfig } from '../src/config.ts'
import type { Collections } from '../src/db.ts'
import { seedConfiguredPlatformTenants, seedLocalTenant } from '../src/seed.ts'
import { buildApi } from '../src/server.ts'
import { openTestStore, type TestStore } from './helpers.ts'
import {
  callbackPathOf,
  cookieFromReply,
  directGrantToken,
  integratedEnv,
  newBrowser,
  stackEnv,
} from './keycloak.ts'

const COLLECTIONS = [
  'tenants',
  'users',
  'sessions',
  'tasks',
  'deliveries',
  'tenantLookups',
  'devices',
  'deviceSyncStates',
  'subscriptions',
] as const

async function countAll(store: Collections): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const name of COLLECTIONS) {
    counts[name] = await store[name].countDocuments({})
  }
  return counts
}

let store: TestStore
let app: FastifyInstance
let config: Config
let bobToken: string

beforeAll(async () => {
  forgetDiscovery()
  store = await openTestStore('bearer')
  config = loadConfig(integratedEnv())
  await seedLocalTenant(store, 'unused-here', systemClock().now())
  await seedConfiguredPlatformTenants(store, config.platformTenants.values())
  app = buildApi({
    config,
    collections: store,
    clock: systemClock(),
    jwks: newJwksRegistry(),
    warn: () => {},
  })
  await app.ready()
  bobToken = await directGrantToken({
    realm: 'tenant-b',
    username: 'bob',
    secretName: 'ACME_TASKS_SECRET_TENANT_B',
  })
})

afterAll(async () => {
  await app?.close()
  await store?.close()
})

describe('a Bearer call runs as the user and writes nothing else (T021, Q4, FR-009)', () => {
  it('serves bob@tenant-b, creating only his user and no session', async () => {
    const before = await countAll(store)

    const reply = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${bobToken}` },
    })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual({ tasks: [] })

    const after = await countAll(store)
    // Only `users` moved, and only by the one-time creation of a user never seen before (FR-009).
    expect(after.users).toBe((before.users as number) + 1)
    for (const name of COLLECTIONS) {
      if (name === 'users') continue
      expect({ [name]: after[name] }).toEqual({ [name]: before[name] })
    }
    expect(after.sessions).toBe(0)

    const bob = await store.users.findOne({ tenantId: 'tenant-b' })
    expect(bob?.email).toBe('bob@tenant-b.example')
    expect(bob?.platformSubject).toBe(decodeJwt(bobToken).sub)
  })

  it('a second call for the same user writes nothing at all', async () => {
    const before = await countAll(store)
    const reply = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${bobToken}` },
    })
    expect(reply.statusCode).toBe(200)
    expect(await countAll(store)).toEqual(before)
  })

  it('the tasks it serves are his own tenant’s only (FR-035)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${bobToken}` },
      payload: { title: 'A task created over a Bearer call' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ tenantId: 'tenant-b' })

    const read = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${bobToken}` },
    })
    expect(read.json().tasks).toHaveLength(1)
    expect(read.json().tasks[0]).toMatchObject({ tenantId: 'tenant-b' })
  })
})

describe('tokens that must be refused (T022, Q5, FR-008)', () => {
  it('an expired token answers 401 invalid_token', async () => {
    // Its own API and its own clock, so that advancing time here cannot reach the other tests.
    const aging = manualClock(new Date())
    const ageing = buildApi({
      config,
      collections: store,
      clock: aging,
      jwks: newJwksRegistry(),
      warn: () => {},
    })
    await ageing.ready()
    const token = await directGrantToken({
      realm: 'tenant-a',
      username: 'alice',
      secretName: 'ACME_TASKS_SECRET_TENANT_A',
    })
    const accepted = await ageing.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(accepted.statusCode).toBe(200)

    // This test advances the injected clock rather than waiting out the token's 300 s lifetime and
    // the 30 s tolerance of research R-4 (FR-032).
    await aging.advance(10 * MINUTE_MS)

    const reply = await ageing.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(reply.statusCode).toBe(401)
    expect(reply.json().error).toBe('invalid_token')
    expect(reply.json().message).toContain('"exp" claim timestamp check failed')
    await ageing.close()
  })

  it('a token addressed elsewhere answers 401 invalid_token', async () => {
    // The `acme-reports` client carries no audience mapper, so its tokens are not addressed to us.
    const token = await directGrantToken({
      realm: 'tenant-a',
      username: 'alice',
      clientId: 'acme-reports',
      secretName: 'ACME_REPORTS_SECRET_TENANT_A',
    })
    const claims = decodeJwt(token)
    expect(audiences(claims)).not.toContain('acme-tasks-api')

    const reply = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(reply.statusCode).toBe(401)
    expect(reply.json().error).toBe('invalid_token')
    expect(reply.json().message).toContain('not to acme-tasks-api')
  })

  it('a token from an issuer we do not know answers 401 invalid_token', async () => {
    const response = await fetch(
      'http://localhost:18480/realms/platform/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: 'acme-tasks-sync',
          client_secret: stackEnv().ACME_TASKS_SYNC_SECRET as string,
        }),
      },
    )
    const token = ((await response.json()) as { access_token: string }).access_token
    expect(decodeJwt(token).iss).toBe('http://localhost:18480/realms/platform')

    const reply = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(reply.statusCode).toBe(401)
    expect(reply.json()).toEqual({
      error: 'invalid_token',
      message: 'no tenant is configured for issuer http://localhost:18480/realms/platform',
    })
  })

  it('a tenant realm that is not configured is an unknown issuer too', async () => {
    const onlyA = loadConfig(integratedEnv({ tenants: ['tenant-a'] }))
    const narrow = buildApi({
      config: onlyA,
      collections: store,
      clock: systemClock(),
      jwks: newJwksRegistry(),
      warn: () => {},
    })
    await narrow.ready()
    const reply = await narrow.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${bobToken}` },
    })
    expect(reply.statusCode).toBe(401)
    expect(reply.json().message).toBe(
      'no tenant is configured for issuer http://localhost:18480/realms/tenant-b',
    )
    await narrow.close()
  })

  it('something that is not a JWT answers 401 invalid_token', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: 'Bearer not-a-token' },
    })
    expect(reply.statusCode).toBe(401)
    expect(reply.json()).toEqual({
      error: 'invalid_token',
      message: 'the bearer token is not a JWT',
    })
  })
})

describe('a session decides when present (T059, AC-12, FR-007)', () => {
  it('runs as Alice of tenant-a although the request also carries Bob’s tenant-b token', async () => {
    const live = buildApi({
      config,
      collections: store,
      clock: systemClock(),
      jwks: newJwksRegistry(),
      warn: () => {},
    })
    await live.ready()

    const login = await live.inject({ method: 'GET', url: '/auth/login?tenant=tenant-a' })
    const flowCookie = cookieFromReply(
      login.headers as Record<string, unknown>,
      FLOW_COOKIE,
    ) as string
    const browser = newBrowser('alice', stackEnv().KEYCLOAK_SEED_PASSWORD as string)
    const { callbackUrl } = await browser.authorize(login.headers.location as string)
    const signedIn = await live.inject({
      method: 'GET',
      url: callbackPathOf(callbackUrl as string),
      cookies: { [FLOW_COOKIE]: flowCookie },
    })
    const sessionId = cookieFromReply(
      signedIn.headers as Record<string, unknown>,
      SESSION_COOKIE,
    ) as string

    const created = await live.inject({
      method: 'POST',
      url: '/api/tasks',
      cookies: { [SESSION_COOKIE]: sessionId },
      headers: { authorization: `Bearer ${bobToken}` },
      payload: { title: 'Whose task is this?' },
    })
    expect(created.statusCode).toBe(201)
    // The two identities are in different tenants, so the wrong answer would be unmistakable.
    expect(created.json().tenantId).toBe('tenant-a')

    const alice = await store.users.findOne({
      tenantId: 'tenant-a',
      email: 'alice@tenant-a.example',
    })
    expect(created.json().userId).toBe(String(alice?._id))

    // The header is not read at all when a session is present: a broken one changes nothing.
    const withGarbage = await live.inject({
      method: 'GET',
      url: '/api/tasks',
      cookies: { [SESSION_COOKIE]: sessionId },
      headers: { authorization: 'Bearer not-a-token-at-all' },
    })
    expect(withGarbage.statusCode).toBe(200)
    expect(
      withGarbage.json().tasks.every((task: { tenantId: string }) => task.tenantId === 'tenant-a'),
    ).toBe(true)

    await live.close()
  })
})
