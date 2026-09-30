# Research: Sign-in and tenant integration with the group platform

Phase 0 of [plan.md](plan.md), kept as the ledger of the decisions. Form: the ledger entry of
spec-driven-dev-playbook (`templates/ledger-entry.md`): one decision per entry under a stable id, with
who decided and when, what was decided and why, what was not taken, the facts it rests on and what
would change it. An entry is never rewritten to a new decision: a new entry is added, and the last
entry on a subject is the current state. Each entry stays within 40 lines.

"Decided" names who decided: **plan** means drafted by the agent in the plan phase and accepted by the
author with the goal pack; **the author (Cn)** means a human decision on question Cn of the launch
brief. Facts are those of [facts.md](facts.md) and the launch brief (F1, F2).

## R-1 The platform's IdP stand-in: Keycloak 26.7.4, one realm per tenant

- **Decided**: 2026-09-30, plan
- **Subject**: which software plays the platform's IdP
- **Decision**: realms `tenant-a` and `tenant-b` (the two integrated tenants) and `platform` (the
  platform's own service identities). In each tenant realm, a confidential client `acme-tasks` (PKCE
  required, redirect `http://localhost:18400/auth/callback`) and a second client `acme-reports` whose
  client roles show the union across clients. In `platform`, a service-account client
  `acme-tasks-sync` for the client-credentials calls to the tenant API. Realms are imported from JSON at
  start-up.
- **Rationale**: a realm per tenant makes the issuer name the tenant, which is exactly how the
  application must derive it (FR-005); client roles land in `resource_access`; service accounts give
  client credentials; JSON import makes the stack reproducible.
- **Alternatives not taken**: one realm with a tenant claim (the issuer would not identify the tenant,
  and a claim is easier to get wrong); `oidc-provider` embedded in the mock (lighter, but less
  recognisable and more code to own).
- **Facts relied on**: F2, F4
- **Would change if**: the Keycloak image could not be started on the host; then `oidc-provider`, and
  the deviation is recorded.

## R-2 What Keycloak actually puts in tokens — measured in G0, not assumed

- **Decided**: 2026-09-30, plan
- **Subject**: where the verifier's expectations about tokens come from
- **Decision**: G0 obtains a token for a seeded user of each tenant realm and records, with the command
  and the decoded payload: `iss`, `aud`, `azp`, `resource_access`, `exp`, and the JWKS `kid`s. They are
  appended to facts.md from F11 on. G1 and G2 depend on those recorded shapes, not on documentation. If
  `aud` does not contain `acme-tasks-api`, an audience mapper is added to the realm JSON and measured
  again.
- **Rationale**: "not declared" is not "absent" (constitution IV); the case study found a response with
  twice the fields its specification listed.
- **Alternatives not taken**: writing the verifier against the documentation, which is how the mismatch
  would be found in production instead.
- **Facts relied on**: F1
- **Would change if**: not expected to change.

## R-3 The sign-in flow: `openid-client`

- **Decided**: 2026-09-30, plan
- **Subject**: how the authorisation code flow is implemented
- **Decision**: discovery per tenant issuer, authorisation code with PKCE (S256), `state` and the code
  verifier kept in a short-lived, HttpOnly, SameSite=Lax cookie bound to the browser that started the
  flow, refresh through the same library.
- **Rationale**: the library implements the flow and its checks (state, nonce, PKCE) that a hand-rolled
  version would have to re-derive; the case study's properties are about behaviour, not a library.
- **Alternatives not taken**: a hand-written token exchange with `fetch` (more code, more to get
  wrong); Passport (an extra framework layer for two routes).
- **Facts relied on**: F1, F9
- **Would change if**: not expected to change.

## R-4 Bearer verification: `jose` with one remote JWKS per issuer

- **Decided**: 2026-09-30, plan
- **Subject**: how a platform token on the existing API is verified
- **Decision**: `createRemoteJWKSet` per configured issuer; `jwtVerify` checks signature, `iss`, `aud`
  and `exp` with a 30 s clock tolerance; an unknown `kid` triggers one refetch (key rotation).
- **Rationale**: exactly the checks FR-008 names, with rotation handled.
- **Alternatives not taken**: token introspection on every call (a network round trip per request, and
  the platform may not offer it).
