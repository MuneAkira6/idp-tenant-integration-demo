# Tasks: Sign-in and tenant integration with the group platform

**Input**: Design documents from `specs/001-idp-tenant-integration/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: requested — the spec's success criteria and the constitution's controls (principle V) require
tests, including one control per guard that shows it red.

**Organization**: grouped by user story. The phases map to the goals of the implementation run:
Phase 1–2 → G0, US1 + US8 → G1, US2 + US3 + US9 → G2, US4 → G3, US5 + US6 → G4, US7 → G5, Polish → G6.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: the user story (US1–US9)

Every phase ends with the items of the verification checklists at the end of this file that it must
satisfy: **M** items are manual (a person or the bus observes them), **L** items are logical (settled by
reading the code against the spec).

## Phase 1: Setup (shared infrastructure)

- [ ] T001 Create the pnpm workspace (`pnpm-workspace.yaml` with the supply-chain settings, root `package.json` with `packageManager`) and the folders of plan.md
- [ ] T002 [P] Add `compose.yaml` with `quay.io/keycloak/keycloak:26.7.4` on 18480 and `mongo:7` on 18417, and `.env.example` with dummy values
- [ ] T003 [P] Configure Biome, TypeScript (`tsc --noEmit`) and Vitest at the root
- [ ] T004 Write the realm JSON imports in `infra/keycloak/realms/` (platform, tenant-a, tenant-b; clients `acme-tasks`, `acme-reports`, `acme-tasks-sync`; seeded users alice, bob, carol, and in `tenant-a` one user for each application role for Q16; the roles of research R-1)

**Verification**: M1, L1.

## Phase 2: Foundational (blocking prerequisites)

- [ ] T005 Measure the token shapes (research R-2): `iss`, `aud`, `azp`, `resource_access`, `exp`, JWKS `kid`s for each tenant realm, with the command and the decoded payload, appended to facts.md as entries from F11 on
- [ ] T006 Freeze `packages/contracts` from `contracts/*.md`, data-model.md (the role mapping and the permission table included) and the recorded token shapes (names and shapes; constitution VII)
- [ ] T007 [P] Implement the injectable clock in `apps/api/src/clock.ts` (research R-11) with a manual test clock
- [ ] T008 [P] Implement configuration loading with the defaults of data-model.md in `apps/api/src/config.ts`; missing settings fail closed
- [ ] T009 Create the MongoDB collections and indexes of data-model.md in `apps/api/src/db.ts` (partial unique on users, TTL on sessions and deliveries)
- [ ] T010 [P] Scaffold `apps/mock-platform` with the subscription API and the test controls of contracts/platform.md
- [ ] T011 Seed the `local` tenant (not integrated) with its password users and tasks in `apps/api/src/seed.ts`

**Verification**: M2, L2.

## Phase 3: User Story 1 — Sign in with the group account (P1) 🎯 MVP

- [ ] T012 [P] [US1] Integration test: code + PKCE sign-in for `tenant-a` ends in a server-side session (quickstart Q1) in `apps/api/test/signin.test.ts`
- [ ] T013 [P] [US1] Integration test: a replayed callback in another browser is refused (Q2)
- [ ] T014 [US1] Implement `GET /auth/login` and `GET /auth/callback` with `openid-client` in `apps/api/src/auth/platform.ts`
- [ ] T015 [US1] Implement the server-side session with AES-256-GCM token storage in `apps/api/src/auth/session.ts`
- [ ] T016 [US1] Derive the tenant from the ID token's `iss` only (ignore Host) in `apps/api/src/auth/tenant.ts`
- [ ] T017 [US1] Implement refresh classification (refused → end; unreachable → keep, `refreshRetryAt`) with its test and its control (Q3)
- [ ] T018 [US1] Implement `POST /auth/logout` (both sessions) and `GET /auth/session`
- [ ] T057 [P] [US1] Test: a valid sign-in for `tenant-a` sent with `Host: tenant-b.localhost` lands in `tenant-a` (analyze A1)
- [ ] T058 [P] [US1] Test: after logout the application session is gone and the IdP no longer signs the browser in silently (analyze A2)
- [ ] T064 [P] [US1] E2E: time from starting sign-in to the landing page is under 10 s, measured twice (SC-001, analyze A8)

**Verification**: M3, L3.

## Phase 4: User Story 8 — Nothing changes until it is configured (P1)

- [ ] T019 [P] [US8] Test: with no settings, `local` passes its password sign-in and task tests; every token and event is refused (Q15)
- [ ] T020 [US8] Implement `POST /auth/password` unchanged for `local`, and the `not_integrated` answer for platform sign-in on it

**Verification**: M4, L4.

## Phase 5: User Story 2 — Other clients use the existing API with a platform token (P1)

- [ ] T021 [P] [US2] Integration test: a Bearer call runs as the user and writes nothing (Q4)
- [ ] T022 [P] [US2] Test: expired, wrong-audience and unknown-issuer tokens answer 401 (Q5)
- [ ] T023 [P] [US2] Test and control: eight parallel first contacts → one user; with the index dropped → more than one (Q6, SC-002)
- [ ] T024 [US2] Implement the Bearer path with `jose` (one remote JWKS per issuer, refetch on unknown `kid`) in `apps/api/src/auth/bearer.ts`
- [ ] T025 [US2] Implement first-contact creation with duplicate-key read-back in `apps/api/src/users.ts`
- [ ] T059 [P] [US2] Test: a request carrying Alice's session and Bob's token runs as Alice (analyze A3)

**Verification**: M5, L5.

## Phase 6: User Story 3 — Roles follow the platform (P2)

- [ ] T026 [P] [US3] Test: the union of `acme-tasks` and `acme-reports` roles maps and replaces (Q7)
- [ ] T027 [P] [US3] Test: ten unchanged sign-ins write the roles zero times (SC-005)
- [ ] T028 [P] [US3] Test: an unmapped role gives `member` and a warning naming it
- [ ] T029 [US3] Implement role derivation with the mapping table from `packages/contracts` in `apps/api/src/roles.ts`

**Verification**: M6, L6.

## Phase 7: User Story 9 — Roles decide what each user may do (P2)

- [ ] T065 [P] [US9] Test and control: the 12 answers of Q16 for `member`, `manager` and `admin` match the permission table, and a 403 changes nothing; with the check switched off, the `member` reads the devices (SC-009) in `apps/api/test/permissions.test.ts`
- [ ] T066 [P] [US9] Test and control: Q17 — a token whose roles map to `manager` reads the devices; after the role is removed in Keycloak, a new token gets 403 and the stored roles are unchanged; with the roles read from the stored user instead, the second call answers 200 (FR-034)
- [ ] T067 [P] [US9] Test: Q18 — the `admin` of `tenant-a` lists only `tenant-a` users (FR-035)
- [ ] T068 [US9] Implement the permission table in `packages/contracts` and the one check after authentication in `apps/api/src/auth/permissions.ts`; every `/api/*` route declares its operation
- [ ] T069 [US9] Implement `GET /api/users`, and the token principal's roles derived from the token in memory in `apps/api/src/auth/bearer.ts`

**Verification**: M7, L7.

## Phase 8: User Story 4 — Platform events arrive safely (P2)

- [ ] T030 [P] [US4] Test: three deliveries of one id → one effect; bad signature and 6-minute-old timestamp → 401 (Q8, SC-003)
- [ ] T031 [P] [US4] Controls: signature bypassed and window unlimited in a test build → the forged and the stale event are applied
- [ ] T032 [P] [US4] Test: a stored but unprocessed delivery is processed by the start-up sweep (Q9)
- [ ] T033 [US4] Implement `POST /webhooks/platform` with raw-body HMAC verification and constant-time comparison in `apps/api/src/webhooks/receive.ts`
- [ ] T034 [US4] Implement the inbox and the asynchronous processor with the start-up and hourly sweep in `apps/api/src/webhooks/inbox.ts`
- [ ] T035 [US4] Implement subscription registration from the route table at start-up in `apps/api/src/webhooks/subscribe.ts`
- [ ] T036 [US4] Implement event delivery, re-delivery and signing in `apps/mock-platform/src/events.ts`
- [ ] T060 [P] [US4] Test: the `deliveries` TTL index exists on `expiresAt` and `expiresAt` = `receivedAt` + 30 days; the test says the deletion itself is MongoDB's (analyze A4)
- [ ] T061 [P] [US4] Test: after start-up the mock lists every event type with the callback URL of the tagged route (analyze A5)

**Verification**: M8, L8.

## Phase 9: User Story 5 — Tenants follow the platform (P2)

- [ ] T037 [P] [US5] Test: created and deleted events, twice each and in reverse order, converge (Q10, SC-004)
- [ ] T038 [P] [US5] Test: a lookup refused → `rejected`; unreachable → `pending`, retried after one clock hour, `expired` after 30 days (Q11)
- [ ] T039 [P] [US5] Test: a deleted tenant's sign-in and API calls are refused; its data is purged after `purgeAfter`
- [ ] T040 [US5] Implement tenant event handling with platform-time claims and tombstones in `apps/api/src/tenants/sync.ts`
- [ ] T041 [US5] Implement the tenant lookup with client credentials and its two failure kinds in `apps/api/src/tenants/lookup.ts`
- [ ] T042 [US5] Implement the tenant API with its modes in `apps/mock-platform/src/tenants.ts`

**Verification**: M9, L9.

## Phase 10: User Story 6 — Devices are kept current (P3)

- [ ] T043 [P] [US6] Test: 450 devices over three pages are stored (Q12)
- [ ] T044 [P] [US6] Test: a failing second page keeps `lastSuccessAt` and records the error (SC-006)
- [ ] T045 [P] [US6] Test: with the device pull off, no pull runs when the clock advances an hour
- [ ] T046 [US6] Implement the device pull and `deviceSyncStates` in `apps/api/src/devices/pull.ts`, and `GET /api/devices`
- [ ] T047 [US6] Implement the device API with pagination and its failure mode in `apps/mock-platform/src/devices.ts`
- [ ] T062 [P] [US6] Test: a `tenant.created` event leads to a pull without the clock advancing (analyze A6)
- [ ] T063 [P] [US6] Test: the production wiring schedules the real intervals — 1 h pick-up, retry and pull; 30-day expiries (FR-032, analyze A7)

**Verification**: M10, L10.

## Phase 11: User Story 7 — Integrated tenants see a UI shaped for them (P2)

- [ ] T048 [P] [US7] Playwright: `tenant-a` hides the three owned functions and lands on `/board`; `local` sees everything and lands on `/home` (Q13) in `tests/e2e/visibility.spec.ts`
- [ ] T049 [P] [US7] Playwright and control: a forced loop stops on `/error/loop`; with the guard off it bounces more than twice (Q14, SC-007) in `tests/e2e/loop.spec.ts`
- [ ] T050 [US7] Scaffold `apps/web` with Rsbuild, React Router and the pages of contracts/web.md
- [ ] T051 [US7] Implement the visibility registry from `packages/contracts` in `apps/web/src/visibility.ts`
- [ ] T052 [US7] Implement the single `AuthGate` and the two-stage loop guard in `apps/web/src/auth/gate.tsx`
- [ ] T070 [US9] Show the server's 403 on `/devices` and `/users` as contracts/web.md says; the web client keeps no permission table (built here because it needs T050)

**Verification**: M11, L11.

## Phase 12: Polish and closing

- [ ] T053 Run every test and e2e twice; record both summaries with the build under test (the commit, the working-tree fingerprint and the image digests)
- [ ] T054 [P] Rewrite `packages/contracts` and `contracts/*.md` as AS-BUILT, marking every difference
- [ ] T055 [P] Write the README (Japanese, seven sections) with the sign-in and webhook sequence diagrams, and the demo's differences from the case study (the injected clock, the SDD → goal pack chain)
- [ ] T056 Write `specs/001-idp-tenant-integration/HANDOFF.md` in the eight parts of the playbook's handover (`goal-pack/materials/playbook/HANDOFF.md`), and check that no container, process or port of the run is left behind

**Verification**: M12, L12.

## Dependencies

Phase 1 → Phase 2 → US1 → US8 → US2 → US3 → US9 → US4 → US5 → US6 → US7 → Polish. US9 needs US2's
token path and US3's roles; US4 must come before US5 (tenant sync consumes events); US7 needs US1's
`GET /auth/session`, and T070 needs T050. Inside a phase, [P] tasks touch different files.

## Verification checklists

Form: the verification checklists of spec-driven-dev-playbook (`templates/tasks-verification.md`),
written together with the tasks. The playbook's form has a column for the actual observation and one for
the verdict; here both are written once, in the goal ledger row named in the last column, so that nothing
is recorded twice.

**Build under test**: before its first verdict, each goal records the commit (`git rev-parse --short
HEAD`), a fingerprint of the working tree and the digests of the two images, as goal-pack/goal-brief.md
says.

### Manual verification

| # | Action | Expected observation | Recorded in `goal-pack/PROGRESS.md` |
|---|---|---|---|
| M1 | `docker compose up -d` for acme-idp-demo; fetch each realm's discovery document | both services up; three `issuer` lines | G0, E3 |
| M2 | Obtain and decode a token of each tenant realm and of `acme-tasks-sync` | `iss`, `aud`, `azp`, `resource_access`, `exp` and `kid` recorded with their commands | G0, E4 |
| M3 | Sign in as alice@tenant-a in a browser | lands on `/board` within 10 s; the session cookie is an opaque value, not a JWT | G1, AC-1 and AC-3 |
| M4 | Run the `local` tests after G1 and compare with the G0 baseline | the same results | G1, AC-8 |
| M5 | Run the first-contact control and the test | red with the index dropped, green with it | G2, AC-11 |
| M6 | Sign in ten times with unchanged roles and count the role writes in the database | 0, quoted from the database, not from a log | G2, AC-15 |
| M7 | Call the four operations of the permission table as each role | the 12 answers of the table; a 403 changes nothing | G2, AC-40 to AC-42 |
| M8 | Deliver the events of Q8 and compare the mock's `/__control/log` with the inbox | the two agree | G3 checks |
| M9 | Deliver tenant events twice each and in reverse order | every tenant ends as the last platform change implies | G4, AC-24 |
| M10 | Read `GET /api/devices` after a failed pull | the source and the last attempt are shown, the last success unchanged | G4, AC-28 |
| M11 | Compare `tenant-a` and `local` side by side in the browser | `tenant-a`: three functions hidden, lands on `/board`; `local`: everything, lands on `/home` | G5, AC-32 |
| M12 | Follow the README from a fresh clone | `docker compose up -d && pnpm i && pnpm test && pnpm e2e` green, twice | G6, AC-36 |

### Logical verification

| # | What to confirm | Where to read | Recorded in `goal-pack/PROGRESS.md` |
|---|---|---|---|
| L1 | No secret value in the repository; `.env.example` holds dummies only | the whole repository, `.env.example` | G0 checks |
| L2 | Every setting of data-model.md has its default in the configuration, and each default fails closed | `apps/api/src/config.ts` | G0, E6 |
| L3 | No route downstream reads how the session began, and the platform tokens never reach the browser | the readers of `sessions.kind`; every response of the API | G1 checks |
| L4 | Every integration path checks its setting before anything else | sign-in, the Bearer path, the webhook route, the device pull | G1 checks |
| L5 | A request with a session never reads the Authorization header | the authentication step | G2 checks |
| L6 | The role mapping table and the permission table each exist exactly once | `packages/contracts` and every reader | G2 checks |
| L7 | Every `/api/*` route declares its operation, and the one check runs before every handler | the route table; `apps/api/src/auth/permissions.ts` | G2 checks |
| L8 | The acknowledgement of an event never waits for its processing | `apps/api/src/webhooks/receive.ts` | G3, AC-19 |
| L9 | A lookup the platform refuses and one that cannot reach it are different branches with different outcomes | `apps/api/src/tenants/lookup.ts` | G4 checks |
| L10 | No code path writes `lastSuccessAt` on a failure | `apps/api/src/devices/pull.ts` | G4 checks |
| L11 | Every sign-in exit of the web client goes through the one gate | a search for direct redirects in `apps/web` | G5, AC-34 |
| L12 | Every FR and SC of spec.md is covered by at least one verdict row | the traceability table of the goal ledger | G6, AC-39 |

Not covered by these checklists: a real platform, or any IdP but the stand-in; more than one instance of
the API; load, and timing beyond SC-001; the settings pages of the tenant that is not integrated, which
this feature leaves as they are; browsers other than Chromium.
