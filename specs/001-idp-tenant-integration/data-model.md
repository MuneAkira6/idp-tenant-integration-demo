# Data model: Sign-in and tenant integration with the group platform

Phase 1 of [plan.md](plan.md). MongoDB 7 collections of `apps/api`; field names are frozen with the
contracts in G0. Times are stored as `Date` in UTC; "the clock" is the injectable clock of research
R-11.

## tenants

| Field | Type | Notes |
|---|---|---|
| `_id` | string | the application's tenant id (`local`, `tenant-a`, `tenant-b`) |
| `name` | string | display name |
| `integrated` | boolean | the tenant-level integration flag; **default `false`** |
| `issuer` | string, optional | the platform issuer that names this tenant; required when `integrated` |
| `state` | `active` \| `deleted` | |
| `deletedAt` | Date, optional | set when a deletion is applied |
| `purgeAfter` | Date, optional | `deletedAt` + 30 days |
| `platformChangedAt` | Date, optional | the platform time of the last applied tenant event |

Indexes: unique on `issuer` (sparse).

State transitions: (none) → `active` on a created event; `active` → `deleted` on a deleted event;
`deleted` → purged (tenant data removed) when the clock passes `purgeAfter`. An event applies only if its
platform time is later than `platformChangedAt`; so a late created event never revives a deleted tenant.

## users

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `tenantId` | string | |
| `platformSubject` | string, optional | the platform's `sub`; only for users of integrated tenants |
| `email`, `name` | string | |
| `passwordHash` | string, optional | only for the tenant that is not integrated |
| `roles` | string[] | application roles: `admin`, `manager`, `member` (lowest) |
| `rolesWrittenAt` | Date, optional | changes only when the derived roles differ |

Indexes: **partial unique** on `{ tenantId, platformSubject }` where `platformSubject` exists (research
R-8); unique on `{ tenantId, email }`.

Role derivation: the union of the user's client roles across `acme-tasks` and `acme-reports` goes
through the mapping table in `packages/contracts`; the result replaces `roles` and is written only when
it differs; a role without a mapping yields `member` and a warning naming the role. For a request
authenticated by a platform token, the same derivation runs on that token in memory, and `roles` is not
written (FR-034).

## Permissions (not stored: a table in `packages/contracts`)

| Operation | Route | `member` | `manager` | `admin` |
|---|---|---|---|---|
| `tasks.read` | `GET /api/tasks` | yes | yes | yes |
| `tasks.create` | `POST /api/tasks` | yes | yes | yes |
| `devices.read` | `GET /api/devices` | no | yes | yes |
| `users.list` | `GET /api/users` | no | no | yes |

A principal's permissions are the union over its roles. The check runs once per request, after
authentication and before the handler; "no" answers 403 `forbidden` and changes nothing (FR-033). Every
query runs with the principal's `tenantId` (FR-035).

## sessions

| Field | Type | Notes |
|---|---|---|
| `_id` | string | random 32 bytes, base64url; the cookie's value |
| `tenantId`, `userId` | | |
| `kind` | `password` \| `platform` | how the session began; nothing downstream reads it |
| `createdAt`, `expiresAt` | Date | |
| `platform` | object, optional | `{ issuer, sid, refreshTokenEnc, accessTokenEnc, accessExpiresAt }`, tokens AES-256-GCM encrypted |
| `refreshRetryAt` | Date, optional | set when a refresh could not reach the platform |

Indexes: TTL on `expiresAt`.

## deliveries (the webhook inbox)

| Field | Type | Notes |
|---|---|---|
| `_id` | string | the delivery id (`X-Platform-Delivery`) |
| `eventType` | string | |
| `body` | object | the parsed payload, stored after the signature was verified over the raw bytes |
| `receivedAt` | Date | |
| `processedAt` | Date, optional | |
| `outcome` | `applied` \| `ignored` \| `rejected` \| `pending`, optional | |
| `expiresAt` | Date | `receivedAt` + 30 days |

Indexes: the `_id` uniqueness gives idempotency; TTL on `expiresAt`; `{ processedAt: 1 }` for the sweep.

State transitions: stored (unprocessed) → processed with an outcome. The sweep on start-up and every hour
processes whatever is still unprocessed.

## tenantLookups

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `deliveryId` | string | the event that needed the lookup |
| `platformTenantId` | string | |
| `status` | `pending` \| `resolved` \| `rejected` \| `expired` | |
| `attempts` | number | |
| `nextAttemptAt` | Date, optional | hourly while `pending` |
| `expiresAt` | Date | created + 30 days; a `pending` lookup past it becomes `expired` |
| `lastError` | string, optional | |

State transitions: `pending` → `resolved` (the platform answered) · `pending` → `rejected` (a 4xx: the
platform said no; not retried) · `pending` → `pending` (unreachable or a 5xx; retried hourly) ·
`pending` → `expired` (30 days passed).

## devices

| Field | Type | Notes |
|---|---|---|
| `_id` | string | `${tenantId}:${platformDeviceId}` |
| `tenantId`, `platformDeviceId`, `name`, `model` | | |
| `fetchedAt` | Date | the pull that last saw it |

## deviceSyncStates

| Field | Type | Notes |
|---|---|---|
| `_id` | string | the tenant id |
| `source` | string | the platform endpoint the list came from |
| `lastAttemptAt` | Date | |
| `lastSuccessAt` | Date, optional | **never changed by a failure** |
| `lastError` | string, optional | |

## subscriptions

| Field | Type | Notes |
|---|---|---|
| `_id` | string | the event type |
| `callbackUrl` | string | derived from the route table at start-up |
| `registeredAt` | Date | |

## Configuration defaults (constitution VI)

| Setting | Default | Effect when absent |
|---|---|---|
| `PLATFORM_ISSUERS` | empty | every platform token refused; platform sign-in unavailable |
| `WEBHOOK_SECRET_<EVENT>` | empty | every event of that type refused |
| `DEVICE_PULL_ENABLED` | `false` | no device pull runs |
| `tenants.integrated` | `false` | the tenant behaves as before |
| `TOKEN_ENC_KEY` | none | the API refuses to start the platform sign-in (fails closed) |
