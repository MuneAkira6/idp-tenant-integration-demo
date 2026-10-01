/**
 * T032, T034 — the inbox: acknowledge first, process afterwards, and pick up whatever was left
 * (US4, Q9, FR-016, FR-017, checklist L8).
 *
 * The sweep tests advance the injected clock instead of waiting an hour, and say so (FR-032).
 */

import { EVENT_HEADERS } from '@acme/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { signatureFor } from '../../mock-platform/src/events.ts'
import {
  DAY_MS,
  HOUR_MS,
  type ManualClock,
  MINUTE_MS,
  manualClock,
  systemClock,
} from '../src/clock.ts'
import { type Config, loadConfig } from '../src/config.ts'
import type { DeliveryDoc } from '../src/db.ts'
import { type Api, buildApi } from '../src/server.ts'
import { openTestStore, type TestStore } from './helpers.ts'

const SECRET = 'created-secret-of-this-inbox-run'
/** Nothing listens here, so start-up's subscription registration fails fast and start-up goes on. */
const ENV = {
  WEBHOOK_SECRET_TENANT_CREATED: SECRET,
  PLATFORM_API_BASE_URL: 'http://localhost:18419',
}

let store: TestStore
let config: Config

function signedDelivery(deliveryId: string, tenantId: string, now: Date) {
  const payload = JSON.stringify({
    tenantId,
    occurredAt: '2026-09-30T10:00:00Z',
    tenant: { name: tenantId, issuer: `http://localhost:18480/realms/${tenantId}` },
  })
  const timestamp = Math.floor(now.getTime() / 1000)
  return {
    headers: {
      'content-type': 'application/json',
      [EVENT_HEADERS.delivery]: deliveryId,
      [EVENT_HEADERS.event]: 'tenant.created',
      [EVENT_HEADERS.timestamp]: String(timestamp),
      [EVENT_HEADERS.signature]: signatureFor(SECRET, timestamp, payload),
    },
    payload,
  }
}

/** A delivery that was stored and then never processed, because the application stopped. */
function unprocessed(deliveryId: string, tenantId: string, receivedAt: Date): DeliveryDoc {
  return {
    _id: deliveryId,
    eventType: 'tenant.created',
    body: {
      tenantId,
      occurredAt: '2026-09-30T10:00:00Z',
      tenant: { name: tenantId, issuer: `http://localhost:18480/realms/${tenantId}` },
    },
    receivedAt,
    expiresAt: new Date(receivedAt.getTime() + 30 * DAY_MS),
  }
}

beforeAll(async () => {
  store = await openTestStore('inbox')
  config = loadConfig(ENV)
})

afterAll(async () => {
  await store?.close()
})

describe('the acknowledgement does not wait for the processing (AC-19, L8, FR-016)', () => {
  it('a slow processor finishes after the 200 was already sent', async () => {
    let finishedAt = 0
    let startedAt = 0
    const slow = buildApi({
      config,
      collections: store,
      clock: systemClock(),
      warn: () => {},
      processor: async () => {
        startedAt = Date.now()
        await new Promise((resolve) => setTimeout(resolve, 300))
        finishedAt = Date.now()
        return 'applied'
      },
    })
    await slow.ready()

    const { headers, payload } = signedDelivery('slow-1', 'tenant-slow', new Date())
    const reply = await slow.inject({ method: 'POST', url: '/webhooks/platform', headers, payload })
    const acknowledgedAt = Date.now()

    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual({ received: true, deliveryId: 'slow-1' })

    // Processing had not finished when the acknowledgement went out — it had not even begun.
    expect(finishedAt).toBe(0)

    await slow.inbox.idle()
    expect(finishedAt).toBeGreaterThan(0)
    expect(startedAt).toBeGreaterThanOrEqual(acknowledgedAt)

    // Two timestamps from the same delivery, in order, with the gap the slow processor introduced.
    expect(acknowledgedAt).toBeLessThan(finishedAt)
    expect(finishedAt - acknowledgedAt).toBeGreaterThanOrEqual(250)

    // It was stored before it was acknowledged, not after (FR-016).
    const stored = await store.deliveries.findOne({ _id: 'slow-1' })
    expect(stored?.receivedAt.getTime()).toBeLessThanOrEqual(acknowledgedAt)
    expect(stored?.outcome).toBe('applied')

    slow.inbox.stop()
    await slow.close()

    console.log(
      `AC-19: acknowledged at ${acknowledgedAt}, processing finished at ${finishedAt}, ` +
        `${finishedAt - acknowledgedAt} ms later`,
    )
  })
})

