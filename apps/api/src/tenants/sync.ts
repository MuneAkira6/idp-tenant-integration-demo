/**
 * What a tenant event does to a tenant (T040; FR-019, FR-020, FR-022; research R-9).
 *
 * The rule that makes order not matter: **an event applies only if it is newer than the last applied
 * change**. Each tenant carries `platformChangedAt`, the platform time of the change it already
 * reflects, and an event whose `occurredAt` is not later is ignored — so a `tenant.created` that
 * arrives after a newer `tenant.deleted` cannot revive the tenant. The comparison is part of the
 * update's own filter, so two events being processed at once cannot both win.
 */

import type { DeliveryOutcome, TenantCreatedEvent, TenantDeletedEvent } from '@acme/contracts'
import { MongoServerError } from 'mongodb'
import { type Clock, DAY_MS } from '../clock.ts'
import type { Config } from '../config.ts'
import type { Collections, TenantDoc } from '../db.ts'
import { type LookupResult, lookUpTenant, recordLookup } from './lookup.ts'

/** How long a deleted tenant's data is kept before it is removed (FR-022). */
export const PURGE_AFTER_DAYS = 30

const DUPLICATE_KEY = 11000

export type SyncDeps = { config: Config; collections: Collections; clock: Clock }

/**
 * Apply an update only if it is newer than what the tenant already reflects.
 *
 * Returns `applied` when it won the claim and `ignored` when a newer change is already stored. The
 * upsert makes the first event for an unknown tenant create it; a duplicate-key error means the
 * tenant exists and the filter excluded it, which is the losing case.
 */
async function claim(
  collections: Collections,
  tenantId: string,
  occurredAt: Date,
  set: Partial<TenantDoc>,
  setOnInsert: Partial<TenantDoc>,
): Promise<DeliveryOutcome> {
  try {
    const result = await collections.tenants.updateOne(
      {
        _id: tenantId,
        $or: [
          { platformChangedAt: { $exists: false } },
          { platformChangedAt: { $lt: occurredAt } },
        ],
      },
      { $set: { ...set, platformChangedAt: occurredAt }, $setOnInsert: setOnInsert },
      { upsert: true },
    )
    return result.matchedCount > 0 || result.upsertedCount > 0 ? 'applied' : 'ignored'
  } catch (error) {
    // The tenant exists and its stored change is at least as new: this event is the older one.
    if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) return 'ignored'
    throw error
  }
}

export async function applyTenantCreated(
  deps: SyncDeps,
  event: TenantCreatedEvent,
  deliveryId: string,
): Promise<DeliveryOutcome> {
  if (!event.tenantId) return 'rejected'
  const occurredAt = new Date(event.occurredAt)
  if (Number.isNaN(occurredAt.getTime())) return 'rejected'

  let details = event.tenant
  if (!details) {
    // FR-020: the event did not say enough, so ask the platform with our own client credentials.
    const result: LookupResult = await lookUpTenant(deps, event.tenantId)
    await recordLookup(deps, { deliveryId, platformTenantId: event.tenantId, result })
    if (result.status === 'rejected') return 'rejected'
    // Not an answer: the lookup is `pending` and owns the retry from here (FR-021). The delivery is
    // processed — the inbox sweep must not also claim it.
    if (result.status === 'pending') return 'pending'
    details = { name: result.tenant.name, issuer: result.tenant.issuer }
  }

  return claim(
    deps.collections,
    event.tenantId,
    occurredAt,
    { name: details.name, issuer: details.issuer, integrated: true, state: 'active' },
    {},
  )
}

export async function applyTenantDeleted(
  deps: SyncDeps,
  event: TenantDeletedEvent,
): Promise<DeliveryOutcome> {
  if (!event.tenantId) return 'rejected'
  const occurredAt = new Date(event.occurredAt)
  if (Number.isNaN(occurredAt.getTime())) return 'rejected'

  return claim(
    deps.collections,
    event.tenantId,
    occurredAt,
    {
      state: 'deleted',
      deletedAt: occurredAt,
      purgeAfter: new Date(occurredAt.getTime() + PURGE_AFTER_DAYS * DAY_MS),
    },
    { name: event.tenantId, integrated: false },
  )
}

/** A resolved lookup applying the tenant it found, for the retry of FR-021. */
export async function applyLookedUpTenant(
  deps: SyncDeps,
  tenantId: string,
  details: { name: string; issuer: string },
  occurredAt: Date,
): Promise<DeliveryOutcome> {
  return claim(
    deps.collections,
    tenantId,
    occurredAt,
    { name: details.name, issuer: details.issuer, integrated: true, state: 'active' },
    {},
  )
}

export type PurgeSummary = {
  tenants: string[]
  users: number
  tasks: number
  devices: number
  sessions: number
}

/**
 * Remove a deleted tenant's data once the clock has passed `purgeAfter` (FR-022).
 *
 * The tenant document itself stays: it is the tombstone, and removing it would let a late
 * `tenant.created` revive the tenant, which is the case research R-9 chose the tombstone to prevent.
 * `local` and every active tenant are untouched, because the filter is `state: 'deleted'`.
 */
export async function purgeDeletedTenants(
  collections: Collections,
  clock: Clock,
): Promise<PurgeSummary> {
  const now = clock.now()
  const due = await collections.tenants
    .find({ state: 'deleted', purgeAfter: { $lte: now } })
    .toArray()

  const summary: PurgeSummary = { tenants: [], users: 0, tasks: 0, devices: 0, sessions: 0 }
  for (const tenant of due) {
    summary.users += (await collections.users.deleteMany({ tenantId: tenant._id })).deletedCount
    summary.tasks += (await collections.tasks.deleteMany({ tenantId: tenant._id })).deletedCount
    summary.devices += (await collections.devices.deleteMany({ tenantId: tenant._id })).deletedCount
    summary.sessions += (
      await collections.sessions.deleteMany({ tenantId: tenant._id })
    ).deletedCount
    await collections.deviceSyncStates.deleteOne({ _id: tenant._id })
    await collections.tenants.updateOne({ _id: tenant._id }, { $set: { purgedAt: now } })
    summary.tenants.push(tenant._id)
  }
  return summary
}
