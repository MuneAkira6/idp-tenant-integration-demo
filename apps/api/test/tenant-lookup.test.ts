/**
 * T038 — a tenant event that does not say enough, and the two ways a lookup can fail (US5, Q11,
 * FR-020, FR-021, checklist L9).
 *
 * The lookup really goes to the mock platform, with a real client-credentials token from the
 * `platform` realm of the Compose stack, which the mock verifies against that realm's keys. The two
 * failures are produced by the mock's own control: `refuse` answers 403, `unreachable` drops the
 * connection — an answer and no answer, which is exactly the distinction FR-021 rests on.
 *
 * The retry and the expiry advance the injected clock rather than waiting (FR-032).
 */

import { CONTROL_ROUTES } from '@acme/contracts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildMockPlatform } from '../../mock-platform/src/server.ts'
import { DAY_MS, HOUR_MS, type ManualClock, MINUTE_MS, manualClock } from '../src/clock.ts'
import { type Config, loadConfig } from '../src/config.ts'
import { type Api, buildApi } from '../src/server.ts'
import { retryPendingLookups } from '../src/tenants/lookup.ts'
import { applyLookedUpTenant } from '../src/tenants/sync.ts'
import { signedDelivery, WEBHOOK_SECRETS } from './events.ts'
import { openTestStore, type TestStore } from './helpers.ts'
import { issuerOf, stackEnv } from './keycloak.ts'

const MOCK_PORT = 18405
const MOCK_BASE = `http://localhost:${MOCK_PORT}`

let store: TestStore
let app: Api
let mock: { app: FastifyInstance }
let config: Config
let clock: ManualClock

/** A `tenant.created` with no `tenant` details: the case FR-020 is about. */
async function postWithoutDetails(deliveryId: string, tenantId: string) {
  const { headers, payload } = signedDelivery({
    deliveryId,
    eventType: 'tenant.created',
    body: { tenantId, occurredAt: '2026-09-30T10:00:00Z' },
    at: clock.now(),
  })
  const reply = await app.inject({ method: 'POST', url: '/webhooks/platform', headers, payload })
  await app.inbox.idle()
  return reply
}

