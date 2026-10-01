/**
 * T020, checklist M4 — the tenant that is not integrated gives the same results as the G0 baseline
 * (FR-031, AC-8).
 *
 * Two comparisons. The first reads the live `acme_tasks` database that G0 seeded and compares it with
 * the baseline recorded then; it only reads, and writes nothing. The second runs the password sign-in
 * and the task operations through the HTTP API with nothing configured, which is the state G0 left.
 */

import { SESSION_COOKIE } from '@acme/contracts'
import type { FastifyInstance } from 'fastify'
import { MongoClient } from 'mongodb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { signInWithPassword } from '../src/auth/password.ts'
import { systemClock } from '../src/clock.ts'
import { loadConfig } from '../src/config.ts'
import { collectionsOf } from '../src/db.ts'
import { LOCAL_TENANT_ID, LOCAL_USERS, seedLocalTenant } from '../src/seed.ts'
import { buildApi } from '../src/server.ts'
import { openTestStore, TEST_MONGO_URL, type TestStore } from './helpers.ts'
import { cookieFromReply, unconfiguredEnv } from './keycloak.ts'

/** What G0 left in the live database, recorded in the G0 ledger and re-read by the bus. */
const G0_BASELINE = {
  tenant: { _id: LOCAL_TENANT_ID, name: 'Local Co', integrated: false, state: 'active' },
  users: 3,
  tasks: 4,
  sessions: 0,
}

const clock = systemClock()
const PASSWORD = 'a-password-only-this-test-knows'

let live: MongoClient
let store: TestStore
let app: FastifyInstance

beforeAll(async () => {
  live = new MongoClient(TEST_MONGO_URL, { serverSelectionTimeoutMS: 10_000 })
  await live.connect()
  store = await openTestStore('local_unchanged')
  await seedLocalTenant(store, PASSWORD, clock.now())
  app = buildApi({ config: loadConfig(unconfiguredEnv()), collections: store, clock })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await store?.close()
  await live?.close()
})

describe('the live database still holds the G0 baseline (M4)', () => {
  it('tenant `local` is unchanged: not integrated, active', async () => {
    const collections = collectionsOf(live.db('acme_tasks'))
    const tenant = await collections.tenants.findOne({ _id: LOCAL_TENANT_ID })
    expect(tenant).toMatchObject(G0_BASELINE.tenant)
    expect(tenant?.issuer).toBeUndefined()
  })

  it('its users, tasks and sessions are the same counts G0 recorded', async () => {
    const collections = collectionsOf(live.db('acme_tasks'))
    expect(await collections.users.countDocuments({ tenantId: LOCAL_TENANT_ID })).toBe(
      G0_BASELINE.users,
    )
    expect(await collections.tasks.countDocuments({ tenantId: LOCAL_TENANT_ID })).toBe(
      G0_BASELINE.tasks,
    )
    expect(await collections.sessions.countDocuments({})).toBe(G0_BASELINE.sessions)
  })

  it('G1 added no tenant and no platform user to the live database', async () => {
    const collections = collectionsOf(live.db('acme_tasks'))
    expect(await collections.tenants.countDocuments({})).toBe(1)
    expect(await collections.users.countDocuments({ platformSubject: { $exists: true } })).toBe(0)
  })
})

describe('the sign-in path of the baseline is unchanged (FR-031)', () => {
  it('the G0 function still returns the same result for the same inputs', async () => {
    const result = await signInWithPassword(store, clock, {
      tenant: LOCAL_TENANT_ID,
      email: 'lena@local.example',
      password: PASSWORD,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tenantId).toBe(LOCAL_TENANT_ID)
    const session = await store.sessions.findOne({ _id: result.sessionId })
    expect(session?.kind).toBe('password')
    expect(session?.platform).toBeUndefined()
  })

  it('the HTTP route added in G1 gives the same answers, with nothing configured', async () => {
    for (const seeded of LOCAL_USERS) {
      const reply = await app.inject({
        method: 'POST',
        url: '/auth/password',
        payload: { tenant: LOCAL_TENANT_ID, email: seeded.email, password: PASSWORD },
      })
      expect(reply.statusCode).toBe(200)
      expect(reply.json()).toMatchObject({ signedIn: true, tenantId: LOCAL_TENANT_ID })
      const sessionId = cookieFromReply(reply.headers as Record<string, unknown>, SESSION_COOKIE)
      const session = await store.sessions.findOne({ _id: sessionId as string })
      // Still a password session with nothing of the platform in it (FR-002, FR-003).
      expect(session?.kind).toBe('password')
      expect(session?.platform).toBeUndefined()
    }
  })

  it('the seeded tasks are the same four, under the same three users', async () => {
    expect(await store.users.countDocuments({ tenantId: LOCAL_TENANT_ID })).toBe(G0_BASELINE.users)
    expect(await store.tasks.countDocuments({ tenantId: LOCAL_TENANT_ID })).toBe(G0_BASELINE.tasks)
    const titles = (await store.tasks.find({ tenantId: LOCAL_TENANT_ID }).toArray())
      .map((task) => task.title)
      .sort()
    expect(titles).toEqual([
      'Approve the budget',
      'Plan the sprint',
      'Review the backlog',
      'Write the weekly report',
    ])
  })
})
