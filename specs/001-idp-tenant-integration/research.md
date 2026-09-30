# Research: Sign-in and tenant integration with the group platform

Phase 0 of [plan.md](plan.md). Each entry: the decision, why, and what else was considered. Facts
about external software are measured before anything depends on them (constitution IV); where a fact
can only be measured once the stack runs, the entry says which goal measures it.

## R-1 The platform's IdP stand-in: Keycloak 26.7.4, one realm per tenant

- **Decision**: realms `tenant-a` and `tenant-b` (the two integrated tenants) and `platform` (the
  platform's own service identities). In each tenant realm, a confidential client `acme-tasks` (PKCE
  required, redirect `http://localhost:18400/auth/callback`) and a second client `acme-reports` whose
  client roles show the union across clients. In `platform`, a service-account client
  `acme-tasks-sync` for the client-credentials calls to the tenant API. Realms are imported from JSON at
  start-up.
- **Rationale**: a realm per tenant makes the issuer name the tenant, which is exactly how the
  application must derive it (FR-005); client roles land in `resource_access`; service accounts give
  client credentials; JSON import makes the stack reproducible.
- **Alternatives**: one realm with a tenant claim (the issuer would not identify the tenant, and a
  claim is easier to get wrong); `oidc-provider` embedded in the mock (lighter, but less recognisable
  and more code to own). Kept as the fallback if the Keycloak image cannot be pulled.

## R-2 What Keycloak actually puts in tokens — measured in G0, not assumed

- **Decision**: G0 obtains a token for a seeded user of each tenant realm and records, with the command
  and the decoded payload: `iss`, `aud`, `azp`, `resource_access`, `exp`, and the JWKS `kid`s. G1 and G2
  depend on those recorded shapes, not on documentation. If `aud` does not contain `acme-tasks-api`,
  an audience mapper is added to the realm JSON and measured again.
- **Rationale**: "not declared" is not "absent" (constitution IV); the case study found a response with
  twice the fields its specification listed.
- **Alternatives**: writing the verifier against the documentation, which is how the mismatch would be
  found in production instead.

## R-3 The sign-in flow: `openid-client`

- **Decision**: discovery per tenant issuer, authorisation code with PKCE (S256), `state` and the code
  verifier kept in a short-lived, HttpOnly, SameSite=Lax cookie bound to the browser that started the
  flow, refresh through the same library.
- **Rationale**: the library implements the flow and its checks (state, nonce, PKCE) that a hand-rolled
  version would have to re-derive; the case study's properties are about behaviour, not a library.
- **Alternatives**: a hand-written token exchange with `fetch` (more code, more to get wrong); Passport
  (an extra framework layer for two routes).

## R-4 Bearer verification: `jose` with one remote JWKS per issuer

- **Decision**: `createRemoteJWKSet` per configured issuer; `jwtVerify` checks signature, `iss`, `aud`
  and `exp` with a 30 s clock tolerance; an unknown `kid` triggers one refetch (key rotation).
- **Rationale**: exactly the checks FR-008 names, with rotation handled.
- **Alternatives**: token introspection on every call (a network round trip per request, and the
  platform may not offer it).

## R-5 The application session: server-side, opaque cookie, tokens encrypted at rest

- **Decision** (from the clarification of 2026-09-30): a `sessions` collection keyed by a random 32-byte
  id sent as an HttpOnly, SameSite=Lax cookie; the platform's refresh and access tokens stored with
  AES-256-GCM under a key from the environment. A refresh that the platform refuses (`invalid_grant`)
  ends the session; a network error or a 5xx keeps it and schedules a retry.
- **Rationale**: logout, expiry and refresh live in one place; nothing downstream learns about the
  platform (constitution VI).
- **Alternatives**: a signed stateless cookie (cannot be revoked on the server); forwarding the
  platform token to the browser (a second kind of session).

## R-6 Webhook signing: HMAC-SHA256 over timestamp and raw body, one secret per event type

- **Decision**: headers `X-Platform-Delivery` (delivery id), `X-Platform-Event` (type),
  `X-Platform-Timestamp` (Unix seconds) and `X-Platform-Signature` (`sha256=<hex>` of
  `${timestamp}.${rawBody}`), with one secret per event type from the environment; the raw bytes are
  captured before JSON parsing; comparison with `timingSafeEqual`; a timestamp more than 300 s from the
  application's clock is refused.
- **Rationale**: FR-014 and FR-015; signing the timestamp with the body makes an old delivery useless.
- **Alternatives**: one secret for all events (one leak compromises every event); signing the parsed
  JSON (a re-serialisation can change the bytes).

## R-7 The inbox: store first, acknowledge, process asynchronously

- **Decision**: a `deliveries` collection with a unique index on `deliveryId` and a TTL index on
  `expiresAt` (30 days); a duplicate key answers 200 without a second effect; an in-process queue
  processes new deliveries, and a sweep on start-up and every hour picks up the unprocessed ones.
