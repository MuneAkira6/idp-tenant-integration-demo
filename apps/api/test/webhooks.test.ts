/**
 * T030, T035, T060, T061 — platform events arrive safely (US4, Q8, SC-003, FR-014 to FR-018).
 *
 * The mock platform and the API are both listening here, and the mock really posts to the API's
 * webhook route: the signature that is verified is the one the mock put on the wire. The mock builds
 * it from the frozen helpers of `packages/contracts` and never imports the API's code, so the two
 * sides agreeing is an observation and not an artefact of sharing an implementation.
 */

import {
  CONTROL_ROUTES,
  DELIVERY_RETENTION_DAYS,
  EVENT_HEADERS,
  webhookSecretEnvName,
} from '@acme/contracts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildMockPlatform } from '../../mock-platform/src/server.ts'
import { DAY_MS, systemClock } from '../src/clock.ts'
import { type Config, loadConfig } from '../src/config.ts'
import type { Collections } from '../src/db.ts'
import { type Api, buildApi } from '../src/server.ts'
import { openTestStore, type TestStore } from './helpers.ts'

const API_PORT = 18403
const MOCK_PORT = 18404
const API_BASE = `http://localhost:${API_PORT}`
const MOCK_BASE = `http://localhost:${MOCK_PORT}`

const SECRETS = {
  WEBHOOK_SECRET_TENANT_CREATED: 'created-secret-of-this-test-run',
  WEBHOOK_SECRET_TENANT_DELETED: 'deleted-secret-of-this-test-run',
  // A secret for a type the application does not handle: such a delivery is stored as `ignored`.
  WEBHOOK_SECRET_TENANT_RENAMED: 'renamed-secret-of-this-test-run',
}

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
  for (const name of COLLECTIONS) counts[name] = await store[name].countDocuments({})
  return counts
}

let store: TestStore
let app: Api
let mock: { app: FastifyInstance; state: ReturnType<typeof buildMockPlatform>['state'] }
let config: Config

type DeliverBody = {
  eventType: string
  body: unknown
  deliveryId?: string
  timestamp?: number
  signWith?: string
}