- **Facts relied on**: F1
- **Would change if**: the demo had to revoke a token within its lifetime; then introspection.

## R-5 The application session: server-side, opaque cookie, tokens encrypted at rest

- **Decided**: 2026-09-30, the author (C1) for the kind of session; plan for its design
- **Subject**: how the application keeps its session after a platform sign-in
- **Decision**: a `sessions` collection keyed by a random 32-byte id sent as an HttpOnly, SameSite=Lax
  cookie; the platform's refresh and access tokens stored with AES-256-GCM under a key from the
  environment. A refresh that the platform refuses (`invalid_grant`) ends the session; a network error
  or a 5xx keeps it and schedules a retry.
- **Rationale**: logout, expiry and refresh live in one place; nothing downstream learns about the
  platform (constitution VI).
- **Alternatives not taken**: a signed stateless cookie (cannot be revoked on the server); forwarding
  the platform token to the browser (a second kind of session).
- **Facts relied on**: F1
- **Would change if**: not expected to change.

## R-6 Webhook signing: HMAC-SHA256 over timestamp and raw body, one secret per event type

- **Decided**: 2026-09-30, plan
- **Subject**: how an event proves where it came from and when
- **Decision**: headers `X-Platform-Delivery` (delivery id), `X-Platform-Event` (type),
  `X-Platform-Timestamp` (Unix seconds) and `X-Platform-Signature` (`sha256=<hex>` of
  `${timestamp}.${rawBody}`), with one secret per event type from the environment; the raw bytes are
  captured before JSON parsing; comparison with `timingSafeEqual`; a timestamp more than 300 s from the
  application's clock is refused.
- **Rationale**: FR-014 and FR-015; signing the timestamp with the body makes an old delivery useless.
- **Alternatives not taken**: one secret for all events (one leak compromises every event); signing the
  parsed JSON (a re-serialisation can change the bytes).
- **Facts relied on**: F1
- **Would change if**: not expected to change; the mock that signs is part of this repository.

## R-7 The inbox: store first, acknowledge, process asynchronously

- **Decided**: 2026-09-30, plan
- **Subject**: when an event is acknowledged and where it waits
- **Decision**: a `deliveries` collection with a unique index on `deliveryId` and a TTL index on
  `expiresAt` (30 days); a duplicate key answers 200 without a second effect; an in-process queue
  processes new deliveries, and a sweep on start-up and every hour picks up the unprocessed ones.
