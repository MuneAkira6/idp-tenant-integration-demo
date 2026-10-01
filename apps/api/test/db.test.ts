/**
 * The collections and indexes of data-model.md, created against the Compose stack's MongoDB (T009).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FIRST_CONTACT_INDEX } from '../src/db.ts'
import { openTestStore, type TestStore } from './helpers.ts'

let store: TestStore

beforeAll(async () => {
  store = await openTestStore('db')
})

afterAll(async () => {
  await store?.close()
})

async function indexesOf(name: string): Promise<Map<string, Record<string, unknown>>> {
  const list = await store.db.collection(name).listIndexes().toArray()
  return new Map(list.map((index) => [index.name as string, index as Record<string, unknown>]))
}

describe('the collections and indexes of data-model.md', () => {
  it('users carries the partial unique index of research R-8 (FR-010)', async () => {
    const index = (await indexesOf('users')).get(FIRST_CONTACT_INDEX)
    expect(index).toBeDefined()
    expect(index?.key).toEqual({ tenantId: 1, platformSubject: 1 })
    expect(index?.unique).toBe(true)
    expect(index?.partialFilterExpression).toEqual({ platformSubject: { $exists: true } })
  })

  it('a user without a platform subject is outside the partial index, so many may exist', async () => {
    await store.users.insertMany([
      { tenantId: 'local', email: 'a@local.example', name: 'A', roles: ['member'] },
      { tenantId: 'local', email: 'b@local.example', name: 'B', roles: ['member'] },
    ])
    expect(await store.users.countDocuments({ tenantId: 'local' })).toBe(2)
  })

  it('two users of one tenant cannot share a platform subject', async () => {
    await store.users.insertOne({
      tenantId: 'tenant-a',
      platformSubject: 'sub-1',
      email: 'one@tenant-a.example',
      name: 'One',
      roles: ['member'],
    })
    await expect(
      store.users.insertOne({
        tenantId: 'tenant-a',
        platformSubject: 'sub-1',
        email: 'two@tenant-a.example',
        name: 'Two',
        roles: ['member'],
      }),
    ).rejects.toThrow(/E11000/)
  })

  it('the same platform subject in another tenant is a different user', async () => {
    await store.users.insertOne({
      tenantId: 'tenant-b',
      platformSubject: 'sub-1',
      email: 'one@tenant-b.example',
      name: 'One',
      roles: ['member'],
    })
    expect(await store.users.countDocuments({ platformSubject: 'sub-1' })).toBe(2)
  })

  it('sessions and deliveries are expired by MongoDB, not by the application (FR-016)', async () => {
    expect((await indexesOf('sessions')).get('sessions_ttl')?.expireAfterSeconds).toBe(0)
    const deliveries = await indexesOf('deliveries')
    expect(deliveries.get('deliveries_ttl')?.expireAfterSeconds).toBe(0)
    expect(deliveries.get('deliveries_ttl')?.key).toEqual({ expiresAt: 1 })
    expect(deliveries.get('deliveries_processedAt')).toBeDefined()
  })

  it('a tenant issuer is unique, and a tenant without one is not caught by it', async () => {
    await store.tenants.insertOne({
      _id: 'local',
      name: 'Local Co',
      integrated: false,
      state: 'active',
    })
    await store.tenants.insertOne({
      _id: 'other',
      name: 'Other',
      integrated: false,
      state: 'active',
    })
    await store.tenants.insertOne({
      _id: 'tenant-a',
      name: 'Tenant A',
      integrated: true,
      issuer: 'http://localhost:18480/realms/tenant-a',
      state: 'active',
    })
    await expect(
      store.tenants.insertOne({
        _id: 'tenant-a-copy',
        name: 'Copy',
        integrated: true,
        issuer: 'http://localhost:18480/realms/tenant-a',
        state: 'active',
      }),
    ).rejects.toThrow(/E11000/)
  })

  it('every collection that data-model.md gives an index exists after ensureIndexes', async () => {
    const names = (await store.db.listCollections().toArray()).map((c) => c.name)
    for (const expected of [
      'tenants',
      'users',
      'sessions',
      'tasks',
      'deliveries',
      'tenantLookups',
      'devices',
    ]) {
      expect(names).toContain(expected)
    }
  })
})
