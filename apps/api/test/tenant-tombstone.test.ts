/**
 * T039 — a deleted tenant is a tombstone (US5 scenario 3, FR-022, clarification C3).
 *
 * Sign-in and API calls are refused at once, whichever way in is used; the data is kept until
 * `purgeAfter` and gone after it. The tenant document itself survives the purge, because it is what
 * stops a late `tenant.created` reviving the tenant (research R-9) — which the last test checks.
 *
 * The purge advances the injected clock rather than waiting thirty days (FR-032).
 */

import { SESSION_COOKIE } from '@acme/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newJwksRegistry } from '../src/auth/bearer.ts'
import { forgetDiscovery } from '../src/auth/platform.ts'
import { DAY_MS, type ManualClock, MINUTE_MS, manualClock } from '../src/clock.ts'
import { type Config, loadConfig } from '../src/config.ts'
import { LOCAL_TENANT_ID, seedConfiguredPlatformTenants, seedLocalTenant } from '../src/seed.ts'
import { type Api, buildApi } from '../src/server.ts'
import { purgeDeletedTenants } from '../src/tenants/sync.ts'
import { signedDelivery, WEBHOOK_SECRETS } from './events.ts'
import { openTestStore, type TestStore } from './helpers.ts'
import { directGrantToken, integratedEnv, signInThroughPlatform } from './keycloak.ts'

/** The clock starts at the real now, so that tokens Keycloak issues are not already expired. */
const STARTED_AT = new Date()
const DELETED_AT = STARTED_AT.toISOString()

let store: TestStore
let app: Api
let config: Config
let clock: ManualClock
let sessionId: string
let aliceToken: string

beforeAll(async () => {
  forgetDiscovery()
  store = await openTestStore('tombstone')
  clock = manualClock(STARTED_AT)
  config = loadConfig({ ...integratedEnv({ tenants: ['tenant-a'] }), ...WEBHOOK_SECRETS })
  await seedLocalTenant(store, 'a-password-only-this-test-knows', clock.now())
  await seedConfiguredPlatformTenants(store, config.platformTenants.values())
  app = buildApi({ config, collections: store, clock, jwks: newJwksRegistry(), warn: () => {} })
  await app.ready()

  // Alice signs in and creates a task while the tenant is still alive.
  const signedIn = await signInThroughPlatform(app, { tenant: 'tenant-a', username: 'alice' })
  sessionId = signedIn.sessionId
  await app.inject({
    method: 'POST',
    url: '/api/tasks',
    cookies: { [SESSION_COOKIE]: sessionId },
    payload: { title: 'A task from before the deletion' },
  })
  aliceToken = await directGrantToken({
    realm: 'tenant-a',
    username: 'alice',
    secretName: 'ACME_TASKS_SECRET_TENANT_A',
  })
})

afterAll(async () => {
  app?.inbox.stop()
  await app?.close()
  await store?.close()
})

describe('while the tenant is alive', () => {
  it('sign-in, the session and a platform token all work', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/auth/login?tenant=tenant-a' })).statusCode,
    ).toBe(302)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/tasks',
          cookies: { [SESSION_COOKIE]: sessionId },
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/tasks',
          headers: { authorization: `Bearer ${aliceToken}` },
        })
      ).statusCode,
    ).toBe(200)
  })
})

