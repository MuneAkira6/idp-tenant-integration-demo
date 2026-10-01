/**
 * Looking a tenant up on the platform when an event did not carry its details (T041; FR-020, FR-021;
 * research R-9).
 *
 * The two failure kinds are **different branches with different outcomes** (checklist L9):
 *
 *   refused (a 4xx: the platform said no)  -> status `rejected`, never retried
 *   unreachable (no answer, or a 5xx)      -> status `pending`, retried hourly, `expired` after 30 days
 *
 * A pending lookup is owned by `nextAttemptAt` in this collection, and by nothing else. The delivery
 * that caused it is marked processed with `outcome: 'pending'`, so the inbox sweep of FR-017 — which
 * looks for deliveries with no `processedAt` — does not also claim it.
 */

import type { PlatformTenant } from '@acme/contracts'
import { type Clock, DAY_MS } from '../clock.ts'
import type { Config } from '../config.ts'
import type { Collections, TenantLookupDoc } from '../db.ts'
import { callPlatform, platformToken } from '../platform-client.ts'

/** How long a lookup that cannot reach the platform is kept before it expires (FR-021). */
export const LOOKUP_EXPIRY_DAYS = 30

export type LookupDeps = { config: Config; collections: Collections; clock: Clock }

export type LookupResult =
  | { status: 'resolved'; tenant: PlatformTenant }
  | { status: 'rejected'; detail: string }
  | { status: 'pending'; detail: string }

export async function lookUpTenant(
  deps: LookupDeps,
  platformTenantId: string,
): Promise<LookupResult> {
  const token = await platformToken(deps.config)
  const response = await callPlatform<PlatformTenant>(
    deps.config,
    `/tenants/${encodeURIComponent(platformTenantId)}`,
    token,
  )
  if (response.kind === 'ok') return { status: 'resolved', tenant: response.value }
  // The platform answered no. Nothing will change by asking again (FR-021).
  if (response.kind === 'refused') {
    return { status: 'rejected', detail: `the platform refused the lookup (${response.status})` }
  }
  // The platform said nothing at all. Ask again later.
  return { status: 'pending', detail: response.detail || 'the platform could not be reached' }
}

/** Record a lookup that has not resolved, so that the retry owns it from now on. */
export async function recordLookup(
  deps: LookupDeps,
  input: { deliveryId: string; platformTenantId: string; result: LookupResult },
): Promise<void> {
  if (input.result.status === 'resolved') return
  const now = deps.clock.now()
  await deps.collections.tenantLookups.updateOne(
    { deliveryId: input.deliveryId, platformTenantId: input.platformTenantId },
    {
      $set: {
        status: input.result.status,
        lastError: input.result.detail,
        ...(input.result.status === 'pending'
          ? { nextAttemptAt: new Date(now.getTime() + deps.config.intervals.lookupRetryMs) }
          : {}),
      },
      $inc: { attempts: 1 },
      $setOnInsert: { expiresAt: new Date(now.getTime() + LOOKUP_EXPIRY_DAYS * DAY_MS) },
    },
    { upsert: true },
  )
}

export type RetrySummary = {
  retried: number
  resolved: number
  expired: number
  stillPending: number
}

/**
 * The hourly retry (FR-021). A pending lookup past its `expiresAt` becomes `expired` and is not
 * attempted again; one that is due is attempted, and a refusal now marks it `rejected`.
 */
export async function retryPendingLookups(
  deps: LookupDeps,
  apply: (lookup: TenantLookupDoc, tenant: PlatformTenant) => Promise<void>,
): Promise<RetrySummary> {
  const now = deps.clock.now()
  const summary: RetrySummary = { retried: 0, resolved: 0, expired: 0, stillPending: 0 }
  const pending = await deps.collections.tenantLookups.find({ status: 'pending' }).toArray()

  for (const lookup of pending) {
    if (lookup.expiresAt.getTime() <= now.getTime()) {
      await deps.collections.tenantLookups.updateOne(
        { _id: lookup._id },
        { $set: { status: 'expired' }, $unset: { nextAttemptAt: '' } },
      )
      summary.expired += 1
      continue
    }
    if (lookup.nextAttemptAt && lookup.nextAttemptAt.getTime() > now.getTime()) continue

    summary.retried += 1
    const result = await lookUpTenant(deps, lookup.platformTenantId)
    if (result.status === 'resolved') {
      await apply(lookup, result.tenant)
      await deps.collections.tenantLookups.updateOne(
        { _id: lookup._id },
        { $set: { status: 'resolved' }, $inc: { attempts: 1 }, $unset: { nextAttemptAt: '' } },
      )
      summary.resolved += 1
      continue
    }
    await recordLookup(deps, {
      deliveryId: lookup.deliveryId,
      platformTenantId: lookup.platformTenantId,
      result,
    })
    if (result.status === 'pending') summary.stillPending += 1
  }
  return summary
}
