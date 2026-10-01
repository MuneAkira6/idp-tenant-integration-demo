/**
 * T063 — the production wiring schedules the real intervals (AC-31, FR-032).
 *
 * The running system uses an hour for the pick-up, the retry, the device pull and the session
 * refresh, and thirty days for the expiries. This test reads what the wiring actually registered and
 * then advances the injected clock to watch each job run, rather than trusting the list.
 *
 * It is also where `refreshSession` gets its caller: the classification of FR-004 has been correct
 * since G1, and until now nothing in the running system invoked it (Incidental finding 2).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { encryptToken } from '../src/auth/crypto.ts'
import { DAY_MS, HOUR_MS, type ManualClock, manualClock } from '../src/clock.ts'
import { type Config, loadConfig } from '../src/config.ts'
import { refreshDueSessions, type Scheduler } from '../src/scheduler.ts'
import { type Api, buildApi } from '../src/server.ts'
import { openTestStore, type TestStore } from './helpers.ts'
import { CLOSED_PORT, integratedEnv } from './keycloak.ts'

let store: TestStore
let app: Api
let config: Config
let clock: ManualClock
let scheduler: Scheduler

beforeAll(async () => {
  store = await openTestStore('scheduler')
  clock = manualClock(new Date())
  // The platform and the IdP are both on a closed port throughout: the jobs must still run and still
  // be counted, and a refresh that cannot reach the IdP is the `unreachable` case of FR-004 — the one
  // that keeps the session and schedules another try, which is what an hourly job is for.
  config = loadConfig({
    ...integratedEnv({
      tenants: ['tenant-a'],
      issuerOverride: { 'tenant-a': `http://localhost:${CLOSED_PORT}/realms/tenant-a` },
    }),
    PLATFORM_API_BASE_URL: `http://localhost:${CLOSED_PORT}`,
  })
  app = buildApi({ config, collections: store, clock, warn: () => {} })
  await app.startUp()
  scheduler = app.scheduler as Scheduler
})

afterAll(async () => {
  scheduler?.stop()
  app?.inbox.stop()
  await app?.close()
  await store?.close()
})

describe('what the running system schedules (AC-31, FR-032)', () => {
  it('registers every recurring job, each at its real interval', () => {
    expect(scheduler).not.toBeNull()
    const jobs = Object.fromEntries(scheduler.jobs().map((job) => [job.job, job.intervalMs]))
    expect(jobs).toEqual({
      'inbox.sweep': HOUR_MS,
      'tenantLookups.retry': HOUR_MS,
      'devices.pull': HOUR_MS,
      'sessions.refresh': HOUR_MS,
      expiries: 30 * DAY_MS,
    })
    // The real values, not shortened for the tests.
    expect(HOUR_MS).toBe(3_600_000)
    expect(30 * DAY_MS).toBe(2_592_000_000)
  })

  it('and the clock is what drives them: one hour, one run of each hourly job', async () => {
    // This test advances the injected clock instead of waiting (FR-032).
    await clock.advance(HOUR_MS)
    const runs = Object.fromEntries(scheduler.jobs().map((job) => [job.job, job.runs]))
    expect(runs).toEqual({
      'inbox.sweep': 1,
      'tenantLookups.retry': 1,
      'devices.pull': 1,
      'sessions.refresh': 1,
      expiries: 0,
    })

    await clock.advance(2 * HOUR_MS)
    const after = Object.fromEntries(scheduler.jobs().map((job) => [job.job, job.runs]))
    expect(after['inbox.sweep']).toBe(3)
    expect(after.expiries).toBe(0)
  })

  it('the expiries run when thirty days pass, and not before', async () => {
    const before = scheduler.jobs().find((job) => job.job === 'expiries')?.runs as number
    await clock.advance(29 * DAY_MS)
    expect(scheduler.jobs().find((job) => job.job === 'expiries')?.runs).toBe(before)
    await clock.advance(DAY_MS)
    expect(scheduler.jobs().find((job) => job.job === 'expiries')?.runs).toBe(before + 1)
  })
})

describe('the session refresh has a caller in the running system (FR-004, AC-31)', () => {
  it('picks up a session whose refreshRetryAt has passed, and leaves one whose has not', async () => {
    const key = config.tokenEncryptionKey as Buffer
    const now = clock.now()
    const platform = {
      issuer: `http://localhost:${CLOSED_PORT}/realms/tenant-a`,
      accessTokenEnc: encryptToken(key, 'an-access-token'),
      refreshTokenEnc: encryptToken(key, 'a-refresh-token'),
      accessExpiresAt: now,
    }
    await store.sessions.insertMany([
      {
        _id: 'session-due',
        tenantId: 'tenant-a',
        userId: 'user-due',
        kind: 'platform',
        createdAt: now,
        expiresAt: new Date(now.getTime() + 7 * DAY_MS),
        refreshRetryAt: new Date(now.getTime() - 1),
        platform,
      },
      {
        _id: 'session-not-due',
        tenantId: 'tenant-a',
        userId: 'user-not-due',
        kind: 'platform',
        createdAt: now,
        expiresAt: new Date(now.getTime() + 7 * DAY_MS),
        refreshRetryAt: new Date(now.getTime() + HOUR_MS),
        platform,
      },
      {
        _id: 'session-never-failed',
        tenantId: 'tenant-a',
        userId: 'user-ok',
        kind: 'platform',
        createdAt: now,
        expiresAt: new Date(now.getTime() + 7 * DAY_MS),
        platform,
      },
    ])

    // Only the due one is taken. The refresh fails because the IdP is on a closed port, which is the
    // `unreachable` case: the session survives and a new retry is set an hour out (FR-004). That is
    // the classification G1 proved; what is new here is that the running system calls it at all.
    const taken = await refreshDueSessions({ config, collections: store, clock })
    expect(taken).toBe(1)

    const due = await store.sessions.findOne({ _id: 'session-due' })
    expect(due).not.toBeNull()
    expect(due?.refreshRetryAt?.getTime()).toBe(clock.now().getTime() + HOUR_MS)

    const notDue = await store.sessions.findOne({ _id: 'session-not-due' })
    expect(notDue?.refreshRetryAt?.getTime()).toBe(now.getTime() + HOUR_MS)
    expect(await store.sessions.findOne({ _id: 'session-never-failed' })).not.toBeNull()
  })

  it('and the hourly job is the one that calls it', async () => {
    await store.sessions.updateOne(
      { _id: 'session-due' },
      { $set: { refreshRetryAt: new Date(clock.now().getTime() - 1) } },
    )
    const before = scheduler.jobs().find((job) => job.job === 'sessions.refresh')?.runs as number

    await clock.advance(HOUR_MS)

    expect(scheduler.jobs().find((job) => job.job === 'sessions.refresh')?.runs).toBe(before + 1)
    // It ran and moved the retry forward from where the job found it.
    const due = await store.sessions.findOne({ _id: 'session-due' })
    expect(due?.refreshRetryAt?.getTime()).toBe(clock.now().getTime() + HOUR_MS)
  })
})
