/**
 * T043, T044, T045, T062 — the device pull (US6, Q12, SC-006, FR-023 to FR-025).
 *
 * The devices really come from the mock platform over HTTP, with a real client-credentials token the
 * mock verifies against the `platform` realm's keys. `tenant-a` has 450 devices there, which is three
 * pages of 200 — the page count of Q12 comes from the contract's own `DEVICE_PAGE_SIZE`.
 */

import { CONTROL_ROUTES, DEVICE_PAGE_SIZE, SESSION_COOKIE } from '@acme/contracts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildMockPlatform } from '../../mock-platform/src/server.ts'
import { newJwksRegistry } from '../src/auth/bearer.ts'
import { forgetDiscovery } from '../src/auth/platform.ts'
import { HOUR_MS, type ManualClock, manualClock } from '../src/clock.ts'
import { loadConfig } from '../src/config.ts'
import { pullDevices } from '../src/devices/pull.ts'
import { startScheduler } from '../src/scheduler.ts'
import { seedConfiguredPlatformTenants } from '../src/seed.ts'
import { buildApi } from '../src/server.ts'
import { signedDelivery, WEBHOOK_SECRETS } from './events.ts'
import { openTestStore, type TestStore } from './helpers.ts'
import { integratedEnv, issuerOf, signInThroughPlatform, stackEnv } from './keycloak.ts'

const MOCK_PORT = 18406
const MOCK_BASE = `http://localhost:${MOCK_PORT}`
const TENANT_A_DEVICES = 450

let store: TestStore
let mock: { app: FastifyInstance }
let clock: ManualClock

/** The same deployment twice: once with the device pull on, once with it off (AC-29). */
function envFor(pull: 'on' | 'off'): NodeJS.ProcessEnv {
  const secrets = stackEnv()
  return {
    ...integratedEnv({ tenants: ['tenant-a', 'tenant-b'] }),
    ...WEBHOOK_SECRETS,
    PLATFORM_API_BASE_URL: MOCK_BASE,
    PLATFORM_SYNC_ISSUER: issuerOf('platform'),
    PLATFORM_SYNC_CLIENT_ID: 'acme-tasks-sync',
    PLATFORM_SYNC_CLIENT_SECRET: secrets.ACME_TASKS_SYNC_SECRET as string,
    DEVICE_PULL_ENABLED: pull === 'on' ? 'true' : 'false',
  }
}

