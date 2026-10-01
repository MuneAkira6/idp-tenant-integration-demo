/**
 * T031 — the controls of quickstart §4 for the event guards (AC-18), and the re-proof of AC-7's
 * event arm now that T033 exists (AC-23).
 *
 * Every test here asserts the WRONG outcome on purpose (constitution V). A control is only red if the
 * forged or stale event is **applied** — a different status code would not do, because several other
 * guards could produce one. Each test therefore rules the others out explicitly: the secret is
 * configured, the body parses, the delivery id is new, and whichever guard is not under test is
 * satisfied.
 */

import { EVENT_HEADERS } from '@acme/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { signatureFor } from '../../mock-platform/src/events.ts'
import { systemClock } from '../src/clock.ts'
import { type Config, loadConfig, webhookSecretFor } from '../src/config.ts'
import { type Api, buildApi } from '../src/server.ts'
import { openTestStore, type TestStore } from './helpers.ts'

const SECRET = 'created-secret-of-this-control-run'
const ENV = { WEBHOOK_SECRET_TENANT_CREATED: SECRET }

let store: TestStore
let config: Config
let guarded: Api

type Delivery = {
  deliveryId: string
  tenantId: string
  timestamp?: number
  signature?: string
}

function build(delivery: Delivery): { headers: Record<string, string>; payload: string } {
  const payload = JSON.stringify({
    tenantId: delivery.tenantId,
    occurredAt: '2026-09-30T10:00:00Z',
    tenant: {
      name: delivery.tenantId,
      issuer: `http://localhost:18480/realms/${delivery.tenantId}`,
    },
  })
  const timestamp = delivery.timestamp ?? Math.floor(Date.now() / 1000)
  return {
    headers: {
      'content-type': 'application/json',
      [EVENT_HEADERS.delivery]: delivery.deliveryId,
      [EVENT_HEADERS.event]: 'tenant.created',
      [EVENT_HEADERS.timestamp]: String(timestamp),
      [EVENT_HEADERS.signature]: delivery.signature ?? signatureFor(SECRET, timestamp, payload),
    },
    payload,
  }
}

async function post(api: Api, delivery: Delivery) {
  const { headers, payload } = build(delivery)
  const reply = await api.inject({ method: 'POST', url: '/webhooks/platform', headers, payload })
  await api.inbox.idle()
  return reply
}

beforeAll(async () => {
  store = await openTestStore('webhook_controls')
  config = loadConfig(ENV)
  guarded = buildApi({ config, collections: store, clock: systemClock(), warn: () => {} })
  await guarded.ready()
})

afterAll(async () => {
  guarded?.inbox.stop()
  await guarded?.close()
  await store?.close()
})

describe('CONTROL: with the signature check bypassed, the forged event is applied', () => {
  it('control: a delivery signed with the wrong secret creates the tenant', async () => {
    const forged = {
      deliveryId: 'forged-1',
      tenantId: 'tenant-forged',
      signature: 'sha256=deadbeef',
    }

    // Green first: the real build refuses it, and nothing happens.
    const green = await post(guarded, forged)
    expect(green.statusCode).toBe(401)
    expect(green.json().error).toBe('bad_signature')
    expect(await store.tenants.countDocuments({ _id: 'tenant-forged' })).toBe(0)

    // The other guards are satisfied, so only the signature check can be refusing it:
    expect(webhookSecretFor(config, 'tenant.created')).toBe(SECRET) // not `not_configured`
    expect(JSON.parse(build(forged).payload).tenantId).toBe('tenant-forged') // the body parses
    expect(await store.deliveries.countDocuments({ _id: 'forged-1' })).toBe(0) // the id is new
    const skew = Math.abs(
      Date.now() / 1000 - Number(build(forged).headers[EVENT_HEADERS.timestamp]),
    )
    expect(skew).toBeLessThan(300) // the timestamp is inside the window

    // Red: with the check taken away, the forged event is applied — the effect is in the data.
    const bypassed = buildApi({
      config,
      collections: store,
      clock: systemClock(),
      warn: () => {},
      testControls: { skipSignatureCheck: true },
    })
    await bypassed.ready()
    const red = await post(bypassed, forged)
    expect(red.statusCode).toBe(200)
    expect(await store.tenants.countDocuments({ _id: 'tenant-forged' })).toBe(1)
    expect((await store.deliveries.findOne({ _id: 'forged-1' }))?.outcome).toBe('applied')

    bypassed.inbox.stop()
    await bypassed.close()
  })
})

