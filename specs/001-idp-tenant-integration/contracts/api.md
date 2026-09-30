# Contract: the Acme Tasks API (`apps/api`, port 18400)

Frozen in G0 as `packages/contracts` (types) and rewritten as AS-BUILT in G6. Every route names the
requirements it serves. Error bodies are `{"error":"<code>","message":"<text>"}`.

## Sign-in and session

| Route | Behaviour | FR |
|---|---|---|
| `GET /auth/login?tenant=<id>` | for an integrated tenant: redirects to its issuer with code + PKCE (S256), `state` and the verifier in a short-lived HttpOnly SameSite=Lax cookie; for a tenant that is not integrated: 404 `not_integrated` | FR-001, FR-029 |
| `GET /auth/callback` | exchanges the code; refuses a `state` or verifier that does not match this browser's cookie (400 `state_mismatch`); derives the tenant from the ID token's `iss` only; creates the server-side session; sets the session cookie; redirects to the landing page the registry names | FR-001–FR-005 |
| `POST /auth/password` | `{tenant, email, password}` for the tenant that is not integrated; unchanged behaviour; creates a `password` session | FR-031 |
| `POST /auth/logout` | ends the application session; for a `platform` session also ends the platform session (RP-initiated logout) | FR-006 |
| `GET /auth/session` | `{signedIn, tenantId, userId, roles, integrated, sessionCreatedAt, landing}` — the web client's source for the gate and the loop guard | FR-026, FR-028 |

Refresh (inside the API, not a route): a refused refresh (`invalid_grant`) ends the session; a network
error or a 5xx keeps it and sets `refreshRetryAt`.

## The existing API (unchanged routes, one more way in)

| Route | Behaviour | FR |
|---|---|---|
| `GET /api/tasks` | the signed-in user's tasks | — (existing) |
| `POST /api/tasks` | create a task | — (existing) |
| `GET /api/devices` | the tenant's devices and its `deviceSyncState` | FR-023, FR-024 |

Authentication order for every `/api/*` route: an application session decides when present; only
without one is `Authorization: Bearer <platform token>` read, verified (signature, `iss`, `aud`, `exp`)
and turned into an in-memory principal. No session and no write are created by a Bearer request, except
the one-time creation of a user seen for the first time (partial unique index; duplicate key → read
back). An expired, wrongly addressed or unknown-issuer token: 401 `invalid_token`. With no issuer
configured, every token: 401. (FR-007–FR-010, FR-029)

## Webhooks

| Route | Behaviour | FR |
|---|---|---|
| `POST /webhooks/platform` | tagged as a webhook route; verifies `X-Platform-Signature` over `${X-Platform-Timestamp}.${raw body}` with the secret of `X-Platform-Event` (constant time); 401 `bad_signature` or `stale_timestamp` (more than 300 s off); stores the delivery under `X-Platform-Delivery` and answers 200 before processing; a repeated delivery id answers 200 with no second effect; an unknown event type is stored as `ignored` and answers 200; with no secret for the type: 401 `not_configured` | FR-014–FR-017, FR-029 |

## Event types handled

| Type | Effect | FR |
|---|---|---|
| `tenant.created` | create the tenant once (claim by platform time); start its first device pull; if the payload lacks the tenant's details, look it up | FR-019, FR-020, FR-023 |
| `tenant.deleted` | tombstone: `state=deleted`, refuse sign-in and API calls, `purgeAfter` = +30 days | FR-019, FR-022 |

## Start-up

On start-up the API upserts one subscription per event type with the mock platform, the callback URL
built from its own route table (routes tagged as webhooks), and runs the inbox sweep. (FR-017, FR-018)
