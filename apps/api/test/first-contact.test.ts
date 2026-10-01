/**
 * T023, T025 — exactly one user on concurrent first contact (US2, Q6, SC-002, FR-010, research R-8).
 *
 * The second describe is the CONTROL the constitution asks for (principle V): with the partial unique
 * index dropped, the same eight requests leave more than one user. It runs on a throwaway test
 * database of its own and never touches `acme_tasks`.
 */

import type { FastifyInstance } from 'fastify'
import { decodeJwt } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newJwksRegistry } from '../src/auth/bearer.ts'
import { systemClock } from '../src/clock.ts'
import { type Config, loadConfig } from '../src/config.ts'
import { type Collections, FIRST_CONTACT_INDEX } from '../src/db.ts'
import { seedConfiguredPlatformTenants } from '../src/seed.ts'
import { buildApi } from '../src/server.ts'
import { findOrCreatePlatformUser } from '../src/users.ts'
import { openTestStore, type TestStore } from './helpers.ts'
import { directGrantToken, integratedEnv } from './keycloak.ts'

const PARALLEL = 8

let config: Config
let token: string
let warmUpToken: string
let subject: string

/** Eight requests for the same never-seen user, issued together. */
async function eightFirstContacts(app: FastifyInstance): Promise<number[]> {
  const replies = await Promise.all(
    Array.from({ length: PARALLEL }, () =>
      app.inject({
        method: 'GET',
        url: '/api/tasks',
        headers: { authorization: `Bearer ${token}` },
      }),
    ),
  )
  return replies.map((reply) => reply.statusCode)
}

beforeAll(async () => {
  config = loadConfig(integratedEnv())
  // bianca has never been seen by any test in this file's database.
  token = await directGrantToken({
    realm: 'tenant-b',
    username: 'bianca',
    secretName: 'ACME_TASKS_SECRET_TENANT_B',
  })
  subject = decodeJwt(token).sub as string
  // Another user of the same realm, used to warm the JWKS and the connection pool before the race.
  warmUpToken = await directGrantToken({
    realm: 'tenant-b',
    username: 'bob',
    secretName: 'ACME_TASKS_SECRET_TENANT_B',
  })
})

/**
 * Pay for discovery, the JWKS fetch and the first database connection before the eight requests, so
 * that what they contend over is the user document and not the network.
 */
async function warmUp(app: FastifyInstance): Promise<void> {
  const reply = await app.inject({
    method: 'GET',
    url: '/api/tasks',
    headers: { authorization: `Bearer ${warmUpToken}` },
  })
  if (reply.statusCode !== 200) throw new Error(`warm-up failed: ${reply.statusCode} ${reply.body}`)
}

describe('with the partial unique index in place (FR-010, SC-002)', () => {
  let store: TestStore
  let app: FastifyInstance

  beforeAll(async () => {
    store = await openTestStore('first_contact_green')
    await seedConfiguredPlatformTenants(store, config.platformTenants.values())
    app = buildApi({
      config,
      collections: store,
      clock: systemClock(),
      jwks: newJwksRegistry(),
      warn: () => {},
    })
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
    await store?.close()
  })

  it('the index exists, over the fields research R-8 names', async () => {
    const indexes = await store.db.collection('users').listIndexes().toArray()
    const index = indexes.find((candidate) => candidate.name === FIRST_CONTACT_INDEX)
    expect(index?.key).toEqual({ tenantId: 1, platformSubject: 1 })
    expect(index?.unique).toBe(true)
  })

  it('eight requests at the same time leave exactly one user', async () => {
    await warmUp(app)
    expect(await store.users.countDocuments({ platformSubject: subject })).toBe(0)

    const statuses = await eightFirstContacts(app)
    expect(statuses).toEqual(Array.from({ length: PARALLEL }, () => 200))

    expect(await store.users.countDocuments({ platformSubject: subject })).toBe(1)
    // bianca and the warm-up's bob, and nobody else.
    expect(await store.users.countDocuments({ tenantId: 'tenant-b' })).toBe(2)
  })

  it('and eight more afterwards create nothing', async () => {
    const before = await store.users.countDocuments({})
    await eightFirstContacts(app)
    expect(await store.users.countDocuments({})).toBe(before)
  })
})

