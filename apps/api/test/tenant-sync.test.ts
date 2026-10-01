/**
 * T037 — tenants follow the platform, whatever the order (US5, Q10, SC-004, FR-019, research R-9).
 *
 * The rule under test is that an event applies only if it is **newer than the last applied change**,
 * so what decides is the events' own `occurredAt` and not the order in which they arrived. The second
 * tenant below is the case that matters: its later-arriving event is the older one, and it must be
 * ignored. A test that only replayed events in order would pass without the rule.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { systemClock } from '../src/clock.ts'
import { loadConfig } from '../src/config.ts'
import { type Api, buildApi } from '../src/server.ts'
import { signedDelivery, WEBHOOK_SECRETS } from './events.ts'
import { openTestStore, type TestStore } from './helpers.ts'

const CREATED_AT = '2026-09-30T10:00:00Z'
const DELETED_AT = '2026-09-30T11:00:00Z'

let store: TestStore
let app: Api

const created = (tenantId: string) => ({
  tenantId,
  occurredAt: CREATED_AT,
  tenant: { name: `Tenant ${tenantId}`, issuer: `http://localhost:18480/realms/${tenantId}` },
})
const deleted = (tenantId: string) => ({ tenantId, occurredAt: DELETED_AT })

async function post(
  deliveryId: string,
  eventType: 'tenant.created' | 'tenant.deleted',
  body: unknown,
) {
  const { headers, payload } = signedDelivery({ deliveryId, eventType, body })
  const reply = await app.inject({ method: 'POST', url: '/webhooks/platform', headers, payload })
  await app.inbox.idle()
  return reply
}

beforeAll(async () => {
  store = await openTestStore('tenant_sync')
  app = buildApi({
    config: loadConfig(WEBHOOK_SECRETS),
    collections: store,
    clock: systemClock(),
    warn: () => {},
  })
  await app.ready()
})

afterAll(async () => {
  app?.inbox.stop()
  await app?.close()
  await store?.close()
})

describe('events delivered twice each and in reverse order converge (Q10, SC-004)', () => {
  it('in order: created then deleted, each twice, leaves the tenant deleted', async () => {
    for (const id of ['c1-a', 'c1-b']) await post(id, 'tenant.created', created('tenant-inorder'))
    for (const id of ['d1-a', 'd1-b']) await post(id, 'tenant.deleted', deleted('tenant-inorder'))

    const tenant = await store.tenants.findOne({ _id: 'tenant-inorder' })
    expect(tenant?.state).toBe('deleted')
    expect(tenant?.platformChangedAt?.toISOString()).toBe(new Date(DELETED_AT).toISOString())
    expect(tenant?.purgeAfter?.toISOString()).toBe(
      new Date(new Date(DELETED_AT).getTime() + 30 * 86_400_000).toISOString(),
    )
  })

  it('in reverse: the deleted event arrives first, and the older created event is ignored', async () => {
    // The platform's order is created(10:00) then deleted(11:00). They arrive the other way round.
    for (const id of ['d2-a', 'd2-b']) await post(id, 'tenant.deleted', deleted('tenant-reverse'))
    const afterDelete = await store.tenants.findOne({ _id: 'tenant-reverse' })
    expect(afterDelete?.state).toBe('deleted')

    for (const id of ['c2-a', 'c2-b']) await post(id, 'tenant.created', created('tenant-reverse'))

    // The tenant ends as the last platform change implies: deleted.
    const tenant = await store.tenants.findOne({ _id: 'tenant-reverse' })
    expect(tenant?.state).toBe('deleted')
    expect(tenant?.platformChangedAt?.toISOString()).toBe(new Date(DELETED_AT).toISOString())
    expect(await store.tenants.countDocuments({ _id: 'tenant-reverse' })).toBe(1)

    // And the later-arriving, older event was recognised as such rather than merely losing a race.
    for (const id of ['c2-a', 'c2-b']) {
      const delivery = await store.deliveries.findOne({ _id: id })
      expect({ id, outcome: delivery?.outcome }).toEqual({ id, outcome: 'ignored' })
    }
    for (const id of ['d2-a', 'd2-b']) {
      const delivery = await store.deliveries.findOne({ _id: id })
      expect({ id, outcome: delivery?.outcome }).toEqual({
        id,
        // The first applied it; the second is an older-or-equal change, so it had no effect.
        outcome: id === 'd2-a' ? 'applied' : 'ignored',
      })
    }
  })

  it('a created event newer than the deletion does revive nothing — it creates what it names', async () => {
    // The guard is about time, not about the word "created": a genuinely newer created event for a
    // different tenant is applied, so the rule is not simply "deleted wins".
    await post('c3', 'tenant.created', {
      tenantId: 'tenant-later',
      occurredAt: '2026-10-01T09:00:00Z',
      tenant: { name: 'Tenant Later', issuer: 'http://localhost:18480/realms/tenant-later' },
    })
    const tenant = await store.tenants.findOne({ _id: 'tenant-later' })
    expect(tenant?.state).toBe('active')
    expect((await store.deliveries.findOne({ _id: 'c3' }))?.outcome).toBe('applied')
  })

  it('every tenant ends in exactly one state, and each was created once', async () => {
    expect(await store.tenants.countDocuments({})).toBe(3)
    const states = Object.fromEntries(
      (await store.tenants.find({}).toArray()).map((tenant) => [tenant._id, tenant.state]),
    )
    expect(states).toEqual({
      'tenant-inorder': 'deleted',
      'tenant-reverse': 'deleted',
      'tenant-later': 'active',
    })
  })
})