describe('a tenant.deleted event makes it a tombstone (FR-022)', () => {
  it('marks it deleted with purgeAfter 30 days out, and keeps its data', async () => {
    const { headers, payload } = signedDelivery({
      deliveryId: 'delete-tenant-a',
      eventType: 'tenant.deleted',
      body: { tenantId: 'tenant-a', occurredAt: DELETED_AT },
      at: clock.now(),
    })
    const reply = await app.inject({ method: 'POST', url: '/webhooks/platform', headers, payload })
    await app.inbox.idle()
    expect(reply.statusCode).toBe(200)

    const tenant = await store.tenants.findOne({ _id: 'tenant-a' })
    expect(tenant?.state).toBe('deleted')
    expect(tenant?.deletedAt?.toISOString()).toBe(new Date(DELETED_AT).toISOString())
    expect(tenant?.purgeAfter?.toISOString()).toBe(
      new Date(new Date(DELETED_AT).getTime() + 30 * DAY_MS).toISOString(),
    )
    // The data is still there.
    expect(await store.users.countDocuments({ tenantId: 'tenant-a' })).toBe(1)
    expect(await store.tasks.countDocuments({ tenantId: 'tenant-a' })).toBe(1)
  })

  it('refuses sign-in for it', async () => {
    const reply = await app.inject({ method: 'GET', url: '/auth/login?tenant=tenant-a' })
    expect(reply.statusCode).toBe(403)
    expect(reply.json()).toEqual({ error: 'tenant_deleted', message: 'tenant tenant-a is deleted' })
  })

  it('refuses its API calls over a session', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      cookies: { [SESSION_COOKIE]: sessionId },
    })
    expect(reply.statusCode).toBe(403)
    expect(reply.json()).toEqual({ error: 'tenant_deleted', message: 'tenant tenant-a is deleted' })
  })

  it('refuses its API calls over a platform token as well', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${aliceToken}` },
    })
    expect(reply.statusCode).toBe(403)
    expect(reply.json()).toEqual({ error: 'tenant_deleted', message: 'tenant tenant-a is deleted' })
  })

  it('keeps the data while the clock is short of purgeAfter', async () => {
    // This test advances the injected clock instead of waiting (FR-032).
    await clock.advance(30 * DAY_MS - MINUTE_MS)
    const purged = await purgeDeletedTenants(store, clock)
    expect(purged.tenants).toEqual([])
    expect(await store.users.countDocuments({ tenantId: 'tenant-a' })).toBe(1)
    expect(await store.tasks.countDocuments({ tenantId: 'tenant-a' })).toBe(1)
  })

  it('removes the data once the clock passes purgeAfter, and keeps the tombstone', async () => {
    await clock.advance(2 * MINUTE_MS)
    const purged = await purgeDeletedTenants(store, clock)
    expect(purged.tenants).toEqual(['tenant-a'])
    expect(purged.users).toBe(1)
    expect(purged.tasks).toBe(1)

    expect(await store.users.countDocuments({ tenantId: 'tenant-a' })).toBe(0)
    expect(await store.tasks.countDocuments({ tenantId: 'tenant-a' })).toBe(0)
    expect(await store.sessions.countDocuments({ tenantId: 'tenant-a' })).toBe(0)

    // The tombstone stays, with the time of the purge on it.
    const tenant = await store.tenants.findOne({ _id: 'tenant-a' })
    expect(tenant?.state).toBe('deleted')
    expect(tenant?.purgedAt).toBeInstanceOf(Date)
  })

  it('and a late created event still cannot revive it, which is why the tombstone stays', async () => {
    const { headers, payload } = signedDelivery({
      deliveryId: 'late-create-tenant-a',
      eventType: 'tenant.created',
      // Older than the deletion: the platform created it before it deleted it.
      body: {
        tenantId: 'tenant-a',
        occurredAt: new Date(STARTED_AT.getTime() - 60 * 60 * 1000).toISOString(),
        tenant: { name: 'Tenant A', issuer: 'http://localhost:18480/realms/tenant-a' },
      },
      at: clock.now(),
    })
    const reply = await app.inject({ method: 'POST', url: '/webhooks/platform', headers, payload })
    await app.inbox.idle()
    expect(reply.statusCode).toBe(200)
    expect((await store.deliveries.findOne({ _id: 'late-create-tenant-a' }))?.outcome).toBe(
      'ignored',
    )
    expect((await store.tenants.findOne({ _id: 'tenant-a' }))?.state).toBe('deleted')
  })
})

describe('the tenant that is not integrated is untouched throughout', () => {
  it('`local` still has its three users and four tasks, and is still active', async () => {
    const local = await store.tenants.findOne({ _id: LOCAL_TENANT_ID })
    expect(local?.state).toBe('active')
    expect(local?.purgedAt).toBeUndefined()
    expect(await store.users.countDocuments({ tenantId: LOCAL_TENANT_ID })).toBe(3)
    expect(await store.tasks.countDocuments({ tenantId: LOCAL_TENANT_ID })).toBe(4)
  })
})
