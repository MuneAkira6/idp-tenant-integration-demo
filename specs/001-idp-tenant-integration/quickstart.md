# Quickstart: validate the integration end to end

Phase 1 of [plan.md](plan.md). A run guide, not an implementation: it names what to run and what must
be observed. Shapes are in [contracts/](contracts/api.md) and [data-model.md](data-model.md).

## 1. Prerequisites

Docker with Compose, Node 24, pnpm through corepack (`packageManager`), and Chromium for Playwright
1.62.1 installed with `pnpm exec playwright install chromium`. Free ports 18400–18419 and 18480.

## 2. Start

```bash
docker compose up -d          # Keycloak 26.7.4 with the three realms, MongoDB 7
pnpm install
pnpm test                     # unit and integration tests (the apps are started by the tests)
pnpm e2e                      # browser flows (Playwright starts api, web and mock-platform)
```

`.env.example` lists every setting with a dummy value; the test setup generates fresh secrets per run.

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

## 4. The controls (a guard counts only once it has been seen red)

| Guard | Control that must fail without it |
|---|---|
| partial unique index on first contact | Q6 with the index dropped → more than one user |
| signature verification | Q8 with verification bypassed in a test build → the forged event is applied |
| timestamp window | Q8 with the window set to "unlimited" in the test → the stale event is applied |
| loop guard | Q14 with the guard switched off in the test → the browser bounces more than twice within 60 s |
| refresh classification | Q3 with every refresh failure treated alike → one of the two cases ends wrong |

Each control runs in a test that says it is a control, and the goal ledger quotes both the red and the
green.

## 5. Two runs agree

A verdict counts when two consecutive runs of the same command agree; the ledger quotes both summaries
and names the commit and the image tags.
