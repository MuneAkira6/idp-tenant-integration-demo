/**
 * The platform stand-in (apps/mock-platform, port 18402): tenant API, device API, subscriptions and
 * the test controls.
 *
 * FROZEN in G0 on 2026-09-30 (constitution VII); rewritten as AS-BUILT in G6.
 * Source: contracts/platform.md, research R-9, R-13, R-14.
 */

import type { EventType } from './events.ts'

/** `GET /tenants/:tenantId` (contracts/platform.md). */
export type PlatformTenant = { tenantId: string; name: string; issuer: string }

/** `GET /tenants/:tenantId/devices?page=<n>&pageSize=200`. */
export type PlatformDevicePage = {
  items: Array<{ deviceId: string; name: string; model: string }>
  page: number
  pageSize: number
  total: number
}

/** The page size of a device pull (research R-14). */
export const DEVICE_PAGE_SIZE = 200

/** `PUT /subscriptions/:eventType` and `GET /subscriptions`. */
export type Subscription = { eventType: EventType; callbackUrl: string; registeredAt: string }

export type SubscriptionsResponse = { subscriptions: Subscription[] }

/** `POST /__control/tenant-api` — how the tenant API behaves, for the two failure kinds of FR-021. */
export const TENANT_API_MODES = ['normal', 'refuse', 'unreachable'] as const

export type TenantApiMode = (typeof TENANT_API_MODES)[number]

/** `POST /__control/device-api` — `fail-on-page` makes one page fail (SC-006). */
export const DEVICE_API_MODES = ['normal', 'fail-on-page'] as const

export type DeviceApiMode = (typeof DEVICE_API_MODES)[number]

/** `POST /__control/deliver` — deliver one event now to every subscription of its type. */
export type DeliverControlRequest = {
  eventType: string
  body: unknown
  deliveryId?: string
  /** Unix seconds; a test sends an old one to exercise FR-015 */
  timestamp?: number
  /** sign with this secret instead of the configured one, to exercise FR-014 */
  signWith?: string
}

export type DeliverControlResponse = {
  deliveryId: string
  delivered: Array<{ callbackUrl: string; status: number }>
}

/** `GET /__control/log` — what the mock sent and what it received back (checklist M8). */
export type ControlLogEntry = {
  at: string
  deliveryId: string
  eventType: string
  callbackUrl: string
  status: number
  signed: boolean
  timestamp: number
}

export type ControlLogResponse = { entries: ControlLogEntry[] }

/** The control routes, named once so the tests and the mock cannot drift apart. */
export const CONTROL_ROUTES = {
  deliver: '/__control/deliver',
  redeliver: '/__control/redeliver',
  tenantApi: '/__control/tenant-api',
  deviceApi: '/__control/device-api',
  log: '/__control/log',
  reset: '/__control/reset',
} as const
