/**
 * T066 — the roles of a caller with a platform token come from that token, every time (US9, Q17,
 * FR-034).
 *
 * This test changes the realm: it removes `acme-tasks:tasks-manager` from dave and gives him
 * `acme-tasks:tasks-user` instead, so that a new token maps him to `member` rather than `manager`.
 * Both changes are undone in `afterAll`, and the change is recorded in the Environment change ledger
 * of goal-pack/PROGRESS.md. dave exists in the realm imports for exactly this row.
 *
 * The last describe is the CONTROL of quickstart §4: with the principal's roles read from the stored
 * user instead of from the token, the second call still answers 200.
 */

import { OPERATION_ROUTES } from '@acme/contracts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newJwksRegistry } from '../src/auth/bearer.ts'
import { forgetDiscovery } from '../src/auth/platform.ts'
import { systemClock } from '../src/clock.ts'
import { type Config, loadConfig } from '../src/config.ts'
import type { UserDoc } from '../src/db.ts'
import { seedConfiguredPlatformTenants } from '../src/seed.ts'
import { buildApi } from '../src/server.ts'
import { openTestStore, type TestStore } from './helpers.ts'
import {
  addClientRole,
  clientRolesOf,
  directGrantToken,
  integratedEnv,
  removeClientRole,
  signInThroughPlatform,
} from './keycloak.ts'

const DAVE = { realm: 'tenant-a', username: 'dave', clientId: 'acme-tasks' } as const
const DEVICES = OPERATION_ROUTES['devices.read']
const TASKS = OPERATION_ROUTES['tasks.read']

let store: TestStore
let app: FastifyInstance
let config: Config
let rolesBeforeTheRun: string[]

/** dave's stored user document, which FR-034 says must not change on the token path. */
const dave = (): Promise<UserDoc | null> =>
  store.users.findOne({ tenantId: 'tenant-a', email: 'dave@tenant-a.example' })

const tokenForDave = (): Promise<string> =>
  directGrantToken({
    realm: 'tenant-a',
    username: 'dave',
    secretName: 'ACME_TASKS_SECRET_TENANT_A',
  })

beforeAll(async () => {
  forgetDiscovery()
  store = await openTestStore('token_roles')
  config = loadConfig(integratedEnv())
  await seedConfiguredPlatformTenants(store, config.platformTenants.values())
  app = buildApi({
    config,
    collections: store,
    clock: systemClock(),
    jwks: newJwksRegistry(),
    warn: () => {},
  })
  await app.ready()
  rolesBeforeTheRun = await clientRolesOf(DAVE)
})

afterAll(async () => {
  // Restore the realm exactly as it was found, in this goal and not at G6.
  const now = await clientRolesOf(DAVE)
  for (const role of now) {
    if (!rolesBeforeTheRun.includes(role)) await removeClientRole({ ...DAVE, role })
  }
  for (const role of rolesBeforeTheRun) {
    if (!now.includes(role)) await addClientRole({ ...DAVE, role })
  }
  await app?.close()
  await store?.close()
})

describe('a token whose roles map to manager, and then no longer do (Q17, FR-034)', () => {
  it('reads the devices, is demoted on the platform, and is refused — with no sign-in in between', async () => {
    expect(rolesBeforeTheRun).toEqual(['tasks-manager'])

    // dave signs in once through the browser, so his stored roles say `manager` (FR-011). Everything
    // after this point is token-authenticated; there is no second sign-in.
    await signInThroughPlatform(app, { tenant: 'tenant-a', username: 'dave' })
    const storedBefore = await dave()
    expect(storedBefore?.roles).toEqual(['manager'])
    const sessionsAfterSignIn = await store.sessions.countDocuments({})

    const first = await app.inject({
      method: DEVICES.method,
      url: DEVICES.path,
      headers: { authorization: `Bearer ${await tokenForDave()}` },
    })
    expect(first.statusCode).toBe(200)

    // The platform demotes him: manager away, member instead.
    await removeClientRole({ ...DAVE, role: 'tasks-manager' })
    await addClientRole({ ...DAVE, role: 'tasks-user' })
    expect(await clientRolesOf(DAVE)).toEqual(['tasks-user'])

    const second = await app.inject({
      method: DEVICES.method,
      url: DEVICES.path,
      headers: { authorization: `Bearer ${await tokenForDave()}` },
    })
    expect(second.statusCode).toBe(403)
    expect(second.json()).toEqual({
      error: 'forbidden',
      message: 'devices.read needs a role this principal does not have',
    })

    // He is still a member, so the demotion is a demotion and not an outage.
    const stillTasks = await app.inject({
      method: TASKS.method,
      url: TASKS.path,
      headers: { authorization: `Bearer ${await tokenForDave()}` },
    })
    expect(stillTasks.statusCode).toBe(200)

    // No sign-in in between, and nothing written: the stored roles are exactly what they were.
    const storedAfter = await dave()
    expect(storedAfter?.roles).toEqual(['manager'])
    expect(storedAfter?.rolesWrittenAt?.toISOString()).toBe(
      storedBefore?.rolesWrittenAt?.toISOString(),
    )
    expect(await store.sessions.countDocuments({})).toBe(sessionsAfterSignIn)
  })
})

describe('CONTROL: with the principal’s roles read from the stored user, the demotion is missed', () => {
  // This is a control (constitution V): it asserts the WRONG outcome on purpose, to show that reading
  // the roles from the token is what makes FR-034 true.
  it('control: the second call answers 200, where the real build answers 403', async () => {
    // The realm is still in its demoted state from the test above: dave maps to `member`.
    expect(await clientRolesOf(DAVE)).toEqual(['tasks-user'])
    expect((await dave())?.roles).toEqual(['manager'])

    const fromStoredUser = buildApi({
      config,
      collections: store,
      clock: systemClock(),
      jwks: newJwksRegistry(),
      warn: () => {},
      testControls: { readRolesFromStoredUser: true },
    })
    await fromStoredUser.ready()

    const token = await tokenForDave()
    const real = await app.inject({
      method: DEVICES.method,
      url: DEVICES.path,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(real.statusCode).toBe(403)

    const red = await fromStoredUser.inject({
      method: DEVICES.method,
      url: DEVICES.path,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(red.statusCode).toBe(200)

    await fromStoredUser.close()
  })
})
