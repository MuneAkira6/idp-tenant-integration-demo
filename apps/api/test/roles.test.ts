/**
 * T026, T027, T028 — roles follow the platform (US3, Q7, SC-005, FR-011 to FR-013).
 *
 * Every sign-in here is a real one against the Compose stack's Keycloak, so the roles come from the
 * `resource_access` of a token the IdP actually issued (facts F13, F18).
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newJwksRegistry } from '../src/auth/bearer.ts'
import { forgetDiscovery } from '../src/auth/platform.ts'
import { systemClock } from '../src/clock.ts'
import { type Config, loadConfig } from '../src/config.ts'
import type { UserDoc } from '../src/db.ts'
import { deriveApplicationRoles } from '../src/roles.ts'
import { seedConfiguredPlatformTenants } from '../src/seed.ts'
import { buildApi } from '../src/server.ts'
import { openTestStore, type TestStore } from './helpers.ts'
import { integratedEnv, newBrowser, signInThroughPlatform, stackEnv } from './keycloak.ts'

let store: TestStore
let app: FastifyInstance
let config: Config
const warnings: string[] = []

beforeAll(async () => {
  forgetDiscovery()
  store = await openTestStore('roles')
  config = loadConfig(integratedEnv())
  await seedConfiguredPlatformTenants(store, config.platformTenants.values())
  app = buildApi({
    config,
    collections: store,
    clock: systemClock(),
    jwks: newJwksRegistry(),
    warn: (message) => warnings.push(message),
  })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await store?.close()
})

const userOf = (email: string): Promise<UserDoc | null> =>
  store.users.findOne({ tenantId: 'tenant-a', email })

describe('the union across clients is mapped and replaces what was stored (T026, Q7, FR-011, FR-012)', () => {
  it('carol holds roles in two clients and gets the union of their mappings', async () => {
    await signInThroughPlatform(app, { tenant: 'tenant-a', username: 'carol' })
    const carol = await userOf('carol@tenant-a.example')
    // acme-tasks:tasks-user -> member and acme-reports:reports-admin -> admin.
    expect(carol?.roles).toEqual(['member', 'admin'])
  })

  it('the derived roles replace what was stored, they do not merge with it', async () => {
    const before = await userOf('carol@tenant-a.example')
    await store.users.updateOne(
      { _id: before?._id },
      { $set: { roles: ['manager'], rolesWrittenAt: new Date(0) } },
    )
    expect((await userOf('carol@tenant-a.example'))?.roles).toEqual(['manager'])

    await signInThroughPlatform(app, { tenant: 'tenant-a', username: 'carol' })

    const after = await userOf('carol@tenant-a.example')
    expect(after?.roles).toEqual(['member', 'admin'])
    expect(after?.roles).not.toContain('manager')
  })

  it('alice, with one client role, gets exactly that one mapping', async () => {
    await signInThroughPlatform(app, { tenant: 'tenant-a', username: 'alice' })
    expect((await userOf('alice@tenant-a.example'))?.roles).toEqual(['member'])
  })

  it('mia and adam get manager and admin from their client roles', async () => {
    await signInThroughPlatform(app, { tenant: 'tenant-a', username: 'mia' })
    await signInThroughPlatform(app, { tenant: 'tenant-a', username: 'adam' })
    expect((await userOf('mia@tenant-a.example'))?.roles).toEqual(['manager'])
    expect((await userOf('adam@tenant-a.example'))?.roles).toEqual(['admin'])
  })
})

describe('ten sign-ins with unchanged roles write the roles zero times (T027, SC-005)', () => {
  it('counts the writes in the database, not in a log', async () => {
    await signInThroughPlatform(app, { tenant: 'tenant-a', username: 'alice' })
    const before = await userOf('alice@tenant-a.example')
    const writtenAtBefore = before?.rolesWrittenAt?.toISOString()
    expect(writtenAtBefore).toBeTruthy()

    // One browser, so the IdP signs it in silently after the first form: ten real sign-ins.
    const browser = newBrowser('alice', stackEnv().KEYCLOAK_SEED_PASSWORD as string)
    for (let i = 0; i < 10; i += 1) {
      const { status } = await signInThroughPlatform(app, {
        tenant: 'tenant-a',
        username: 'alice',
        browser,
      })
      expect(status).toBe(302)
    }

    const after = await userOf('alice@tenant-a.example')
    expect(after?.roles).toEqual(['member'])
    // Zero writes: the field that moves on a write has not moved.
    expect(after?.rolesWrittenAt?.toISOString()).toBe(writtenAtBefore)
    expect(
      await store.sessions.countDocuments({ userId: String(after?._id) }),
    ).toBeGreaterThanOrEqual(10)
  })

  it('and a sign-in that does change the roles moves it, so a write would have been seen', async () => {
    const before = await userOf('alice@tenant-a.example')
    await store.users.updateOne(
      { _id: before?._id },
      { $set: { roles: ['admin'], rolesWrittenAt: new Date(0) } },
    )

    await signInThroughPlatform(app, { tenant: 'tenant-a', username: 'alice' })

    const after = await userOf('alice@tenant-a.example')
    expect(after?.roles).toEqual(['member'])
    expect(after?.rolesWrittenAt?.toISOString()).not.toBe(new Date(0).toISOString())
  })
})

describe('a platform role with no mapping (T028, FR-013)', () => {
  it('gives erin the lowest role and logs a warning that names the role', async () => {
    warnings.length = 0
    await signInThroughPlatform(app, { tenant: 'tenant-a', username: 'erin' })

    const erin = await userOf('erin@tenant-a.example')
    expect(erin?.roles).toEqual(['member'])

    const named = warnings.filter((message) => message.includes('acme-reports:legacy-viewer'))
    expect(named).toHaveLength(1)
    expect(named[0]).toContain('has no mapping')
    expect(named[0]).toContain('gets member')
  })

  it('the derivation reports the unmapped role rather than swallowing it', () => {
    const derived = deriveApplicationRoles({
      'acme-tasks': { roles: ['tasks-manager'] },
      'acme-reports': { roles: ['legacy-viewer'] },
    })
    expect(derived.roles).toEqual(['member', 'manager'])
    expect(derived.unmapped).toEqual([{ client: 'acme-reports', role: 'legacy-viewer' }])
  })

  it('a role of a client the application does not know is not part of the union', () => {
    const derived = deriveApplicationRoles({
      'acme-tasks': { roles: ['tasks-user'] },
      'some-other-service': { roles: ['its-own-admin'] },
    })
    expect(derived.roles).toEqual(['member'])
    expect(derived.unmapped).toEqual([])
  })
})
