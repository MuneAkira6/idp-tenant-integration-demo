/**
 * T065, T067 — roles decide what each user may do (US9, Q16, Q18, SC-009, FR-033, FR-035).
 *
 * The 12 combinations of SC-009 are exercised through the HTTP API as each of the three roles of
 * `tenant-a`, signed in through the real IdP. The last describe is the CONTROL of quickstart §4: with
 * the one permission check switched off, the `member` reads the devices.
 */

import { OPERATION_ROUTES, OPERATIONS, PERMISSION_TABLE, SESSION_COOKIE } from '@acme/contracts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newJwksRegistry } from '../src/auth/bearer.ts'
import { forgetDiscovery } from '../src/auth/platform.ts'
import { systemClock } from '../src/clock.ts'
import { type Config, loadConfig } from '../src/config.ts'
import type { Collections } from '../src/db.ts'
import { seedConfiguredPlatformTenants, seedLocalTenant } from '../src/seed.ts'
import { buildApi } from '../src/server.ts'
import { openTestStore, type TestStore } from './helpers.ts'
import { directGrantToken, integratedEnv, signInThroughPlatform } from './keycloak.ts'

/** One user of `tenant-a` per application role (the realm imports of T004). */
const ROLE_USERS = [
  { role: 'member', username: 'alice', email: 'alice@tenant-a.example' },
  { role: 'manager', username: 'mia', email: 'mia@tenant-a.example' },
  { role: 'admin', username: 'adam', email: 'adam@tenant-a.example' },
] as const

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
let app: FastifyInstance
let config: Config
const sessions = new Map<string, string>()

beforeAll(async () => {
  forgetDiscovery()
  store = await openTestStore('permissions')
  config = loadConfig(integratedEnv())
  await seedLocalTenant(store, 'a-password-only-this-test-knows', systemClock().now())
  await seedConfiguredPlatformTenants(store, config.platformTenants.values())
  app = buildApi({
    config,
    collections: store,
    clock: systemClock(),
    jwks: newJwksRegistry(),
    warn: () => {},
  })
  await app.ready()
  for (const user of ROLE_USERS) {
    const { sessionId } = await signInThroughPlatform(app, {
      tenant: 'tenant-a',
      username: user.username,
    })
    sessions.set(user.role, sessionId)
  }
})

afterAll(async () => {
  await app?.close()
  await store?.close()
})

async function call(role: string, operation: (typeof OPERATIONS)[number], api = app) {
  const { method, path } = OPERATION_ROUTES[operation]
  return api.inject({
    method,
    url: path,
    cookies: { [SESSION_COOKIE]: sessions.get(role) as string },
    ...(method === 'POST' ? { payload: { title: `a task by the ${role}` } } : {}),
  })
}

describe('the roles the realm gives each of the three users', () => {
  it('are the ones the permission table is about', async () => {
    for (const user of ROLE_USERS) {
      const stored = await store.users.findOne({ tenantId: 'tenant-a', email: user.email })
      expect({ [user.username]: stored?.roles }).toEqual({ [user.username]: [user.role] })
    }
  })
})