async function setTenantApi(mode: 'normal' | 'refuse' | 'unreachable'): Promise<void> {
  const response = await fetch(`${MOCK_BASE}${CONTROL_ROUTES.tenantApi}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  if (!response.ok) throw new Error(`could not set the tenant API mode: ${response.status}`)
}

const retry = () =>
  retryPendingLookups({ config, collections: store, clock }, async (lookup, tenant) => {
    await applyLookedUpTenant(
      { config, collections: store, clock },
      lookup.platformTenantId,
      tenant,
      clock.now(),
    )
  })

beforeAll(async () => {
  store = await openTestStore('tenant_lookup')
  clock = manualClock(new Date())
  const secrets = stackEnv()
  config = loadConfig({
    ...WEBHOOK_SECRETS,
    PLATFORM_API_BASE_URL: MOCK_BASE,
    PLATFORM_SYNC_ISSUER: issuerOf('platform'),
    PLATFORM_SYNC_CLIENT_ID: 'acme-tasks-sync',
    PLATFORM_SYNC_CLIENT_SECRET: secrets.ACME_TASKS_SYNC_SECRET as string,
  })
  mock = buildMockPlatform(secrets, { platformIssuer: issuerOf('platform') })
  await mock.app.listen({ port: MOCK_PORT, host: '127.0.0.1' })
  app = buildApi({ config, collections: store, clock, warn: () => {} })
  await app.ready()
})

afterAll(async () => {
  app?.inbox.stop()
  await app?.close()
  await mock?.app.close()
  await store?.close()
})

describe('a lookup the platform answers (FR-020)', () => {
  it('fetches the tenant with the application’s own client credentials and applies it', async () => {
    await setTenantApi('normal')
    const reply = await postWithoutDetails('lookup-ok', 'tenant-c')
    expect(reply.statusCode).toBe(200)

    const tenant = await store.tenants.findOne({ _id: 'tenant-c' })
    expect(tenant).toMatchObject({
      name: 'Tenant C',
      issuer: 'http://localhost:18480/realms/tenant-c',
      state: 'active',
      integrated: true,
    })
    expect((await store.deliveries.findOne({ _id: 'lookup-ok' }))?.outcome).toBe('applied')
    // It resolved at once, so nothing is waiting.
    expect(await store.tenantLookups.countDocuments({})).toBe(0)
  })
})

describe('a lookup the platform refuses is rejected and not retried (Q11, FR-021)', () => {
  it('records `rejected`, and an hour later it has not been attempted again', async () => {
    await setTenantApi('refuse')
    const reply = await postWithoutDetails('lookup-refused', 'tenant-refused')
    expect(reply.statusCode).toBe(200)

    const lookup = await store.tenantLookups.findOne({ deliveryId: 'lookup-refused' })
    expect(lookup?.status).toBe('rejected')
    expect(lookup?.attempts).toBe(1)
    expect(lookup?.lastError).toContain('the platform refused the lookup (403)')
    expect(lookup?.nextAttemptAt).toBeUndefined()
    expect(await store.tenants.countDocuments({ _id: 'tenant-refused' })).toBe(0)
    expect((await store.deliveries.findOne({ _id: 'lookup-refused' }))?.outcome).toBe('rejected')

    // This test advances the injected clock instead of waiting an hour (FR-032).
    await clock.advance(HOUR_MS)
    const summary = await retry()
    expect(summary.retried).toBe(0)
    const unchanged = await store.tenantLookups.findOne({ deliveryId: 'lookup-refused' })
    expect(unchanged?.attempts).toBe(1)
    expect(unchanged?.status).toBe('rejected')
  })
})

describe('a lookup that cannot reach the platform is pending, retried, then expired (Q11, FR-021)', () => {
  it('records `pending` with an attempt due in an hour, and the delivery is not left to the sweep', async () => {
    await setTenantApi('unreachable')
    const reply = await postWithoutDetails('lookup-unreachable', 'tenant-c')
    expect(reply.statusCode).toBe(200)

    const lookup = await store.tenantLookups.findOne({ deliveryId: 'lookup-unreachable' })
    expect(lookup?.status).toBe('pending')
    expect(lookup?.attempts).toBe(1)
    expect(lookup?.nextAttemptAt?.getTime()).toBe(clock.now().getTime() + HOUR_MS)
    expect(lookup?.expiresAt.getTime()).toBe(clock.now().getTime() + 30 * DAY_MS)

    // The delivery is processed with `pending`, so the inbox sweep — which looks for deliveries with
    // no `processedAt` — does not also claim it. `tenantLookups.nextAttemptAt` owns it alone.
    const delivery = await store.deliveries.findOne({ _id: 'lookup-unreachable' })
    expect(delivery?.outcome).toBe('pending')
    expect(delivery?.processedAt).toBeInstanceOf(Date)
    expect(await app.inbox.sweep()).toBe(0)
  })

  it('is not retried before the hour is up', async () => {
    await clock.advance(59 * MINUTE_MS)
    const summary = await retry()
    expect(summary.retried).toBe(0)
    expect(
      (await store.tenantLookups.findOne({ deliveryId: 'lookup-unreachable' }))?.attempts,
    ).toBe(1)
  })

  it('is retried once the clock passes the hour, and resolves when the platform answers again', async () => {
    await clock.advance(MINUTE_MS)
    await setTenantApi('normal')
    const summary = await retry()
    expect(summary).toMatchObject({ retried: 1, resolved: 1 })

    const lookup = await store.tenantLookups.findOne({ deliveryId: 'lookup-unreachable' })
    expect(lookup?.status).toBe('resolved')
    expect(lookup?.nextAttemptAt).toBeUndefined()
    expect(await store.tenants.countDocuments({ _id: 'tenant-c' })).toBe(1)
  })

  it('and one that never reaches the platform expires after 30 days', async () => {
    await setTenantApi('unreachable')
    await postWithoutDetails('lookup-expires', 'tenant-gone')
    const created = await store.tenantLookups.findOne({ deliveryId: 'lookup-expires' })
    expect(created?.status).toBe('pending')

    // Twenty-nine days of hourly retries keep it pending; the thirtieth expires it (FR-032: the
    // injected clock is advanced, not waited out).
    for (let day = 0; day < 29; day += 1) {
      await clock.advance(DAY_MS)
      await retry()
    }
    expect((await store.tenantLookups.findOne({ deliveryId: 'lookup-expires' }))?.status).toBe(
      'pending',
    )
    expect(
      (await store.tenantLookups.findOne({ deliveryId: 'lookup-expires' }))?.attempts,
    ).toBeGreaterThan(1)

    await clock.advance(DAY_MS + MINUTE_MS)
    const summary = await retry()
    expect(summary.expired).toBe(1)
    const expired = await store.tenantLookups.findOne({ deliveryId: 'lookup-expires' })
    expect(expired?.status).toBe('expired')
    expect(expired?.nextAttemptAt).toBeUndefined()
    expect(await store.tenants.countDocuments({ _id: 'tenant-gone' })).toBe(0)

    // And an expired lookup is never attempted again.
    const attempts = expired?.attempts
    await clock.advance(HOUR_MS)
    await retry()
    expect((await store.tenantLookups.findOne({ deliveryId: 'lookup-expires' }))?.attempts).toBe(
      attempts,
    )
  })
})

describe('the two failures are different branches with different outcomes (L9)', () => {
  it('refused and unreachable never produce the same record', async () => {
    const refused = await store.tenantLookups.findOne({ deliveryId: 'lookup-refused' })
    const unreachable = await store.tenantLookups.findOne({ deliveryId: 'lookup-expires' })
    expect(refused?.status).toBe('rejected')
    expect(unreachable?.status).toBe('expired')
    expect(refused?.nextAttemptAt).toBeUndefined()
    expect(refused?.attempts).toBe(1)
    // The unreachable one was tried again and again; the refused one was tried once and dropped.
    expect(unreachable?.attempts).toBeGreaterThan(refused?.attempts as number)
  })
})
