/**
 * T017 — a refused refresh versus an IdP that cannot be reached (US1 scenarios 3 and 4, FR-004, Q3).
 *
 * Q3 produces the unreachable case by stopping Keycloak. Here the refresh is pointed at a port inside
 * the run's own range that nothing listens on (18419), which is the same observation — no answer from
 * the IdP — without disturbing a stack the other rows depend on.
 *
 * The last test in this file is the CONTROL the constitution asks for (principle V): with both
 * failures classified alike, the unreachable case ends the session, which is the wrong outcome.
 */

import { FLOW_COOKIE, SESSION_COOKIE } from '@acme/contracts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { endPlatformSession, forgetDiscovery } from '../src/auth/platform.ts'
import { refreshSession } from '../src/auth/refresh.ts'
import { platformTokenOf } from '../src/auth/session.ts'
import { HOUR_MS, systemClock } from '../src/clock.ts'
import { type Config, loadConfig } from '../src/config.ts'
import type { SessionDoc } from '../src/db.ts'
import { seedConfiguredPlatformTenants } from '../src/seed.ts'
import { buildApi } from '../src/server.ts'
import { openTestStore, type TestStore } from './helpers.ts'
import {
  CLOSED_PORT,
  callbackPathOf,
  cookieFromReply,
  integratedEnv,
  newBrowser,
  newEncryptionKey,
  stackEnv,
} from './keycloak.ts'

const clock = systemClock()
const encryptionKey = newEncryptionKey()

let store: TestStore
let app: FastifyInstance
/** The platform is reachable. */
let config: Config
/** The same deployment, but the IdP is on a port nothing listens on. */
let unreachableConfig: Config

beforeAll(async () => {
  forgetDiscovery()
  store = await openTestStore('refresh')
  config = loadConfig(integratedEnv({ tenants: ['tenant-a'], encryptionKey }))
  unreachableConfig = loadConfig(
    integratedEnv({
      tenants: ['tenant-a'],
      encryptionKey,
      issuerOverride: { 'tenant-a': `http://localhost:${CLOSED_PORT}/realms/tenant-a` },
    }),
  )
  await seedConfiguredPlatformTenants(store, config.platformTenants.values())
  app = buildApi({ config, collections: store, clock })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await store?.close()
})

/** A real sign-in against Keycloak, returning the stored session. */
async function signIn(username = 'alice'): Promise<SessionDoc> {
  const login = await app.inject({ method: 'GET', url: '/auth/login?tenant=tenant-a' })
  const flowCookie = cookieFromReply(
    login.headers as Record<string, unknown>,
    FLOW_COOKIE,
  ) as string
  const browser = newBrowser(username, stackEnv().KEYCLOAK_SEED_PASSWORD as string)
  const { callbackUrl } = await browser.authorize(login.headers.location as string)
  const reply = await app.inject({
    method: 'GET',
    url: callbackPathOf(callbackUrl as string),
    cookies: { [FLOW_COOKIE]: flowCookie },
  })
  const sessionId = cookieFromReply(
    reply.headers as Record<string, unknown>,
    SESSION_COOKIE,
  ) as string
  const session = await store.sessions.findOne({ _id: sessionId })
  if (!session) throw new Error('sign-in did not create a session')
  return session
}

describe('a refresh the platform answers (FR-004)', () => {
  it('replaces the stored tokens and clears any retry', async () => {
    const session = await signIn()
    const before = platformTokenOf(session, Buffer.from(encryptionKey, 'base64'), 'accessTokenEnc')
    await store.sessions.updateOne({ _id: session._id }, { $set: { refreshRetryAt: clock.now() } })

    const result = await refreshSession({ config, collections: store, clock }, session)
    expect(result).toEqual({ outcome: 'refreshed' })

    const after = await store.sessions.findOne({ _id: session._id })
    expect(after).not.toBeNull()
    expect(after?.refreshRetryAt).toBeUndefined()
    const now = platformTokenOf(
      after as SessionDoc,
      Buffer.from(encryptionKey, 'base64'),
      'accessTokenEnc',
    )
    expect(now).toBeTruthy()
    expect(now).not.toBe(before)
  })
})

describe('the platform explicitly refuses the refresh (Q3, US1 scenario 3)', () => {
  it('ends the application session', async () => {
    const session = await signIn()
    // Revoke the platform session, exactly as an administrator would: the refresh token is now dead.
    const refreshToken = platformTokenOf(
      session,
      Buffer.from(encryptionKey, 'base64'),
      'refreshTokenEnc',
    ) as string
    const revoked = await endPlatformSession(
      config.platformTenants.get('tenant-a') as NonNullable<
        ReturnType<typeof config.platformTenants.get>
      >,
      refreshToken,
    )
    expect(revoked.status).toBe(204)

    const result = await refreshSession({ config, collections: store, clock }, session)
    expect(result).toEqual({ outcome: 'ended', reason: 'refused' })
    expect(await store.sessions.findOne({ _id: session._id })).toBeNull()
  })
})

describe('the platform cannot be reached (Q3, US1 scenario 4)', () => {
  it('keeps the application session and sets refreshRetryAt an hour out', async () => {
    const session = await signIn()
    const before = clock.now().getTime()

    const result = await refreshSession(
      { config: unreachableConfig, collections: store, clock },
      session,
    )
    expect(result.outcome).toBe('kept')

    const after = await store.sessions.findOne({ _id: session._id })
    expect(after).not.toBeNull()
    expect(after?.kind).toBe('platform')
    const retryAt = after?.refreshRetryAt
    expect(retryAt).toBeInstanceOf(Date)
    const retryIn = (retryAt as Date).getTime() - before
    expect(retryIn).toBeGreaterThanOrEqual(HOUR_MS - 5_000)
    expect(retryIn).toBeLessThanOrEqual(HOUR_MS + 5_000)
  })
})

describe('CONTROL: with both refresh failures treated alike, one case ends wrongly', () => {
  // This is a control (constitution V): it asserts the WRONG behaviour on purpose, to show that the
  // classification of FR-004 is what produces the right one. It is not a requirement of the system.
  it('control: classifying every failure as `refused` ends a session the platform never refused', async () => {
    const session = await signIn()

    const result = await refreshSession(
      {
        config: unreachableConfig,
        collections: store,
        clock,
        // the guard removed: both failures treated alike
        classify: () => 'refused',
      },
      session,
    )

    // Red: the unreachable IdP ended the session, although it said nothing about the user.
    expect(result).toEqual({ outcome: 'ended', reason: 'refused' })
    expect(await store.sessions.findOne({ _id: session._id })).toBeNull()
  })

  it('green: the same failure with the real classification keeps the session', async () => {
    const session = await signIn()
    const result = await refreshSession(
      { config: unreachableConfig, collections: store, clock },
      session,
    )
    expect(result.outcome).toBe('kept')
    expect(await store.sessions.findOne({ _id: session._id })).not.toBeNull()
  })
})