describe('the 12 answers of SC-009 (T065, Q16, FR-033)', () => {
  it('match the permission table of data-model.md, combination by combination', async () => {
    const observed: Record<string, Record<string, number>> = {}
    for (const user of ROLE_USERS) {
      observed[user.role] = {}
      for (const operation of OPERATIONS) {
        const reply = await call(user.role, operation)
        ;(observed[user.role] as Record<string, number>)[operation] = reply.statusCode
      }
    }
    expect(observed).toEqual({
      member: { 'tasks.read': 200, 'tasks.create': 201, 'devices.read': 403, 'users.list': 403 },
      manager: { 'tasks.read': 200, 'tasks.create': 201, 'devices.read': 200, 'users.list': 403 },
      admin: { 'tasks.read': 200, 'tasks.create': 201, 'devices.read': 200, 'users.list': 200 },
    })

    // The same 12, read off the frozen table rather than off this expectation.
    for (const user of ROLE_USERS) {
      for (const operation of OPERATIONS) {
        const allowed = PERMISSION_TABLE[operation].includes(user.role)
        const status = (observed[user.role] as Record<string, number>)[operation] as number
        expect({ [`${user.role}/${operation}`]: status < 400 }).toEqual({
          [`${user.role}/${operation}`]: allowed,
        })
      }
    }
  })

  it('every 403 says `forbidden` and changes no document', async () => {
    const before = await countAll(store)
    for (const [role, operation] of [
      ['member', 'devices.read'],
      ['member', 'users.list'],
      ['manager', 'users.list'],
    ] as const) {
      const reply = await call(role, operation)
      expect(reply.statusCode).toBe(403)
      expect(reply.json().error).toBe('forbidden')
    }
    expect(await countAll(store)).toEqual(before)
  })

  it('the admin’s user list shows each user’s roles (AC-42)', async () => {
    const reply = await call('admin', 'users.list')
    expect(reply.statusCode).toBe(200)
    const listed = reply.json().users as Array<{ email: string; roles: string[] }>
    const byEmail = Object.fromEntries(listed.map((user) => [user.email, user.roles]))
    expect(byEmail['alice@tenant-a.example']).toEqual(['member'])
    expect(byEmail['mia@tenant-a.example']).toEqual(['manager'])
    expect(byEmail['adam@tenant-a.example']).toEqual(['admin'])
  })

  it('the manager reads the devices and their sync state (AC-41)', async () => {
    const reply = await call('manager', 'devices.read')
    expect(reply.statusCode).toBe(200)
    // The pull that fills these is T046 in G4; the route and its permission are what G2 owns.
    expect(reply.json()).toEqual({ devices: [], syncState: null })
  })
})

describe('an admin lists only their own tenant (T067, Q18, FR-035)', () => {
  it('sees tenant-a, although tenant-b and local have users too', async () => {
    // Give tenant-b a user, over a Bearer call, and check `local` still has its three.
    const bobToken = await directGrantToken({
      realm: 'tenant-b',
      username: 'bob',
      secretName: 'ACME_TASKS_SECRET_TENANT_B',
    })
    await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${bobToken}` },
    })
    expect(await store.users.countDocuments({ tenantId: 'tenant-b' })).toBe(1)
    expect(await store.users.countDocuments({ tenantId: 'local' })).toBe(3)

    const reply = await call('admin', 'users.list')
    expect(reply.statusCode).toBe(200)
    const listed = reply.json().users as Array<{ email: string }>
    expect(listed.map((user) => user.email).sort()).toEqual([
      'adam@tenant-a.example',
      'alice@tenant-a.example',
      'mia@tenant-a.example',
    ])
    expect(listed.some((user) => user.email.includes('tenant-b'))).toBe(false)
    expect(listed.some((user) => user.email.includes('local'))).toBe(false)
    // There really were more users to leak.
    expect(await store.users.countDocuments({})).toBeGreaterThan(listed.length)
  })
})

describe('CONTROL: with the one permission check switched off, the member reads the devices', () => {
  // This is a control (constitution V): it asserts the WRONG outcome on purpose, to show that the
  // check of FR-033 is what produces the 403 — and therefore that the test above would notice if the
  // check were ever missing.
  let unchecked: FastifyInstance

  beforeAll(async () => {
    unchecked = buildApi({
      config,
      collections: store,
      clock: systemClock(),
      jwks: newJwksRegistry(),
      warn: () => {},
      testControls: { disablePermissionCheck: true },
    })
    await unchecked.ready()
  })

  afterAll(async () => {
    await unchecked?.close()
  })

  it('control: the member gets 200 on the devices, where the real build answers 403', async () => {
    expect((await call('member', 'devices.read')).statusCode).toBe(403)
    const red = await call('member', 'devices.read', unchecked)
    expect(red.statusCode).toBe(200)
    expect(red.json()).toEqual({ devices: [], syncState: null })
  })

  it('control: the member also gets the whole user list', async () => {
    expect((await call('member', 'users.list')).statusCode).toBe(403)
    const red = await call('member', 'users.list', unchecked)
    expect(red.statusCode).toBe(200)
    expect((red.json().users as unknown[]).length).toBeGreaterThan(0)
  })
})