/**
 * Forcing the race instead of hoping for it.
 *
 * Eight parallel HTTP requests do not actually interleave at the database on this host: measured with
 * a probe, all eight began together but only one reported `created=true` and the other seven read the
 * document back, even with the index dropped and the connection pool warmed — the driver's round
 * trips serialise, so the first insert lands before the others' read is sent. A control that depended
 * on winning that race would prove nothing on a good day and fail on a bad one.
 *
 * So the interleaving is made certain: every one of the eight does its read, waits at a barrier until
 * all eight have read, and only then inserts. That is the moment FR-010 is about. Nothing in
 * `apps/api/src/users.ts` is modified — the barrier wraps the `Collections` handed to it.
 */
function barriered(store: Collections, size: number): Collections {
  let arrived = 0
  let open: () => void = () => {}
  const allRead = new Promise<void>((resolve) => {
    open = resolve
  })
  const users = new Proxy(store.users, {
    get(target, property, receiver) {
      if (property !== 'findOne') return Reflect.get(target, property, receiver)
      return async (...args: unknown[]) => {
        const found = await (target.findOne as (...a: unknown[]) => Promise<unknown>)(...args)
        arrived += 1
        if (arrived >= size) open()
        await allRead
        return found
      }
    },
  })
  return { ...store, users: users as Collections['users'] }
}

async function eightAtOnce(store: Collections): Promise<number> {
  const gated = barriered(store, PARALLEL)
  await Promise.all(
    Array.from({ length: PARALLEL }, () =>
      findOrCreatePlatformUser(
        gated,
        {
          tenantId: 'tenant-b',
          platformSubject: subject,
          email: 'bianca@tenant-b.example',
          name: 'Bianca Bruno',
          roles: ['member'],
        },
        new Date(),
      ),
    ),
  )
  return store.users.countDocuments({ platformSubject: subject })
}

describe('the guard, with the race forced (SC-002, research R-8)', () => {
  let store: TestStore

  beforeAll(async () => {
    store = await openTestStore('first_contact_forced')
  })

  afterAll(async () => {
    await store?.close()
  })

  it('with the index in place, eight simultaneous inserts leave exactly one user', async () => {
    expect(await eightAtOnce(store)).toBe(1)
  })
})

describe('CONTROL: without the uniqueness guards, the same eight duplicate (SC-002)', () => {
  // These are controls (constitution V): they assert the WRONG outcome on purpose, to show what the
  // database's uniqueness is doing. They run on their own throwaway databases; `acme_tasks` is never
  // touched.
  //
  // Dropping only the partial unique index of research R-8 is **not** enough to produce duplicates,
  // and that is worth stating: `users` also carries `users_tenant_email_unique` over
  // `{ tenantId, email }` (data-model.md), and a first contact for one platform subject always
  // carries the same address, so that second index catches the same race. The first test below
  // measures which index rejects the duplicate; the second drops both and shows the eight users
  // SC-002 describes.
  let partialOnly: TestStore
  let neither: TestStore

  beforeAll(async () => {
    partialOnly = await openTestStore('first_contact_control_partial')
    await partialOnly.users.dropIndex(FIRST_CONTACT_INDEX)
    neither = await openTestStore('first_contact_control_none')
    await neither.users.dropIndex(FIRST_CONTACT_INDEX)
    await neither.users.dropIndex('users_tenant_email_unique')
  })

  afterAll(async () => {
    await partialOnly?.close()
    await neither?.close()
  })

  it('control: with only the partial index dropped, the e-mail index catches the race instead', async () => {
    const names = (await partialOnly.db.collection('users').listIndexes().toArray()).map(
      (i) => i.name,
    )
    expect(names).not.toContain(FIRST_CONTACT_INDEX)
    expect(names).toContain('users_tenant_email_unique')

    expect(await eightAtOnce(partialOnly)).toBe(1)

    // And this is the index that did it.
    const rejection = await partialOnly.users
      .insertOne({
        tenantId: 'tenant-b',
        platformSubject: `${subject}-other`,
        email: 'bianca@tenant-b.example',
        name: 'Bianca Bruno',
        roles: ['member'],
      })
      .then(() => null)
      .catch((error: Error) => error.message)
    expect(rejection).toContain('E11000')
    expect(rejection).toContain('users_tenant_email_unique')
  })

  it('control: with both unique indexes dropped, eight simultaneous inserts leave eight users', async () => {
    const names = (await neither.db.collection('users').listIndexes().toArray()).map((i) => i.name)
    expect(names).not.toContain(FIRST_CONTACT_INDEX)
    expect(names).not.toContain('users_tenant_email_unique')

    expect(await eightAtOnce(neither)).toBe(PARALLEL)
  })
})