describe('CONTROL: with the timestamp window unlimited, the stale event is applied', () => {
  it('control: a correctly signed delivery six minutes old creates the tenant', async () => {
    const sixMinutesAgo = Math.floor(Date.now() / 1000) - 6 * 60
    const stale = { deliveryId: 'stale-1', tenantId: 'tenant-stale', timestamp: sixMinutesAgo }

    // Green: the real build refuses it, and nothing happens.
    const green = await post(guarded, stale)
    expect(green.statusCode).toBe(401)
    expect(green.json().error).toBe('stale_timestamp')
    expect(green.json().message).toContain('more than 300')
    expect(await store.tenants.countDocuments({ _id: 'tenant-stale' })).toBe(0)

    // The other guards are satisfied, so only the window can be refusing it:
    expect(webhookSecretFor(config, 'tenant.created')).toBe(SECRET) // not `not_configured`
    expect(await store.deliveries.countDocuments({ _id: 'stale-1' })).toBe(0) // the id is new
    // The signature is the real one over these very bytes, at this very timestamp.
    const { headers, payload } = build(stale)
    expect(headers[EVENT_HEADERS.signature]).toBe(signatureFor(SECRET, sixMinutesAgo, payload))

    // Red: with the window unlimited, the stale event is applied.
    const unlimited = buildApi({
      config,
      collections: store,
      clock: systemClock(),
      warn: () => {},
      testControls: { unlimitedTimestampWindow: true },
    })
    await unlimited.ready()
    const red = await post(unlimited, stale)
    expect(red.statusCode).toBe(200)
    expect(await store.tenants.countDocuments({ _id: 'tenant-stale' })).toBe(1)
    expect((await store.deliveries.findOne({ _id: 'stale-1' }))?.outcome).toBe('applied')

    unlimited.inbox.stop()
    await unlimited.close()
  })
})

describe('CONTROL: the FR-029 guard is what refuses an event, not a later accident (AC-23, AC-7)', () => {
  it('control: with no secret configured and the guard removed, the delivery gets to the signature check', async () => {
    const unconfigured = loadConfig({})
    expect(webhookSecretFor(unconfigured, 'tenant.created')).toBeNull()

    const withGuard = buildApi({
      config: unconfigured,
      collections: store,
      clock: systemClock(),
      warn: () => {},
    })
    await withGuard.ready()
    const green = await post(withGuard, { deliveryId: 'guard-1', tenantId: 'tenant-guard' })
    expect(green.statusCode).toBe(401)
    expect(green.json()).toEqual({
      error: 'not_configured',
      message: 'no signing secret is configured for event type tenant.created',
    })

    // Red: without the guard the delivery goes further and is refused by the *next* guard instead,
    // which is what makes the FR-029 check a deliberate one rather than a restatement.
    const withoutGuard = buildApi({
      config: unconfigured,
      collections: store,
      clock: systemClock(),
      warn: () => {},
      testControls: { skipNotConfiguredGuard: true },
    })
    await withoutGuard.ready()
    const red = await post(withoutGuard, { deliveryId: 'guard-1', tenantId: 'tenant-guard' })
    expect(red.statusCode).toBe(401)
    expect(red.json()).toEqual({
      error: 'bad_signature',
      message: 'the signature does not match the body that was sent',
    })

    expect(await store.tenants.countDocuments({ _id: 'tenant-guard' })).toBe(0)
    expect(await store.deliveries.countDocuments({ _id: 'guard-1' })).toBe(0)

    withGuard.inbox.stop()
    withoutGuard.inbox.stop()
    await withGuard.close()
    await withoutGuard.close()
  })
})

describe('the signature is over the bytes that arrived, not over a re-serialisation', () => {
  it('a body whose JSON re-serialises differently still verifies', async () => {
    // Signed over these exact bytes: the key order and the spacing are not what JSON.stringify of the
    // parsed object would produce, so a verifier that re-serialised would compute a different HMAC.
    const rawBody =
      '{ "occurredAt":"2026-09-30T10:00:00Z",  "tenantId":"tenant-raw", "tenant":{ "name":"Tenant Raw",' +
      '"issuer":"http://localhost:18480/realms/tenant-raw" } }'
    expect(JSON.stringify(JSON.parse(rawBody))).not.toBe(rawBody)

    const timestamp = Math.floor(Date.now() / 1000)
    const reply = await guarded.inject({
      method: 'POST',
      url: '/webhooks/platform',
      headers: {
        'content-type': 'application/json',
        [EVENT_HEADERS.delivery]: 'raw-1',
        [EVENT_HEADERS.event]: 'tenant.created',
        [EVENT_HEADERS.timestamp]: String(timestamp),
        [EVENT_HEADERS.signature]: signatureFor(SECRET, timestamp, rawBody),
      },
      payload: rawBody,
    })
    await guarded.inbox.idle()
    expect(reply.statusCode).toBe(200)
    expect(await store.tenants.countDocuments({ _id: 'tenant-raw' })).toBe(1)
  })
})
