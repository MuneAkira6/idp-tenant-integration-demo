# Quickstart: validate the integration end to end

**AS-BUILT, 2026-09-30.** Phase 1 of [plan.md](plan.md). A run guide, not an implementation: it names
what to run and what must be observed. Shapes are in [contracts/](contracts/api.md) and
[data-model.md](data-model.md).

Two statements were rewritten in G6 because the implementation run measured them to be wrong; both are
marked **AS-BUILT** where they appear, and both have an entry with its measurement in the Contract
changes table of [goal-pack/PROGRESS.md](../../goal-pack/PROGRESS.md). Nothing else in this file
changed.

## 1. Prerequisites

Docker with Compose, Node 24, pnpm pinned by `packageManager` (through corepack on a fresh machine or CI), and Chromium for Playwright
1.62.1 installed with `pnpm exec playwright install chromium`. Free ports 18400–18419 and 18480.

## 2. Start

```bash
pnpm stack:up                 # Keycloak 26.7.4 with the three realms, MongoDB 7
pnpm install
pnpm seed                     # the tenant that is not integrated, `local`, with its users and tasks
pnpm test                     # unit and integration tests (the apps are started by the tests)
pnpm e2e                      # browser flows (Playwright starts api, web and mock-platform)
```

**AS-BUILT**: the first line was `docker compose up -d`. It does not start a half-configured stack —
it does not start at all. `compose.yaml` interpolates `${KC_BOOTSTRAP_ADMIN_USERNAME:?…}` and
`${KC_BOOTSTRAP_ADMIN_PASSWORD:?…}`, so without an env file Compose stops before creating anything
(measured: `docker compose config` exits 1 with `required variable KC_BOOTSTRAP_ADMIN_USERNAME is
missing a value`). `pnpm stack:up` generates the secrets into `${TMPDIR:-/tmp}/acme-idp-demo.env` with
mode 600, passes it with `--env-file`, waits for both services to be healthy, and then runs
`scripts/provision.ts`, which sets the realms' client secrets and the seeded users' passwords through
Keycloak's admin API — because Keycloak 26.7.4 stores `${env.NAME}` in a realm import verbatim instead
of substituting it (facts.md, F11).

**AS-BUILT**: `pnpm seed` was not in this list and is required. `local` is the baseline for FR-031,
and one test asserts it in the **live** `acme_tasks` database — tenant `local`, not integrated, active,
3 users, 4 tasks, 0 sessions. Without the seed that test fails on a stack brought up from nothing, so
the sequence above did not reproduce. It comes after `pnpm install` because it needs `node_modules`.

`.env.example` lists every setting with a dummy value; the test setup generates fresh secrets per run,
and no secret is written into this repository.

## 3. Scenarios and what must be observed

| # | Scenario | Observed |
|---|---|---|
| Q1 | Sign in as `alice@tenant-a` from `/auth/login?tenant=tenant-a` | lands on `/board` within 10 s; `GET /auth/session` shows `tenant-a`, `integrated: true` (SC-001) |
| Q2 | Replay the callback URL in a second browser context | 400 `state_mismatch` |
| Q3 | Refresh refused by the IdP (session revoked in Keycloak) vs IdP unreachable (Keycloak stopped) | refused → session ends; unreachable → session survives and `refreshRetryAt` is set |
| Q4 | `GET /api/tasks` with a platform token of `bob@tenant-b`, without a session cookie | 200 as Bob; the `sessions` count is unchanged |
| Q5 | Tokens: expired, wrong audience, issuer `tenant-x` | 401 `invalid_token` each |
| Q6 | Eight parallel first requests for a new platform user | exactly one `users` document (SC-002) |
| Q7 | Change Carol's platform roles between sign-ins; sign in ten times unchanged | roles replaced to the mapping of the union; zero writes across the ten (SC-005); an unmapped role gives `member` and a warning naming it |
| Q8 | Deliver `tenant.created` three times (same id), once with a bad signature, once 6 minutes old | one tenant created; two 401s (SC-003) |
| Q9 | Stop the API between storing and processing a delivery; start it again | the delivery is processed by the start-up sweep |
| Q10 | `tenant.deleted` then `tenant.created` for the same tenant (created older) | the tenant ends `deleted`; sign-in refused; data kept until `purgeAfter` (SC-004) |
| Q11 | `tenant.created` without details, with the tenant API refusing, then unreachable | refusing → lookup `rejected`, no retry; unreachable → `pending`, retried after the clock advances one hour, `expired` after 30 days |
| Q12 | Device pull for the tenant with 450 devices; then the second page fails | 450 stored; after the failure `lastSuccessAt` unchanged, `lastError` set (SC-006) |
| Q13 | Sign in as a user of `tenant-a` and of `local` | `tenant-a` sees no password, invitation or deletion pages and lands on `/board`; `local` sees everything and lands on `/home` |
| Q14 | Force the IdP to bounce the browser straight back to sign-in | the loop guard stops on `/error/loop` after at most one return (SC-007) |
| Q15 | Start with no integration settings at all | `local` passes its tests; every token and every event is refused (SC-008) |
| Q16 | For a `member`, a `manager` and an `admin` of `tenant-a`, call `GET /api/tasks`, `POST /api/tasks`, `GET /api/devices` and `GET /api/users` | the 12 answers match the permission table of data-model.md: 200 or 201 where it says yes, 403 `forbidden` where it says no, and no document changed by a 403 (SC-009) |
| Q17 | Call `GET /api/devices` with a platform token whose roles map to `manager`; remove that role in Keycloak, obtain a new token and call again | 200, then 403 `forbidden`; no sign-in in between, and the user's stored `roles` are unchanged (FR-034) |
| Q18 | As the `admin` of `tenant-a`, call `GET /api/users` | only `tenant-a` users are listed, although `tenant-b` and `local` have users too (FR-035) |

## 4. The controls (a guard counts only once it has been seen red)

| Guard | Control that must fail without it |
|---|---|
| partial unique index on first contact | **AS-BUILT**: Q6 with **both** unique indexes of `users` dropped → eight users. Dropping only the partial unique index of research R-8 leaves **one**: `users` also carries `users_tenant_email_unique` over `{ tenantId, email }` (data-model.md), and a first contact for one platform subject always carries the same address, so that index rejects the duplicate instead — measured, with the rejection naming it (`E11000 … users_tenant_email_unique`). R-8's index is still the correct guard for FR-010, because the platform subject is the stable key and the e-mail index only coincides with it at first contact. The control also forces the interleaving with a barrier: eight parallel HTTP requests do not contend at the database on this host. |
| signature verification | Q8 with verification bypassed in a test build → the forged event is applied |
| timestamp window | Q8 with the window set to "unlimited" in the test → the stale event is applied |
| loop guard | Q14 with the guard switched off in the test → the browser bounces more than twice within 60 s |
| refresh classification | Q3 with every refresh failure treated alike → one of the two cases ends wrong |
| permission check | Q16 with the check switched off in the test → the `member` reads the devices |
| roles of the token path | Q17 with the principal's roles read from the stored user instead → the second call still answers 200 |

Each control runs in a test that says it is a control, and the goal ledger quotes both the red and the
green.

## 5. Two runs agree

A verdict counts when two consecutive runs of the same command agree; the ledger quotes both summaries
and names the build under test: the commit, a fingerprint of the working tree and the image digests.
