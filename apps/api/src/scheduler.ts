/**
 * The production wiring of the recurring work (T063, FR-032).
 *
 * The running system uses the real intervals — an hour is an hour and thirty days are thirty days.
 * A test advances the injected clock instead of waiting, and says where it does.
 *
 * Everything recurring is registered here, in one place, so that the wiring can be read and counted:
 *
 *   every hour   the inbox sweep          (FR-017)  — deliveries stored but not processed
 *   every hour   the tenant-lookup retry  (FR-021)  — lookups that could not reach the platform
 *   every hour   the device pull          (FR-023)  — each integrated tenant's devices
 *   every hour   the session refresh      (FR-004)  — sessions whose `refreshRetryAt` has passed
 *   every 30 days the expiries            (FR-021, FR-022) — pending lookups, and deleted tenants' data
 */

import { refreshSession } from './auth/refresh.ts'
import type { CancelTimer, Clock } from './clock.ts'
import type { Config } from './config.ts'
import type { Collections } from './db.ts'
import { pullAllTenants } from './devices/pull.ts'
import { retryPendingLookups } from './tenants/lookup.ts'
import { applyLookedUpTenant, purgeDeletedTenants } from './tenants/sync.ts'
import type { Inbox } from './webhooks/inbox.ts'

export type SchedulerDeps = {
  config: Config
  collections: Collections
  clock: Clock
  inbox: Inbox
}

export type ScheduledJob =
  | 'inbox.sweep'
  | 'tenantLookups.retry'
  | 'devices.pull'
  | 'sessions.refresh'
  | 'expiries'

export type Scheduler = {
  /** what is scheduled, and at what interval, for the wiring check of FR-032 */
  jobs(): Array<{ job: ScheduledJob; intervalMs: number; runs: number }>
  /** run one job now, as its timer would */
  run(job: ScheduledJob): Promise<void>
  stop(): void
}

/**
 * Sessions the platform could not be reached for are retried here (FR-004). The classification
 * itself lives in `apps/api/src/auth/refresh.ts`; this is the caller that makes it run.
 */
export async function refreshDueSessions(deps: Omit<SchedulerDeps, 'inbox'>): Promise<number> {
  const now = deps.clock.now()
  const due = await deps.collections.sessions.find({ refreshRetryAt: { $lte: now } }).toArray()
  for (const session of due) {
    await refreshSession(
      { config: deps.config, collections: deps.collections, clock: deps.clock },
      session,
    )
  }
  return due.length
}

export async function runExpiries(deps: Omit<SchedulerDeps, 'inbox'>): Promise<void> {
  await purgeDeletedTenants(deps.collections, deps.clock)
  // A pending lookup past its own `expiresAt` becomes `expired` (FR-021); the retry does that check.
  await retryPendingLookups(deps, async (lookup, tenant) => {
    await applyLookedUpTenant(deps, lookup.platformTenantId, tenant, deps.clock.now())
  })
}

export function startScheduler(deps: SchedulerDeps): Scheduler {
  const { config, clock, inbox } = deps
  const runs = new Map<ScheduledJob, number>()
  const cancels: CancelTimer[] = []

  const work: Record<ScheduledJob, () => Promise<void>> = {
    'inbox.sweep': async () => {
      await inbox.sweep()
    },
    'tenantLookups.retry': async () => {
      await retryPendingLookups(deps, async (lookup, tenant) => {
        await applyLookedUpTenant(deps, lookup.platformTenantId, tenant, clock.now())
      })
    },
    'devices.pull': async () => {
      await pullAllTenants(deps)
    },
    'sessions.refresh': async () => {
      await refreshDueSessions(deps)
    },
    expiries: async () => {
      await runExpiries(deps)
    },
  }

  const scheduled: Array<{ job: ScheduledJob; intervalMs: number }> = [
    { job: 'inbox.sweep', intervalMs: config.intervals.sweepMs },
    { job: 'tenantLookups.retry', intervalMs: config.intervals.lookupRetryMs },
    { job: 'devices.pull', intervalMs: config.intervals.devicePullMs },
    { job: 'sessions.refresh', intervalMs: config.intervals.lookupRetryMs },
    { job: 'expiries', intervalMs: config.intervals.expiryMs },
  ]

  for (const entry of scheduled) {
    runs.set(entry.job, 0)
    cancels.push(
      clock.every(entry.intervalMs, async () => {
        runs.set(entry.job, (runs.get(entry.job) ?? 0) + 1)
        await work[entry.job]()
      }),
    )
  }

  return {
    jobs: () => scheduled.map((entry) => ({ ...entry, runs: runs.get(entry.job) ?? 0 })),
    run: async (job) => {
      runs.set(job, (runs.get(job) ?? 0) + 1)
      await work[job]()
    },
    stop: () => {
      for (const cancel of cancels) cancel()
    },
  }
}
