# Contract: the platform stand-in (`apps/mock-platform`, port 18402)

**AS-BUILT, 2026-09-30.** The mock plays the group platform's event delivery, tenant API and device
API; Keycloak plays its IdP (research R-1). Frozen in G0 as part of `packages/contracts`, so the mock
and the API share one set of shapes.

**AS-BUILT** — the mock imports only from `packages/contracts` and never from `apps/api`. It builds its
signatures from the frozen `signaturePayload` and `SIGNATURE_PREFIX` with its own HMAC, so the two
sides agreeing is an observation about the contract rather than an artefact of a shared
implementation.

## Events it sends

Every delivery is `POST <callbackUrl>` with a JSON body and these headers:

| Header | Content |
|---|---|
| `X-Platform-Delivery` | a unique id per delivery; a re-delivery repeats it |
| `X-Platform-Event` | `tenant.created` or `tenant.deleted` |
| `X-Platform-Timestamp` | Unix seconds at sending time |
| `X-Platform-Signature` | `sha256=` + hex HMAC-SHA256 of `${timestamp}.${raw body}` with the secret of that event type |

Bodies:

```json
{ "tenantId": "tenant-c", "occurredAt": "2026-09-30T10:00:00Z", "tenant": { "name": "Tenant C", "issuer": "http://localhost:18480/realms/tenant-c" } }
{ "tenantId": "tenant-c", "occurredAt": "2026-09-30T11:00:00Z" }
```

`tenant` may be absent from `tenant.created`: the API must then look the tenant up.

## Test controls (only for the tests)

| Route | Effect |
|---|---|
| `POST /__control/deliver` | `{eventType, body, deliveryId?, timestamp?, signWith?}` — deliver one event now to every subscription of its type; `timestamp` and `signWith` let a test send a stale or badly signed delivery |
| `POST /__control/redeliver/:deliveryId` | send the same delivery again, same id |
| `POST /__control/tenant-api` | `{mode: "normal" \| "refuse" \| "unreachable"}` — make the tenant API answer, answer 403, or drop the connection |
| `POST /__control/device-api` | `{mode: "normal" \| "fail-on-page", page?}` — make a page fail |
| `GET /__control/log` | what was sent and received, for evidence |

## Tenant API

`GET /tenants/:tenantId` — requires `Authorization: Bearer <token>` from the `platform` realm's
`acme-tasks-sync` client (client credentials), verified by the mock against that realm's JWKS.
200 `{tenantId, name, issuer}`; 403 when refused; 404 when unknown.

**AS-BUILT** — what the mock checks in that token is `azp` and the audience, not a role: facts.md F15
measured that a service-account token's `resource_access` holds only Keycloak's own `account` roles,
so there is nothing role-shaped to check. `unreachable` is produced by destroying the connection, so
the caller sees a transport failure and not a status code — which is what lets FR-021 tell "the
platform said no" from "the platform said nothing".

## Device API

`GET /tenants/:tenantId/devices?page=<n>&pageSize=200` — same authentication. 200
`{items:[{deviceId, name, model}], page, pageSize, total}`. The seeded tenants have 450, 3 and 0 devices,
so one tenant needs three pages.

**AS-BUILT** — the counts are `tenant-a` 450, `tenant-b` 3 and `tenant-c` 0, and any other tenant is 0.
A pull stops at a short or empty page. `fail-on-page` answers 500 for exactly the page named, which is
an unreachable answer rather than a refusal, so the pull records `lastError` and `lastAttemptAt` and
keeps `lastSuccessAt` (FR-024).

## Subscriptions

`PUT /subscriptions/:eventType` `{callbackUrl}` — upsert; `GET /subscriptions` lists them.
