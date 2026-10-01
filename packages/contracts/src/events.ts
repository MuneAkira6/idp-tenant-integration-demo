/**
 * The platform's signed events: headers, signature input, event types and bodies.
 *
 * FROZEN in G0 on 2026-09-30 (constitution VII); rewritten as AS-BUILT in G6.
 * Source: contracts/platform.md, contracts/api.md ("Webhooks", "Event types handled"), research R-6
 * and R-7, FR-014 to FR-018.
 */

/** The headers of every delivery (contracts/platform.md). Lower case: Fastify normalises them. */
export const EVENT_HEADERS = {
  delivery: 'x-platform-delivery',
  event: 'x-platform-event',
  timestamp: 'x-platform-timestamp',
  signature: 'x-platform-signature',
} as const

/** The event types the application handles. An unknown type is stored as `ignored` and answered 200. */
export const EVENT_TYPES = ['tenant.created', 'tenant.deleted'] as const

export type EventType = (typeof EVENT_TYPES)[number]

/** The environment variable that holds the signing secret of one event type (FR-014, FR-029). */
export function webhookSecretEnvName(eventType: string): string {
  return `WEBHOOK_SECRET_${eventType.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
}

/** The bytes that are signed: `${timestamp}.${raw body}` (research R-6). */
export function signaturePayload(timestamp: string, rawBody: string): string {
  return `${timestamp}.${rawBody}`
}

/** The prefix of `X-Platform-Signature`; the rest is the hex HMAC-SHA256. */
export const SIGNATURE_PREFIX = 'sha256='

/** How far a delivery's timestamp may be from the receiver's clock, in seconds (FR-015). */
export const TIMESTAMP_WINDOW_SECONDS = 300

/** How long a delivery id is remembered, in days (FR-016); the `deliveries` TTL index. */
export const DELIVERY_RETENTION_DAYS = 30

export type TenantCreatedEvent = {
  tenantId: string
  occurredAt: string
  /** absent when the platform did not include the details: the API must look the tenant up (FR-020) */
  tenant?: { name: string; issuer: string }
}

export type TenantDeletedEvent = {
  tenantId: string
  occurredAt: string
}

export type PlatformEventBody = TenantCreatedEvent | TenantDeletedEvent

/** What the inbox recorded about a delivery once it was processed (data-model.md, `deliveries`). */
export const DELIVERY_OUTCOMES = ['applied', 'ignored', 'rejected', 'pending'] as const

export type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number]