async function setDeviceApi(mode: 'normal' | 'fail-on-page', page?: number): Promise<void> {
  const response = await fetch(`${MOCK_BASE}${CONTROL_ROUTES.deviceApi}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode, ...(page ? { page } : {}) }),
  })
  if (!response.ok) throw new Error(`could not set the device API mode: ${response.status}`)
}

beforeAll(async () => {
  forgetDiscovery()
  store = await openTestStore('devices')
  clock = manualClock(new Date())
  mock = buildMockPlatform(stackEnv(), { platformIssuer: issuerOf('platform') })
  await mock.app.listen({ port: MOCK_PORT, host: '127.0.0.1' })
  await seedConfiguredPlatformTenants(store, loadConfig(envFor('on')).platformTenants.values())
})

afterAll(async () => {
  await mock?.app.close()
  await store?.close()
})

describe('a tenant with more devices than fit one page (T043, Q12, FR-023)', () => {
  it('stores all 450, over three pages', async () => {
    const config = loadConfig(envFor('on'))
    expect(config.devicePull.pageSize).toBe(DEVICE_PAGE_SIZE)

    const result = await pullDevices({ config, collections: store, clock }, 'tenant-a')
    expect(result).toMatchObject({ status: 'succeeded', devices: TENANT_A_DEVICES, pages: 3 })
    expect(Math.ceil(TENANT_A_DEVICES / DEVICE_PAGE_SIZE)).toBe(3)

    expect(await store.devices.countDocuments({ tenantId: 'tenant-a' })).toBe(TENANT_A_DEVICES)
    const first = await store.devices.findOne({ _id: 'tenant-a:tenant-a-device-0001' })
    expect(first).toMatchObject({ tenantId: 'tenant-a', platformDeviceId: 'tenant-a-device-0001' })
    const last = await store.devices.findOne({ _id: `tenant-a:tenant-a-device-0450` })
    expect(last).not.toBeNull()

    const state = await store.deviceSyncStates.findOne({ _id: 'tenant-a' })
    expect(state?.source).toBe(`${MOCK_BASE}/tenants/tenant-a/devices`)
    expect(state?.lastSuccessAt).toBeInstanceOf(Date)
    expect(state?.lastError).toBeUndefined()
  })

  it('a tenant with fewer devices than a page needs one page', async () => {
    const config = loadConfig(envFor('on'))
    const result = await pullDevices({ config, collections: store, clock }, 'tenant-b')
    expect(result).toMatchObject({ status: 'succeeded', devices: 3, pages: 1 })
    expect(await store.devices.countDocuments({ tenantId: 'tenant-b' })).toBe(3)
  })
})

describe('a pull that fails on the second page (T044, SC-006, FR-024, checklist L10)', () => {
  it('keeps lastSuccessAt, records lastError and lastAttemptAt, and keeps page one', async () => {
    const config = loadConfig(envFor('on'))
    // There is a success to preserve: without one, "not written" could not be told from "nothing to
    // write". This is the value that must survive the failure.
    const before = await store.deviceSyncStates.findOne({ _id: 'tenant-a' })
    const successBefore = before?.lastSuccessAt
    expect(successBefore).toBeInstanceOf(Date)

    await store.devices.deleteMany({ tenantId: 'tenant-a' })
    await setDeviceApi('fail-on-page', 2)
    await clock.advance(HOUR_MS)

    const result = await pullDevices({ config, collections: store, clock }, 'tenant-a')
    expect(result.status).toBe('failed')
    expect(result).toMatchObject({ pages: 1, devices: DEVICE_PAGE_SIZE })

    const after = await store.deviceSyncStates.findOne({ _id: 'tenant-a' })
    // The time of the last success is exactly what it was.
    expect(after?.lastSuccessAt?.toISOString()).toBe(successBefore?.toISOString())
    // The attempt and the error moved.
    expect(after?.lastError).toContain('page 2')
    expect(after?.lastAttemptAt?.getTime()).toBeGreaterThan(
      before?.lastAttemptAt?.getTime() as number,
    )
    // Page one was not thrown away because page two failed.
    expect(await store.devices.countDocuments({ tenantId: 'tenant-a' })).toBe(DEVICE_PAGE_SIZE)

    await setDeviceApi('normal')
  })

  it('and `GET /api/devices` shows the source and the times (checklist M10)', async () => {
    const config = loadConfig(envFor('on'))
    const app = buildApi({
      config,
      collections: store,
      clock,
      jwks: newJwksRegistry(),
      warn: () => {},
    })
    await app.ready()
    // mia is the `manager` of tenant-a, the lowest role the permission table lets read devices.
    const { sessionId } = await signInThroughPlatform(app, { tenant: 'tenant-a', username: 'mia' })
    const reply = await app.inject({
      method: 'GET',
      url: '/api/devices',
      cookies: { [SESSION_COOKIE]: sessionId },
    })
    expect(reply.statusCode).toBe(200)
    const body = reply.json()
    expect(body.devices).toHaveLength(DEVICE_PAGE_SIZE)
    expect(body.syncState.source).toBe(`${MOCK_BASE}/tenants/tenant-a/devices`)
    expect(body.syncState.lastError).toContain('page 2')
    expect(body.syncState.lastSuccessAt).not.toBeNull()
    app.inbox.stop()
    await app.close()
  })
})

describe('with the device pull switched off, no pull runs (T045, FR-025)', () => {
  it('the positive case first: with the flag on, the hourly job does pull', async () => {
    await store.devices.deleteMany({})
    const config = loadConfig(envFor('on'))
    const on = manualClock(new Date())
    const app = buildApi({ config, collections: store, clock: on, warn: () => {} })
    await app.ready()
    const scheduler = startScheduler({ config, collections: store, clock: on, inbox: app.inbox })

    await on.advance(HOUR_MS)
    expect(scheduler.jobs().find((job) => job.job === 'devices.pull')?.runs).toBe(1)
    expect(await store.devices.countDocuments({ tenantId: 'tenant-a' })).toBe(TENANT_A_DEVICES)

    scheduler.stop()
    app.inbox.stop()
    await app.close()
  })

  it('and with the flag off, the same hour passes and nothing is pulled', async () => {
    await store.devices.deleteMany({})
    await store.deviceSyncStates.deleteMany({})
    const config = loadConfig(envFor('off'))
    expect(config.devicePull.enabled).toBe(false)

    const off = manualClock(new Date())
    const app = buildApi({ config, collections: store, clock: off, warn: () => {} })
    await app.ready()
    const scheduler = startScheduler({ config, collections: store, clock: off, inbox: app.inbox })

    await off.advance(HOUR_MS)
    // The job did run — it is scheduled either way — and it pulled nothing.
    expect(scheduler.jobs().find((job) => job.job === 'devices.pull')?.runs).toBe(1)
    expect(await store.devices.countDocuments({})).toBe(0)
    expect(await store.deviceSyncStates.countDocuments({})).toBe(0)

    // And a direct pull reports itself off rather than failing.
    expect(await pullDevices({ config, collections: store, clock: off }, 'tenant-a')).toEqual({
      status: 'off',
    })

    scheduler.stop()
    app.inbox.stop()
    await app.close()
  })
})

describe('a tenant.created event pulls at once (T062, AC-30, FR-023)', () => {
  it('without the clock advancing, and only because of the event', async () => {
    await store.devices.deleteMany({})
    await store.deviceSyncStates.deleteMany({})
    const config = loadConfig(envFor('on'))
    const still = manualClock(new Date())
    const startedAt = still.now().getTime()
    const app = buildApi({ config, collections: store, clock: still, warn: () => {} })
    await app.ready()
    // No scheduler at all here, so no timer can be the cause.
    expect(await store.devices.countDocuments({ tenantId: 'tenant-b' })).toBe(0)

    const { headers, payload } = signedDelivery({
      deliveryId: 'created-pulls',
      eventType: 'tenant.created',
      body: {
        tenantId: 'tenant-b',
        occurredAt: new Date(startedAt).toISOString(),
        tenant: { name: 'Tenant B', issuer: issuerOf('tenant-b') },
      },
      at: still.now(),
    })
    const reply = await app.inject({ method: 'POST', url: '/webhooks/platform', headers, payload })
    await app.inbox.idle()
    expect(reply.statusCode).toBe(200)

    // The clock has not moved, and the devices are there.
    expect(still.now().getTime()).toBe(startedAt)
    expect(await store.devices.countDocuments({ tenantId: 'tenant-b' })).toBe(3)
    expect(
      (await store.deviceSyncStates.findOne({ _id: 'tenant-b' }))?.lastSuccessAt,
    ).toBeInstanceOf(Date)
    // Attributable to the event: only the tenant the event named was pulled for.
    expect(await store.devices.countDocuments({ tenantId: 'tenant-a' })).toBe(0)

    app.inbox.stop()
    await app.close()
  })
})
