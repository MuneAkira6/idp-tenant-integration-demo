/**
 * The platform's device API (T047, contracts/platform.md).
 *
 * `GET /tenants/:tenantId/devices?page=<n>&pageSize=200`. The seeded counts are the ones the contract
 * names — 450, 3 and 0 — so one tenant needs three pages, which is what quickstart Q12 measures.
 * `POST /__control/device-api` with `fail-on-page` makes exactly one page fail, for SC-006.
 */

import type { PlatformDevicePage } from '@acme/contracts'

/** tenant -> how many devices the platform holds for it (contracts/platform.md). */
export const DEVICE_COUNTS: Record<string, number> = {
  'tenant-a': 450,
  'tenant-b': 3,
  'tenant-c': 0,
}

export function devicePage(tenantId: string, page: number, pageSize: number): PlatformDevicePage {
  const total = DEVICE_COUNTS[tenantId] ?? 0
  const first = (page - 1) * pageSize
  const items = []
  for (let index = first; index < Math.min(first + pageSize, total); index += 1) {
    items.push({
      deviceId: `${tenantId}-device-${String(index + 1).padStart(4, '0')}`,
      name: `Device ${index + 1}`,
      model: index % 2 === 0 ? 'AcmeBook 13' : 'AcmePhone 5',
    })
  }
  return { items, page, pageSize, total }
}
