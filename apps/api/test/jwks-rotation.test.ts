/**
 * AC-13 (research R-4, spec.md Edge Cases) — a token signed with a key rotated in after start-up is
 * accepted, after exactly one JWKS refetch.
 *
 * This test changes the realm: it adds a second RSA signing key to `tenant-b` with a higher priority,
 * so Keycloak signs new tokens with a `kid` the running API has never seen. The key provider is
 * removed again in `afterAll`, and the change is recorded in the Environment change ledger of
 * goal-pack/PROGRESS.md.
 */

import type { FastifyInstance } from 'fastify'
import { decodeProtectedHeader } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type JwksRegistry, newJwksRegistry } from '../src/auth/bearer.ts'
import { forgetDiscovery } from '../src/auth/platform.ts'
import { systemClock } from '../src/clock.ts'
import { type Config, loadConfig } from '../src/config.ts'
import { seedConfiguredPlatformTenants } from '../src/seed.ts'
import { buildApi } from '../src/server.ts'
import { openTestStore, type TestStore } from './helpers.ts'
import {
  directGrantToken,
  integratedEnv,
  issuerOf,
  removeComponent,
  rotateSigningKey,
  signingKids,
} from './keycloak.ts'

const REALM = 'tenant-b'
const ISSUER = issuerOf(REALM)

let store: TestStore
let app: FastifyInstance
let config: Config
let jwks: JwksRegistry
let addedComponentId: string | null = null
let kidsBefore: string[]

const tokenForBob = (): Promise<string> =>
  directGrantToken({ realm: REALM, username: 'bob', secretName: 'ACME_TASKS_SECRET_TENANT_B' })

beforeAll(async () => {
  forgetDiscovery()
  store = await openTestStore('jwks_rotation')
  config = loadConfig(integratedEnv())
  await seedConfiguredPlatformTenants(store, config.platformTenants.values())
  jwks = newJwksRegistry()
  app = buildApi({ config, collections: store, clock: systemClock(), jwks, warn: () => {} })
  await app.ready()
  kidsBefore = await signingKids(REALM)
})

afterAll(async () => {
  // Restore the realm exactly as it was found, in this goal and not at G6.
  if (addedComponentId) await removeComponent(REALM, addedComponentId)
  await app?.close()
  await store?.close()
})

describe('a signing key rotated in after start-up (AC-13, research R-4)', () => {
  it('is picked up by exactly one JWKS refetch, and the token is accepted', async () => {
    expect(kidsBefore).toHaveLength(1)

    // 1. A token signed with the key the realm had at start-up.
    const before = await tokenForBob()
    const kidBefore = decodeProtectedHeader(before).kid
    expect(kidBefore).toBe(kidsBefore[0])
    expect(jwks.fetchCount(ISSUER)).toBe(0)

    const first = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${before}` },
    })
    expect(first.statusCode).toBe(200)
    // One fetch: the key set the API knows about.
    expect(jwks.fetchCount(ISSUER)).toBe(1)

    // A second call with the same key costs nothing more.
    await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${before}` },
    })
    expect(jwks.fetchCount(ISSUER)).toBe(1)

    // 2. The platform rotates a new key in, with a higher priority.
    addedComponentId = await rotateSigningKey(REALM, 'ac-13-rotated-rsa')
    const kidsAfter = await signingKids(REALM)
    expect(kidsAfter).toHaveLength(2)

    const after = await tokenForBob()
    const kidAfter = decodeProtectedHeader(after).kid
    expect(kidAfter).not.toBe(kidBefore)
    expect(kidsBefore).not.toContain(kidAfter)

    // 3. The running API has never seen this `kid`. It is accepted, after one refetch and no more.
    const second = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${after}` },
    })
    expect(second.statusCode).toBe(200)
    expect(jwks.fetchCount(ISSUER)).toBe(2)

    // A further call with the rotated key costs no further fetch: the refetch was the one.
    const third = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${after}` },
    })
    expect(third.statusCode).toBe(200)
    expect(jwks.fetchCount(ISSUER)).toBe(2)

    // And the old key still verifies its own tokens: a rotation is not a revocation.
    const stillOld = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${before}` },
    })
    expect(stillOld.statusCode).toBe(200)
    expect(jwks.fetchCount(ISSUER)).toBe(2)
  })

  it('and the realm is left with the key it started with', async () => {
    if (addedComponentId) {
      await removeComponent(REALM, addedComponentId)
      addedComponentId = null
    }
    expect(await signingKids(REALM)).toEqual(kidsBefore)
  })
})
