/**
 * The baseline for "nothing changes until it is configured" (T011, E7, FR-031).
 *
 * `local` is seeded and signs in with its password exactly as before the integration exists. Every
 * later goal runs this file again and must get the same results (checklist M4).
 */

import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { signInWithPassword } from '../src/auth/password.ts'
import { manualClock } from '../src/clock.ts'
import { loadConfig } from '../src/config.ts'
import {
  LOCAL_TENANT_ID,
  LOCAL_USERS,
  seedConfiguredPlatformTenants,
  seedLocalTenant,
} from '../src/seed.ts'
import { openTestStore, type TestStore } from './helpers.ts'

const PASSWORD = randomBytes(18).toString('base64url')
const clock = manualClock(new Date('2026-09-30T09:00:00.000Z'))

let store: TestStore

beforeAll(async () => {
  store = await openTestStore('password_signin')
  await seedLocalTenant(store, PASSWORD, clock.now())
})

afterAll(async () => {
  await store?.close()
})

describe('the seeded `local` tenant (T011)', () => {
  it('is seeded with its three users and their tasks, and is not integrated', async () => {
    const tenant = await store.tenants.findOne({ _id: LOCAL_TENANT_ID })
    expect(tenant).toMatchObject({
      _id: 'local',
      name: 'Local Co',
      integrated: false,
      state: 'active',
    })
    expect(tenant?.issuer).toBeUndefined()
    expect(await store.users.countDocuments({ tenantId: LOCAL_TENANT_ID })).toBe(LOCAL_USERS.length)
    expect(await store.tasks.countDocuments({ tenantId: LOCAL_TENANT_ID })).toBe(4)
  })

  it('is seeded idempotently: seeding again leaves the same documents', async () => {
    await seedLocalTenant(store, PASSWORD, clock.now())
    expect(await store.users.countDocuments({ tenantId: LOCAL_TENANT_ID })).toBe(LOCAL_USERS.length)
    expect(await store.tasks.countDocuments({ tenantId: LOCAL_TENANT_ID })).toBe(4)
  })

  it('stores no password, only a scrypt hash', async () => {
    const user = await store.users.findOne({ email: 'lena@local.example' })
    expect(user?.passwordHash).toMatch(/^scrypt\$/)
    expect(user?.passwordHash).not.toContain(PASSWORD)
  })

  it('with nothing configured, no tenant becomes integrated (constitution VI)', async () => {
    const config = loadConfig({})
    expect(await seedConfiguredPlatformTenants(store, config.platformTenants.values())).toBe(0)
    expect(await store.tenants.countDocuments({ integrated: true })).toBe(0)
  })
})

describe('password sign-in for `local` (FR-031)', () => {
  it('signs in with the right password and creates a `password` session', async () => {
    const result = await signInWithPassword(store, clock, {
      tenant: LOCAL_TENANT_ID,
      email: 'lena@local.example',
      password: PASSWORD,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const session = await store.sessions.findOne({ _id: result.sessionId })
    expect(session?.kind).toBe('password')
    expect(session?.tenantId).toBe(LOCAL_TENANT_ID)
    expect(session?.createdAt.toISOString()).toBe('2026-09-30T09:00:00.000Z')
    // The cookie value is opaque: 32 random bytes, base64url — never a JWT (FR-003).
    expect(result.sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(result.sessionId).not.toContain('.')
    expect(session?.platform).toBeUndefined()
  })

  it('refuses a wrong password and writes no session', async () => {
    const before = await store.sessions.countDocuments({})
    const result = await signInWithPassword(store, clock, {
      tenant: LOCAL_TENANT_ID,
      email: 'lena@local.example',
      password: `${PASSWORD}x`,
    })
    expect(result).toEqual({ ok: false, reason: 'invalid_credentials' })
    expect(await store.sessions.countDocuments({})).toBe(before)
  })

  it('refuses an unknown e-mail address', async () => {
    const result = await signInWithPassword(store, clock, {
      tenant: LOCAL_TENANT_ID,
      email: 'nobody@local.example',
      password: PASSWORD,
    })
    expect(result).toEqual({ ok: false, reason: 'invalid_credentials' })
  })

  it('refuses an unknown tenant', async () => {
    const result = await signInWithPassword(store, clock, {
      tenant: 'tenant-x',
      email: 'lena@local.example',
      password: PASSWORD,
    })
    expect(result).toEqual({ ok: false, reason: 'unknown_tenant' })
  })

  it('refuses a password sign-in for an integrated tenant: the platform owns its users', async () => {
    await store.tenants.insertOne({
      _id: 'tenant-a',
      name: 'Tenant A',
      integrated: true,
      issuer: 'http://localhost:18480/realms/tenant-a',
      state: 'active',
    })
    await store.users.insertOne({
      tenantId: 'tenant-a',
      email: 'alice@tenant-a.example',
      name: 'Alice',
      roles: ['member'],
      passwordHash: (await store.users.findOne({ email: 'lena@local.example' }))?.passwordHash,
    })
    const result = await signInWithPassword(store, clock, {
      tenant: 'tenant-a',
      email: 'alice@tenant-a.example',
      password: PASSWORD,
    })
    expect(result).toEqual({ ok: false, reason: 'not_integrated_only' })
  })

  it('refuses sign-in for a tenant that is a tombstone (FR-022)', async () => {
    await store.tenants.updateOne(
      { _id: LOCAL_TENANT_ID },
      { $set: { state: 'deleted', deletedAt: clock.now() } },
    )
    const result = await signInWithPassword(store, clock, {
      tenant: LOCAL_TENANT_ID,
      email: 'lena@local.example',
      password: PASSWORD,
    })
    expect(result).toEqual({ ok: false, reason: 'tenant_deleted' })
    await store.tenants.updateOne(
      { _id: LOCAL_TENANT_ID },
      { $set: { state: 'active' }, $unset: { deletedAt: '' } },
    )
  })
})
