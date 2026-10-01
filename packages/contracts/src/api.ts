/**
 * The Acme Tasks API (apps/api, port 18400): error codes and the shapes of the responses.
 *
 * FROZEN in G0 on 2026-09-30 (constitution VII); rewritten as AS-BUILT in G6.
 * Source: contracts/api.md, data-model.md.
 */

import type { ApplicationRole } from './roles.ts'

/** Every error body of the API is this shape (contracts/api.md). */
export type ApiError = { error: string; message: string }

/** The error codes the contract names, so that no route invents a synonym. */
export const API_ERRORS = {
  /** `GET /auth/login` for a tenant that is not integrated, and every platform path while unconfigured */
  notIntegrated: 'not_integrated',
  /** `GET /auth/callback` when `state` or the verifier does not match this browser's cookie */
  stateMismatch: 'state_mismatch',
  /** a platform token that is expired, wrongly addressed or from an unknown issuer */
  invalidToken: 'invalid_token',
  /** no application session and no usable token */
  unauthenticated: 'unauthenticated',
  /** authenticated, but the permission table says no (FR-033) */
  forbidden: 'forbidden',
  /** the signature does not match the raw body (FR-014) */
  badSignature: 'bad_signature',
  /** the delivery's timestamp is more than TIMESTAMP_WINDOW_SECONDS from our clock (FR-015) */
  staleTimestamp: 'stale_timestamp',
  /** no signing secret for this event type, or no issuer configured (FR-029) */
  notConfigured: 'not_configured',
  /** the tenant is a tombstone (FR-022) */
  tenantDeleted: 'tenant_deleted',
  notFound: 'not_found',
  badRequest: 'bad_request',
} as const

export type ApiErrorCode = (typeof API_ERRORS)[keyof typeof API_ERRORS]

/** `GET /auth/session` — the web client's only source for the gate and the loop guard. */
export type SessionInfo = {
  signedIn: boolean
  tenantId?: string
  userId?: string
  roles?: ApplicationRole[]
  /** the tenant's integration flag; `false` also when nothing is configured (FR-030) */
  integrated?: boolean
  /** when this session was created — stage 2 of the loop guard compares it with now (FR-028) */
  sessionCreatedAt?: string
  /** where a completed sign-in lands, from the visibility registry (FR-026) */
  landing?: string
}

/** `POST /auth/password` — the tenant that is not integrated, unchanged (FR-031). */
export type PasswordSignInRequest = {
  tenant: string
  email: string
  password: string
}

export type Task = {
  taskId: string
  tenantId: string
  userId: string
  title: string
  done: boolean
  createdAt: string
}

export type TasksResponse = { tasks: Task[] }

export type CreateTaskRequest = { title: string }

export type Device = {
  deviceId: string
  name: string
  model: string
  fetchedAt: string
}

/** Per tenant: where the list came from and how the last pull went (FR-024). */
export type DeviceSyncState = {
  source: string
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
}

export type DevicesResponse = { devices: Device[]; syncState: DeviceSyncState | null }

/** `GET /api/users` — `admin` only, and only the caller's own tenant (FR-033, FR-035). */
export type UsersResponse = {
  users: Array<{ userId: string; email: string; name: string; roles: ApplicationRole[] }>
}

/** The ports of the three Node services (research R-15). */
export const PORTS = { api: 18400, web: 18401, mockPlatform: 18402 } as const

/** The name of the opaque session cookie (FR-003: opaque, never a JWT). */
export const SESSION_COOKIE = 'acme_session'

/** The short-lived cookie that binds a sign-in to the browser that started it (FR-001). */
export const FLOW_COOKIE = 'acme_auth_flow'

/** The route that receives platform events; tagged as a webhook so T035 can derive it (FR-018). */
export const WEBHOOK_ROUTE = '/webhooks/platform'

/** The tag that marks a webhook route in the API's route table (research R-13). */
export const WEBHOOK_ROUTE_TAG = 'webhook'
