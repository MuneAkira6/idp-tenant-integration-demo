/**
 * The device pull (T046; FR-023 to FR-025; research R-14).
 *
 * The platform sends no device events, so each integrated tenant's devices are fetched every hour and
 * when the tenant is created, page by page until a short or empty page.
 *
 * `lastSuccessAt` is written in exactly one place — the success branch — and a failure writes only
 * `lastAttemptAt` and `lastError` (FR-024, checklist L10). Pages that did arrive before a failure are
 * kept: losing them would make a partial failure worse than no pull at all.
 */

import type { PlatformDevicePage } from '@acme/contracts'
import type { Clock } from '../clock.ts'
import { type Config, devicePullAvailable } from '../config.ts'
import type { Collections, DeviceDoc } from '../db.ts'
import { callPlatform, platformToken } from '../platform-client.ts'

export type PullDeps = { config: Config; collections: Collections; clock: Clock }

export type PullResult =
  | { status: 'off' }
  | { status: 'succeeded'; devices: number; pages: number; source: string }
  | { status: 'failed'; devices: number; pages: number; source: string; error: string }

function sourceOf(config: Config, tenantId: string): string {
  return `${config.platform.baseUrl}/tenants/${tenantId}/devices`
}

export async function pullDevices(deps: PullDeps, tenantId: string): Promise<PullResult> {
  const { config, collections, clock } = deps

  // FR-025, before anything else: with the pull switched off, no pull runs.
  if (!devicePullAvailable(config)) return { status: 'off' }

  const source = sourceOf(config, tenantId)
  const attemptAt = clock.now()
  const token = await platformToken(config)
  let stored = 0
  let pages = 0

  for (let page = 1; ; page += 1) {
    const response = await callPlatform<PlatformDevicePage>(
      config,
      `/tenants/${encodeURIComponent(tenantId)}/devices?page=${page}&pageSize=${config.devicePull.pageSize}`,
      token,
    )
    if (response.kind !== 'ok') {
      // A failure. Whatever arrived before it stays; `lastSuccessAt` is not touched here.
      await collections.deviceSyncStates.updateOne(
        { _id: tenantId },
        {
          $set: {
            source,
            lastAttemptAt: attemptAt,
            lastError: `page ${page}: ${response.kind} (${response.status})`,
          },
        },
        { upsert: true },
      )
      return {
        status: 'failed',
        devices: stored,
        pages,
        source,
        error: `page ${page}: ${response.kind} (${response.status})`,
      }
    }

    pages += 1
    for (const item of response.value.items) {
      const document: DeviceDoc = {
        _id: `${tenantId}:${item.deviceId}`,
        tenantId,
        platformDeviceId: item.deviceId,
        name: item.name,
        model: item.model,
        fetchedAt: attemptAt,
      }
      await collections.devices.updateOne(
        { _id: document._id },
        { $set: document },
        { upsert: true },
      )
      stored += 1
    }

    // A short or empty page is the last one (research R-14).
    if (response.value.items.length < config.devicePull.pageSize) break
  }

  const succeededAt = clock.now()
  await collections.deviceSyncStates.updateOne(
    { _id: tenantId },
    {
      $set: { source, lastAttemptAt: attemptAt, lastSuccessAt: succeededAt },
      $unset: { lastError: '' },
    },
    { upsert: true },
  )
  return { status: 'succeeded', devices: stored, pages, source }
}

/** Every integrated tenant that is still active (FR-023). A tombstone is not pulled for. */
export async function pullAllTenants(deps: PullDeps): Promise<Record<string, PullResult>> {
  if (!devicePullAvailable(deps.config)) return {}
  const tenants = await deps.collections.tenants
    .find({ integrated: true, state: 'active' })
    .toArray()
  const results: Record<string, PullResult> = {}
  for (const tenant of tenants) results[tenant._id] = await pullDevices(deps, tenant._id)
  return results
}