- **Rationale**: acknowledging after storing, not after processing, keeps the platform from timing out
  and re-delivering (the case study's failure mode).
- **Alternatives not taken**: processing inside the request (timeouts, duplicates); an external queue
  (more infrastructure than the demo needs).
- **Facts relied on**: F1
- **Would change if**: the demo needed more than one API instance; then an external queue.

## R-8 Exactly one user on concurrent first contact

- **Decided**: 2026-09-30, plan
- **Subject**: how concurrent first requests for one new user converge
- **Decision**: a partial unique index on `users` over `{ tenantId, platformSubject }` where
  `platformSubject` exists; insert, and on duplicate key read the winner back. The control: the same
  eight-way test with the index dropped must produce more than one user.
- **Rationale**: FR-010 and SC-002; the case study measured five duplicates without the index and zero
  with it — a guard is only trusted once its absence has been seen.
- **Alternatives not taken**: a lock (slower, and a lock that fails open is invisible).
- **Facts relied on**: F1
- **Would change if**: not expected to change.

## R-9 Tenant sync: claims, tombstones, and two kinds of lookup failure

- **Decided**: 2026-09-30, the author (C3) for the tombstone; plan for the rest
- **Subject**: how tenant events and lookups change a tenant
- **Decision**: `tenants` holds `state` (`active` or `deleted`), `deletedAt`, `purgeAfter` and the
  platform time of the last applied change; an event applies only if it is newer than the last applied
  change (so a late "created" cannot revive a deleted tenant). A lookup uses a client-credentials token
  from the `platform` realm: a 4xx from the tenant API marks the event `rejected`; a network error or a
  5xx keeps it `pending`, retried hourly, expiring after 30 days.
- **Rationale**: FR-019 to FR-022 and the clarification on deleted tenants.
- **Alternatives not taken**: processing events strictly in arrival order (breaks on reordering); hard
  deletion (a late "created" revives the tenant).
- **Facts relied on**: F1
- **Would change if**: not expected to change.

## R-10 Playwright pinned at 1.62.1

- **Decided**: 2026-09-30, plan
- **Subject**: which Playwright the browser tests use on the host that runs them
- **Decision**: `@playwright/test` 1.62.1, browsers in a directory of their own
  (`PLAYWRIGHT_BROWSERS_PATH`).
- **Rationale**: 1.63.0 refuses this host, 1.62.1 installs Chromium and opens a page (F6).
- **Alternatives not taken**: the official Playwright image (works — measured: 2.51 GB, Node v24.20.0 —
  but adds user-id, home-directory and proxy plumbing to an unattended run).
- **Facts relied on**: F6
- **Would change if**: a newer Playwright supports this host again, or the run moves to a newer host;
  then the newest version.

## R-11 Time: one injectable clock

- **Decided**: 2026-09-30, the author (C4) for the approach; plan for the interface
- **Subject**: how hourly and 30-day behaviour is tested without waiting
- **Decision**: a `Clock` with `now()` and `every(ms, fn)`; production uses the real clock and the real
  intervals (hourly, 30 days); tests use a manual clock with `advance(ms)` and say so in the test.
- **Rationale**: the clarification of 2026-09-30 and FR-032.
- **Alternatives not taken**: waiting for real hours in tests (the case study did it once; an
  unattended demo run would idle for an hour per timer); shortening the defaults (the demo would no
  longer show the real values).
- **Facts relied on**: —
- **Would change if**: not expected to change.

## R-12 The web client: one gate, one registry, a two-stage loop guard

- **Decided**: 2026-09-30, the author (C5) for what is hidden and where users land; plan for the rest
- **Subject**: how the web client decides what a tenant sees and stops sign-in loops
- **Decision**: React with Rsbuild and React Router. Every route that needs a user goes through one
  `AuthGate`; the visibility registry (its shape is a contract) answers, per tenant, which pages, tabs
  and sections are hidden and where the user lands, and answers "nothing hidden, the usual landing" for
  a tenant that is not integrated. The loop guard has two stages: a one-time marker per sign-in in
  session storage, and "a restart within 60 s of a completed sign-in" (the API reports when the session
  was created) ends on an error page.
- **Rationale**: FR-026 to FR-028; the case study found that an IdP that signs in silently can loop
  many times a minute without such a guard.
- **Alternatives not taken**: conditions spread through the pages (the pattern the case study
  replaced).
- **Facts relied on**: F1, F9
- **Would change if**: not expected to change.

## R-13 Subscriptions registered from the route table

- **Decided**: 2026-09-30, plan
- **Subject**: where the callback addresses of the event subscriptions come from
- **Decision**: at start-up the API lists its own routes tagged as webhooks, builds the callback URLs
  from them and upserts one subscription per event type with the mock platform.
- **Rationale**: FR-018; a hand-maintained list of callback URLs drifts from the routes.
- **Alternatives not taken**: static configuration.
- **Facts relied on**: F1
- **Would change if**: not expected to change.

## R-14 Device pull

- **Decided**: 2026-09-30, plan
- **Subject**: how the tenant's devices are kept current
- **Decision**: per integrated tenant, every hour and when the tenant is created, pages of 200 until an
  empty or short page; one `deviceSyncStates` document per tenant with `source`, `lastAttemptAt`,
  `lastSuccessAt` and `lastError`; off unless `DEVICE_PULL_ENABLED=true`.
- **Rationale**: FR-023 to FR-025.
- **Alternatives not taken**: pulling on demand when a page opens (slow pages, and nothing to show when
  the platform is down).
- **Facts relied on**: F1
- **Would change if**: the platform sent device events; then they would be consumed instead of pulling.

## R-15 Ports, secrets and the stack

- **Decided**: 2026-09-30, plan
- **Subject**: where the services listen and how secrets reach them
- **Decision**: API 18400, web 18401, mock platform 18402, MongoDB 18417, Keycloak 18480; secrets only
  through the environment, with `.env.example` holding dummy values and the test setup generating fresh
  ones per run; `compose.yaml` runs Keycloak and MongoDB only.
- **Rationale**: tenancy on a shared host; no secret in the repository; fast restarts of the Node
  services under test.
- **Alternatives not taken**: running everything in Compose (slower test cycles, harder to inject a
  clock).
- **Facts relied on**: F3, F5
- **Would change if**: F5, measured again right before the run, finds a port taken; then the whole
  block moves and the goal ledger records it.

## R-16 Dependency majors chosen by measurement under the supply-chain settings

- **Decided**: 2026-09-30, plan
- **Subject**: which majors of Rsbuild, React Router and the MongoDB driver
- **Decision**: Rsbuild 2 (`@rsbuild/core` ^2, `@rsbuild/plugin-react` ^2), React Router 8, the MongoDB
  driver 7, with `strictDepBuilds: true` and an empty `allowBuilds`.
- **Rationale**: with Rsbuild 1 the install fails on core-js's build script (F8); with these majors the
  whole set installs with no build script (F9), resolving `@rsbuild/core 2.2.9`, `react-router 8.4.0`,
  `mongodb 7.6.0`, `fastify 5.12.5`, `openid-client 6.8.8`, `jose 6.2.12` and `react 19.3.0`.
- **Alternatives not taken**: keeping Rsbuild 1 and declaring `core-js: false` in `allowBuilds` (also
  measured to work, but it widens the supply-chain settings for a package that is no longer needed).
- **Facts relied on**: F8, F9
- **Would change if**: a release of these majors asks for a build script; then measure again, and
  widen `allowBuilds` only with the reason recorded.

## R-17 The spec folder put into the playbook's forms

- **Decided**: 2026-09-30, the author
- **Subject**: how this folder relates to spec-driven-dev-playbook, which was finished after this
  folder's first draft
- **Decision**: keep spec-kit's files in English and match the playbook's templates part by part,
  naming in each file the template it follows: the launch brief (seven parts), the constitution (what
  breaks without each principle; the exceptions), the permissions section and the ticket's disposition
  table in spec.md, the plan gates, the verification checklists of tasks.md, the fact table
  (facts.md), the fields of this ledger, the HANDOFF of G6 and the goal pack's mapping
  (goal-pack/from-spec.md). The permissions section raised C6 and C7, which went to a human before
  anything was planned for them.
- **Rationale**: the playbook points to this folder as its complete example; an example that skips
  half the forms shows less than the playbook says. Doing it before the run keeps the run's evidence in
  the same shape.
- **Alternatives not taken**: leaving the folder as first written (it would lack the permissions
  section and the disposition table, the two additions the playbook makes to the upstream spec);
  rewriting it in Japanese like the playbook (spec-kit's files and the goal pack the run reads are in
  English; matching part by part keeps the correspondence visible without translating).
- **The first three principles**, compared with the playbook's operating articles: "no branches" is
  principle I; "check the logic rather than guess" is principle IV here; "follow the team's test
  policy" has no team to follow in a demo, so principle V states the test rules itself.
- **Facts relied on**: —
- **Would change if**: the playbook's templates change; then this folder is compared with them again.

## R-18 Permissions: one table, one check per operation, the roles taken from the principal

- **Decided**: 2026-09-30, the author (C6, C7) for the tiers and the token path's roles; plan for the
  design
- **Subject**: how the Permissions section of spec.md is enforced
- **Decision**: the permission table (role → operations) lives in `packages/contracts` next to the role
  mapping table. Every `/api/*` route declares the operation it performs, and one check after
  authentication compares it with the principal's roles and answers 403 `forbidden` before the handler
  runs. A session's principal carries the stored roles; a token's principal carries the roles its token
  maps to, computed in memory through the same mapping table and never written. `GET /api/users` lists
  the tenant's users with their roles, for `admin`. Every query of the existing API filters by the
  principal's tenant (FR-035).
- **Rationale**: FR-033 to FR-035; one table and one check put the 12 combinations of SC-009 in one
  place, and the control (the check switched off) shows that the test would notice a missing check.
- **Alternatives not taken**: a check inside each handler (four places, each one a chance to forget
  it); hiding links in the web client only (the server would still answer, which FR-033 forbids).
- **Facts relied on**: — (decisions relied on: C6, C7; R-4 for the token path)
- **Would change if**: a role or an operation is added; then one row of the table changes, and nothing
  else.