describe('deliveries stored but not processed are picked up (AC-20, Q9, FR-017)', () => {
  let clock: ManualClock
  let app: Api

  beforeAll(async () => {
    // Stored before the application starts: exactly the case of Q9.
    await store.deliveries.insertOne(unprocessed('sweep-startup', 'tenant-startup', new Date()))
    clock = manualClock(new Date())
    app = buildApi({ config, collections: store, clock, warn: () => {} })
  })

  afterAll(async () => {
    app?.inbox.stop()
    await app?.close()
  })

  it('the start-up sweep processes what was waiting, before any hour has passed', async () => {
    expect(await store.tenants.countDocuments({ _id: 'tenant-startup' })).toBe(0)
    expect(app.inbox.sweeps()).toBe(0)

    await app.startUp()

    // One sweep has run, and it ran at start-up — the clock has not moved at all.
    expect(app.inbox.sweeps()).toBe(1)
    expect(clock.now().getTime()).toBe(clock.now().getTime())
    expect(await store.tenants.countDocuments({ _id: 'tenant-startup' })).toBe(1)
    const processed = await store.deliveries.findOne({ _id: 'sweep-startup' })
    expect(processed?.processedAt).toBeInstanceOf(Date)
    expect(processed?.outcome).toBe('applied')
  })

  it('and the hourly sweep is a different one: the scheduler runs it when an hour passes', async () => {
    await store.deliveries.insertOne(unprocessed('sweep-hourly', 'tenant-hourly', clock.now()))

    // This test advances the injected clock instead of waiting an hour (FR-032). The hourly pick-up
    // is the scheduler's `inbox.sweep` job; `inbox.start()` performed the start-up one and schedules
    // nothing of its own.
    await clock.advance(59 * MINUTE_MS)
    expect(app.inbox.sweeps()).toBe(1)
    expect(await store.tenants.countDocuments({ _id: 'tenant-hourly' })).toBe(0)

    await clock.advance(MINUTE_MS)
    expect(app.inbox.sweeps()).toBe(2)
    expect(await store.tenants.countDocuments({ _id: 'tenant-hourly' })).toBe(1)
    expect((await store.deliveries.findOne({ _id: 'sweep-hourly' }))?.outcome).toBe('applied')

    // And it keeps running: two more hours, two more sweeps.
    await clock.advance(2 * HOUR_MS)
    expect(app.inbox.sweeps()).toBe(4)
  })

  it('a delivery whose processing throws is left unprocessed, so the next sweep owns it', async () => {
    await store.deliveries.insertOne(unprocessed('sweep-throws', 'tenant-throws', clock.now()))
    let attempts = 0
    const failing = buildApi({
      config,
      collections: store,
      clock: systemClock(),
      warn: () => {},
      processor: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('the processor fell over')
        return 'applied'
      },
    })
    await failing.ready()

    expect(await failing.inbox.sweep()).toBe(1)
    const afterFailure = await store.deliveries.findOne({ _id: 'sweep-throws' })
    expect(afterFailure?.processedAt).toBeUndefined()
    expect(afterFailure?.outcome).toBeUndefined()

    // The same sweep picks it up next time; nothing else has to remember it.
    expect(await failing.inbox.sweep()).toBe(1)
    const afterRetry = await store.deliveries.findOne({ _id: 'sweep-throws' })
    expect(afterRetry?.processedAt).toBeInstanceOf(Date)
    expect(afterRetry?.outcome).toBe('applied')

    failing.inbox.stop()
    await failing.close()
  })
})