async function deliver(
  payload: DeliverBody,
): Promise<{ deliveryId: string; delivered: Array<{ status: number }> }> {
  const response = await fetch(`${MOCK_BASE}${CONTROL_ROUTES.deliver}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = (await response.json()) as {
    deliveryId: string
    delivered: Array<{ status: number }>
  }
  await app.inbox.idle()
  return result
}

async function redeliver(deliveryId: string): Promise<{ delivered: Array<{ status: number }> }> {
  const response = await fetch(`${MOCK_BASE}${CONTROL_ROUTES.redeliver}/${deliveryId}`, {
    method: 'POST',
  })
  const result = (await response.json()) as { delivered: Array<{ status: number }> }
  await app.inbox.idle()
  return result
}

beforeAll(async () => {
  store = await openTestStore('webhooks')
  config = loadConfig({
    ...SECRETS,
    API_PUBLIC_URL: API_BASE,
    API_PORT: String(API_PORT),
    PLATFORM_API_BASE_URL: MOCK_BASE,
  })
  mock = buildMockPlatform(SECRETS)
  await mock.app.listen({ port: MOCK_PORT, host: '127.0.0.1' })

  app = buildApi({ config, collections: store, clock: systemClock(), warn: () => {} })
  await app.startUp()
  await app.listen({ port: API_PORT, host: '127.0.0.1' })
})

afterAll(async () => {
  app?.inbox.stop()
  await app?.close()
  await mock?.app.close()
  await store?.close()
})

describe('subscriptions registered from the route table at start-up (T035, T061, AC-22, FR-018)', () => {
  it('the callback URL is the URL of the route tagged as a webhook, not a written-down string', async () => {
    // Collected by Fastify's `onRoute` hook from the tag, not from a literal.
    expect(app.webhookRoutes).toEqual(['/webhooks/platform'])

    const response = await fetch(`${MOCK_BASE}/subscriptions`)
    const { subscriptions } = (await response.json()) as {
      subscriptions: Array<{ eventType: string; callbackUrl: string }>
    }
    expect(subscriptions.map((s) => s.eventType).sort()).toEqual([
      'tenant.created',
      'tenant.deleted',
    ])
    for (const subscription of subscriptions) {
      expect(subscription.callbackUrl).toBe(`${API_BASE}${app.webhookRoutes[0]}`)
      expect(subscription.callbackUrl).toBe(`${API_BASE}/webhooks/platform`)
    }
  })
})

describe('one delivery id sent three times has one effect (T030, Q8, SC-003, FR-016)', () => {
  it('creates the tenant once and acknowledges every repeat', async () => {
    const before = await countAll(store)
    const { deliveryId, delivered } = await deliver({
      eventType: 'tenant.created',
      body: {
        tenantId: 'tenant-c',
        occurredAt: '2026-09-30T10:00:00Z',
        tenant: { name: 'Tenant C', issuer: 'http://localhost:18480/realms/tenant-c' },
      },
    })
    expect(delivered.map((attempt) => attempt.status)).toEqual([200])

    const second = await redeliver(deliveryId)
    const third = await redeliver(deliveryId)
    expect(second.delivered.map((a) => a.status)).toEqual([200])
    expect(third.delivered.map((a) => a.status)).toEqual([200])

    // One effect.
    expect(await store.tenants.countDocuments({ _id: 'tenant-c' })).toBe(1)
    const tenant = await store.tenants.findOne({ _id: 'tenant-c' })
    expect(tenant).toMatchObject({ name: 'Tenant C', state: 'active' })

    // One delivery remembered, processed once, whatever the number of deliveries.
    expect(await store.deliveries.countDocuments({ _id: deliveryId })).toBe(1)
    const stored = await store.deliveries.findOne({ _id: deliveryId })
    expect(stored?.outcome).toBe('applied')

    const after = await countAll(store)
    expect(after.tenants).toBe((before.tenants as number) + 1)
    expect(after.deliveries).toBe((before.deliveries as number) + 1)
  })
})

describe('a forged or stale delivery is refused and has no effect (Q8, SC-003, FR-014, FR-015)', () => {
  it('a signature that does not match the body answers 401 bad_signature, with no effect', async () => {
    const before = await countAll(store)
    const { delivered } = await deliver({
      eventType: 'tenant.created',
      body: { tenantId: 'tenant-forged', occurredAt: '2026-09-30T10:00:00Z' },
      signWith: 'not-the-secret',
    })
    expect(delivered.map((a) => a.status)).toEqual([401])
    expect(await store.tenants.countDocuments({ _id: 'tenant-forged' })).toBe(0)
    expect(await countAll(store)).toEqual(before)
  })

  it('a timestamp six minutes old answers 401 stale_timestamp, with no effect', async () => {
    const before = await countAll(store)
    const { delivered } = await deliver({
      eventType: 'tenant.created',
      body: { tenantId: 'tenant-stale', occurredAt: '2026-09-30T10:00:00Z' },
      timestamp: Math.floor(Date.now() / 1000) - 6 * 60,
    })
    expect(delivered.map((a) => a.status)).toEqual([401])
    expect(await store.tenants.countDocuments({ _id: 'tenant-stale' })).toBe(0)
    expect(await countAll(store)).toEqual(before)
  })

  it('the bodies of the two refusals name the guard that refused them', async () => {
    const rawBody = JSON.stringify({
      tenantId: 'tenant-direct',
      occurredAt: '2026-09-30T10:00:00Z',
    })
    const forged = await fetch(`${API_BASE}/webhooks/platform`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [EVENT_HEADERS.delivery]: 'direct-forged',
        [EVENT_HEADERS.event]: 'tenant.created',
        [EVENT_HEADERS.timestamp]: String(Math.floor(Date.now() / 1000)),
        [EVENT_HEADERS.signature]: 'sha256=deadbeef',
      },
      body: rawBody,
    })
    expect(forged.status).toBe(401)
    expect(await forged.json()).toEqual({
      error: 'bad_signature',
      message: 'the signature does not match the body that was sent',
    })
    expect(await store.deliveries.countDocuments({ _id: 'direct-forged' })).toBe(0)
  })
})

describe('event types the application does not handle (AC-23, contracts/api.md)', () => {
  it('an unknown type delivered straight to the route is stored as `ignored`', async () => {
    const rawBody = JSON.stringify({ tenantId: 'tenant-c', occurredAt: '2026-09-30T12:00:00Z' })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const { signatureFor } = await import('../../mock-platform/src/events.ts')
    const response = await fetch(`${API_BASE}/webhooks/platform`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [EVENT_HEADERS.delivery]: 'renamed-1',
        [EVENT_HEADERS.event]: 'tenant.renamed',
        [EVENT_HEADERS.timestamp]: timestamp,
        [EVENT_HEADERS.signature]: signatureFor(
          SECRETS.WEBHOOK_SECRET_TENANT_RENAMED,
          Number(timestamp),
          rawBody,
        ),
      },
      body: rawBody,
    })
    expect(response.status).toBe(200)
    await app.inbox.idle()
    const stored = await store.deliveries.findOne({ _id: 'renamed-1' })
    expect(stored?.outcome).toBe('ignored')
    expect(stored?.processedAt).toBeInstanceOf(Date)
  })

  it('an event type with no secret at all answers 401 not_configured', async () => {
    const response = await fetch(`${API_BASE}/webhooks/platform`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [EVENT_HEADERS.delivery]: 'unconfigured-1',
        [EVENT_HEADERS.event]: 'tenant.exploded',
        [EVENT_HEADERS.timestamp]: String(Math.floor(Date.now() / 1000)),
        [EVENT_HEADERS.signature]: 'sha256=whatever',
      },
      body: JSON.stringify({ tenantId: 'tenant-c' }),
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: 'not_configured',
      message: 'no signing secret is configured for event type tenant.exploded',
    })
    expect(await store.deliveries.countDocuments({ _id: 'unconfigured-1' })).toBe(0)
    // The secret's name is the one the contract derives, and it really is absent.
    expect(webhookSecretEnvName('tenant.exploded')).toBe('WEBHOOK_SECRET_TENANT_EXPLODED')
    expect(config.webhookSecrets.has('WEBHOOK_SECRET_TENANT_EXPLODED')).toBe(false)
  })
})

describe('the delivery ids are forgotten by MongoDB after 30 days (T060, AC-21, FR-016)', () => {
  it('the TTL index exists on expiresAt, and expiresAt is receivedAt + 30 days', async () => {
    // The deletion itself is MongoDB's: this test asserts the index and the field it acts on, and
    // does not simulate the removal or wait for the background sweep that performs it.
    const indexes = await store.db.collection('deliveries').listIndexes().toArray()
    const ttl = indexes.find((index) => index.name === 'deliveries_ttl')
    expect(ttl?.key).toEqual({ expiresAt: 1 })
    expect(ttl?.expireAfterSeconds).toBe(0)

    const stored = await store.deliveries.findOne({ outcome: 'applied' })
    expect(stored).not.toBeNull()
    const receivedAt = stored?.receivedAt.getTime() as number
    const expiresAt = stored?.expiresAt.getTime() as number
    expect(expiresAt - receivedAt).toBe(DELIVERY_RETENTION_DAYS * DAY_MS)
    expect(DELIVERY_RETENTION_DAYS).toBe(30)
  })
})

describe('the mock’s log and the inbox agree (checklist M8)', () => {
  it('every delivery the mock says it sent is in the inbox with the status it recorded', async () => {
    const response = await fetch(`${MOCK_BASE}${CONTROL_ROUTES.log}`)
    const { entries } = (await response.json()) as {
      entries: Array<{ deliveryId: string; status: number; eventType: string; signed: boolean }>
    }
    expect(entries.length).toBeGreaterThanOrEqual(5)

    for (const entry of entries) {
      const stored = await store.deliveries.findOne({ _id: entry.deliveryId })
      if (entry.status === 200) {
        // Acknowledged: the API has it, under the id the mock used.
        expect({ id: entry.deliveryId, stored: stored !== null }).toEqual({
          id: entry.deliveryId,
          stored: true,
        })
        expect(stored?.eventType).toBe(entry.eventType)
      } else {
        // Refused: the API kept nothing.
        expect({ id: entry.deliveryId, status: entry.status, stored: stored !== null }).toEqual({
          id: entry.deliveryId,
          status: entry.status,
          stored: false,
        })
      }
    }

    // And the other direction: every delivery in the inbox was sent by the mock or posted directly.
    const inbox = await store.deliveries.find({}).toArray()
    const sentIds = new Set(entries.map((entry) => entry.deliveryId))
    const direct = new Set(['renamed-1'])
    for (const delivery of inbox) {
      expect({
        id: delivery._id,
        accountedFor: sentIds.has(delivery._id) || direct.has(delivery._id),
      }).toEqual({ id: delivery._id, accountedFor: true })
    }
  })
})