- **Rationale**: acknowledging after storing, not after processing, keeps the platform from timing out
  and re-delivering (the case study's failure mode).
- **Alternatives**: processing inside the request (timeouts, duplicates); an external queue (more
  infrastructure than the demo needs).

## R-8 Exactly one user on concurrent first contact

- **Decision**: a partial unique index on `users` over `{ tenantId, platformSubject }` where
  `platformSubject` exists; insert, and on duplicate key read the winner back. The control: the same
  eight-way test with the index dropped must produce more than one user.
- **Rationale**: FR-010 and SC-002; the case study measured five duplicates without the index and zero
  with it — a guard is only trusted once its absence has been seen.
- **Alternatives**: a lock (slower, and a lock that fails open is invisible).

## R-9 Tenant sync: claims, tombstones, and two kinds of lookup failure

- **Decision**: `tenants` holds `state` (`active` or `deleted`), `deletedAt`, `purgeAfter` and the
  platform time of the last applied change; an event applies only if it is newer than the last applied
  change (so a late "created" cannot revive a deleted tenant). A lookup uses a client-credentials token
  from the `platform` realm: a 4xx from the tenant API marks the event `rejected`; a network error or a
  5xx keeps it `pending`, retried hourly, expiring after 30 days.
- **Rationale**: FR-019 to FR-022 and the clarification on deleted tenants.
- **Alternatives**: processing events strictly in arrival order (breaks on reordering); hard deletion
  (a late "created" revives the tenant).

## R-10 Playwright pinned at 1.62.1

- **Decision**: `@playwright/test` 1.62.1, browsers in a directory of their own
  (`PLAYWRIGHT_BROWSERS_PATH`).
- **Rationale**: measured on the implementation host on 2026-09-30: 1.63.0 answers
  `Playwright does not support chromium on ubuntu20.04-x64`; 1.62.1 installs Chromium and opens a
  headless page in about 2 s.
- **Alternatives**: the official Playwright image (works — measured: 2.51 GB, Node v24.20.0 — but adds
  user-id, home-directory and proxy plumbing to an unattended run).

## R-11 Time: one injectable clock

- **Decision**: a `Clock` with `now()` and `every(ms, fn)`; production uses the real clock and the real
  intervals (hourly, 30 days); tests use a manual clock with `advance(ms)` and say so in the test.
- **Rationale**: the clarification of 2026-09-30 and FR-032.
- **Alternatives**: waiting for real hours in tests (the case study did it once; an unattended demo run
  would idle for an hour per timer); shortening the defaults (the demo would no longer show the real
  values).

## R-12 The web client: one gate, one registry, a two-stage loop guard

- **Decision**: React with Rsbuild and React Router. Every route that needs a user goes through one
  `AuthGate`; the visibility registry (its shape is a contract) answers, per tenant, which pages, tabs
  and sections are hidden and where the user lands, and answers "nothing hidden, the usual landing" for
  a tenant that is not integrated. The loop guard has two stages: a one-time marker per sign-in in
  session storage, and "a restart within 60 s of a completed sign-in" (the API reports when the session
  was created) ends on an error page.
- **Rationale**: FR-026 to FR-028; the case study found that an IdP that signs in silently can loop
  many times a minute without such a guard.
- **Alternatives**: conditions spread through the pages (the pattern the case study replaced).

## R-13 Subscriptions registered from the route table

- **Decision**: at start-up the API lists its own routes tagged as webhooks, builds the callback URLs
  from them and upserts one subscription per event type with the mock platform.
- **Rationale**: FR-018; a hand-maintained list of callback URLs drifts from the routes.
- **Alternatives**: static configuration.

## R-14 Device pull

- **Decision**: per integrated tenant, every hour and when the tenant is created, pages of 200 until an
  empty or short page; one `deviceSyncStates` document per tenant with `source`, `lastAttemptAt`,
  `lastSuccessAt` and `lastError`; off unless `DEVICE_PULL_ENABLED=true`.
- **Rationale**: FR-023 to FR-025.
- **Alternatives**: pulling on demand when a page opens (slow pages, and nothing to show when the
  platform is down).

## R-16 Dependency majors chosen by measurement under the supply-chain settings

- **Decision**: Rsbuild 2 (`@rsbuild/core` ^2, `@rsbuild/plugin-react` ^2), React Router 8, the MongoDB
  driver 7, with `strictDepBuilds: true` and an empty `allowBuilds`.
- **Rationale**: measured on the implementation host on 2026-09-30 with `minimumReleaseAge: 4320`: with
  Rsbuild 1 the install fails, `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: core-js@3.47.0`
  (`pnpm why core-js` → `@rsbuild/core@1.7.6`); with Rsbuild 2 the whole dependency set installs in
  8 s and nothing asks to run a build script (resolved: `@rsbuild/core 2.2.9`, `react-router 8.4.0`,
  `mongodb 7.6.0`, `fastify 5.12.5`, `openid-client 6.8.8`, `jose 6.2.12`, `react 19.3.0`).
- **Alternatives**: keeping Rsbuild 1 and declaring `core-js: false` in `allowBuilds` (also measured to
  work, but it widens the supply-chain settings for a package that is no longer needed).

## R-15 Ports, secrets and the stack

- **Decision**: API 18400, web 18401, mock platform 18402, MongoDB 18417, Keycloak 18480 (all measured
  free on the host); secrets only through the environment, with `.env.example` holding dummy values and
  the test setup generating fresh ones per run; `compose.yaml` runs Keycloak and MongoDB only.
- **Rationale**: tenancy on a shared host; no secret in the repository; fast restarts of the Node
  services under test.
- **Alternatives**: running everything in Compose (slower test cycles, harder to inject a clock).
