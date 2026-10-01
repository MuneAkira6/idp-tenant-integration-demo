/**
 * The inbox: what happens to a delivery after it has been acknowledged (T034; FR-016, FR-017;
 * research R-7).
 *
 * Processing never runs inside the request. `enqueue` starts it and returns at once, so the
 * acknowledgement cannot wait for it (checklist L8). Anything that was stored but not processed —
 * because the application stopped, or because processing threw — is picked up by the sweep, which
 * runs **on start-up** and then **every hour** (FR-017). The two are distinct: `start()` sweeps once
 * itself before it schedules anything.
 *
 * A delivery that fails during processing is left with `processedAt` unset, so the same sweep owns
 * it; nothing else needs to remember it.
 */

import type { TenantCreatedEvent, TenantDeletedEvent } from '@acme/contracts'
import { type DeliveryOutcome, EVENT_TYPES, type EventType } from '@acme/contracts'
import type { Clock } from '../clock.ts'
import type { Config } from '../config.ts'
import type { Collections, DeliveryDoc } from '../db.ts'
import { applyTenantCreated, applyTenantDeleted } from '../tenants/sync.ts'

export type DeliveryProcessor = (delivery: DeliveryDoc) => Promise<DeliveryOutcome>

export type Inbox = {
  /** Start processing this delivery, without waiting for it. */
  enqueue(deliveryId: string): void
  /** Process everything stored but not yet processed. Returns how many were processed. */
  sweep(): Promise<number>
  /**
   * The start-up sweep of FR-017, and only that. The hourly one belongs to the scheduler, which is
   * the one place recurring work is registered (`apps/api/src/scheduler.ts`, T063).
   */
  start(): Promise<void>
  stop(): void
  /** Resolves when nothing is being processed. Tests only. */
  idle(): Promise<void>
  /** How many sweeps have run, so a test can tell the start-up one from the hourly one. */
  sweeps(): number
}

export type InboxDeps = {
  config: Config
  collections: Collections
  clock: Clock
  /** Replaced by the slow processor of AC-19; production uses the one built here. */
  processor?: DeliveryProcessor
  /** the first device pull of FR-023, run when a `tenant.created` event is applied */
  onTenantCreated?: (tenantId: string) => Promise<void>
}

/** The effects of contracts/api.md, "Event types handled". */
export function defaultProcessor(deps: {
  config: Config
  collections: Collections
  clock: Clock
  /** run after a tenant is created, for the first device pull of FR-023 */
  onTenantCreated?: (tenantId: string) => Promise<void>
}): DeliveryProcessor {
  return async (delivery) => {
    if (!EVENT_TYPES.includes(delivery.eventType as EventType)) return 'ignored'
    if (delivery.eventType === 'tenant.created') {
      const event = delivery.body as TenantCreatedEvent
      const outcome = await applyTenantCreated(deps, event, delivery._id)
      // FR-023: a tenant that has just been created has its devices fetched at once, without
      // waiting for the hourly pull.
      if (outcome === 'applied' && deps.onTenantCreated) await deps.onTenantCreated(event.tenantId)
      return outcome
    }
    return applyTenantDeleted(deps, delivery.body as TenantDeletedEvent)
  }
}

export function createInbox(deps: InboxDeps): Inbox {
  const { collections, clock, config } = deps
  const processor =
    deps.processor ??
    defaultProcessor({
      config,
      collections,
      clock,
      ...(deps.onTenantCreated ? { onTenantCreated: deps.onTenantCreated } : {}),
    })
  const running = new Set<Promise<void>>()
  let sweepCount = 0

  async function processOne(delivery: DeliveryDoc): Promise<void> {
    let outcome: DeliveryOutcome
    try {
      outcome = await processor(delivery)
    } catch {
      // Left unprocessed on purpose: the next sweep owns it (FR-017).
      return
    }
    await collections.deliveries.updateOne(
      { _id: delivery._id },
      { $set: { processedAt: clock.now(), outcome } },
    )
  }

  function track(work: Promise<void>): void {
    const tracked = work.finally(() => {
      running.delete(tracked)
    })
    running.add(tracked)
  }

  async function sweep(): Promise<number> {
    sweepCount += 1
    const pending = await collections.deliveries.find({ processedAt: { $exists: false } }).toArray()
    for (const delivery of pending) await processOne(delivery)
    return pending.length
  }

  return {
    enqueue(deliveryId) {
      track(
        (async () => {
          const delivery = await collections.deliveries.findOne({ _id: deliveryId })
          if (delivery && !delivery.processedAt) await processOne(delivery)
        })(),
      )
    },
    sweep,
    async start() {
      // The start-up sweep itself (FR-017): it runs now, not at a tick. The hourly pick-up is the
      // scheduler's `inbox.sweep` job, so that all the recurring work can be read in one place.
      await sweep()
    },
    stop() {
      // Nothing of its own is scheduled any more; kept so callers need not know that.
    },
    async idle() {
      while (running.size > 0) await Promise.all([...running])
    },
    sweeps: () => sweepCount,
  }
}
