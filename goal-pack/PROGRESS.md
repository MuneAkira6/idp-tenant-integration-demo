# idp-tenant-integration-demo — progress ledger

<!-- Structure the hooks rely on: goals are h2 sections; machine-checked tables have a "Verdict" column
     and an "Evidence" column; the environment table uses "Proof" and the change ledger has no Verdict
     column, so the gate leaves them alone. An empty verdict means "not done yet". -->

**Status: not started.**

Verdicts: PASS / FAIL / BLOCKED / DEFERRED (defined in goal-brief.md). The "Plan" column is fixed before
the run; to change a plan, write the reason here first. Every row names what it traces to in the spec
folder (FR, SC, a quickstart scenario Q, a task T). A row about a guard quotes its control red and its
test green.

## Environment (filled in G0; every row with the command and its output)

| Item | Value | Proof |
| --- | --- | --- |
| Node, pnpm (selected by packageManager), Playwright | | |
| Docker and Compose | | |
| Keycloak and MongoDB images (tags and digests) | | |
| Token shapes per realm (iss, aud, azp, resource_access, exp, kid) | | |

## Environment change ledger (before → change → restored)

| # | Goal | Object | Before | Change | Restored |
| --- | --- | --- | --- | --- | --- |

## Contract changes (frozen in G0; any later rename or reshape goes here)

| Date | Entry | Content |
| --- | --- | --- |

---

## G0 — the stack, the measured token shapes and the frozen contracts

| Condition | Verdict | Evidence |
| --- | --- | --- |
| E1 Node 24, pnpm 11.28.0 (packageManager) and Playwright 1.62.1 recorded (T001) | | |
| E2 `pnpm install` succeeds with the supply-chain settings unchanged (T001) | | |
| E3 `docker compose up -d` (project acme-idp-demo) brings Keycloak 26.7.4 and MongoDB 7 up; each of the three realms answers its discovery document (quote the `issuer` lines) (T002, T004) | | |
| E4 the token shapes of research R-2 measured for a seeded user of each tenant realm and for the `acme-tasks-sync` client, decoded payloads quoted (signatures cut) (T005) | | |
| E5 `packages/contracts` frozen from contracts/*.md and the measured shapes; `pnpm typecheck` clean (T006) | | |
| E6 clock, configuration with fail-closed defaults, collections and indexes, mock scaffold: their unit tests pass (T007–T010) | | |
| E7 the `local` tenant is seeded and its password sign-in test passes: the baseline for "unchanged" (T011) | | |
| E8 SCOPE.md marked FROZEN with the date, its content otherwise unchanged | | |

## G1 — sign-in, the session, and nothing changing until configured

| AC | Item | Plan | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| AC-1 | Q1 / SC-001: alice@tenant-a signs in and lands on `/board`; the time to landing is under 10 s in two runs (T012, T064) | measure | | |
| AC-2 | Q2: a callback replayed in another browser context answers 400 `state_mismatch` (T013) | measure | | |
| AC-3 | FR-003: the session cookie is opaque; the stored session holds the platform tokens encrypted (quote the document: ciphertext, no JWT) and the browser never receives them (T015) | measure | | |
| AC-4 | Q3 / FR-004: a refused refresh ends the session; an unreachable IdP keeps it and sets `refreshRetryAt`; control: with both failures treated alike, one case ends wrong (T017) | measure | | |
| AC-5 | FR-005: a sign-in for tenant-a sent with `Host: tenant-b.localhost` lands in tenant-a (T057) | measure | | |
| AC-6 | FR-006: after logout the application session is gone and the IdP no longer signs the browser in silently (T058) | measure | | |
| AC-7 | Q15 / FR-029 / FR-030: with no integration settings, platform sign-in is unavailable and every token and event is refused (T019) | measure | | |
| AC-8 | FR-031: the `local` password sign-in and task tests give the same results as the G0 baseline (T020) | measure | | |

### G1 checks

| Check | Verdict | Evidence |
| --- | --- | --- |
| `pnpm test` passes twice in a row with the same counts | | |
| `pnpm lint` and `pnpm typecheck` are clean | | |
| No route downstream reads how the session began (quote the search) | | |
| The change set is limited to the deliverables and this ledger (`git status --short`); nothing left listening | | |

## G2 — Bearer tokens on the existing API, and roles

| AC | Item | Plan | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| AC-9 | Q4 / FR-009: a Bearer call runs as bob@tenant-b and the `sessions` count and every collection except `users` are unchanged (T021) | measure | | |
| AC-10 | Q5 / FR-008: expired, wrong-audience and unknown-issuer tokens each answer 401 `invalid_token` (T022) | measure | | |
| AC-11 | Q6 / SC-002 / FR-010: eight parallel first contacts leave one user; control: with the partial unique index dropped, more than one (T023, T025) | measure | | |
| AC-12 | FR-007: a request with Alice's session and Bob's token runs as Alice (T059) | measure | | |
| AC-13 | research R-4: a token signed with a key rotated in after start-up is accepted after one JWKS refetch | measure | | |
| AC-14 | Q7 / FR-011 / FR-012: the union of `acme-tasks` and `acme-reports` roles is mapped and replaces the stored roles (T026, T029) | measure | | |
| AC-15 | SC-005: ten sign-ins with unchanged roles write the roles zero times (count from the database) (T027) | measure | | |
| AC-16 | FR-013: an unmapped platform role gives `member` and a warning that names it (T028) | measure | | |

### G2 checks

| Check | Verdict | Evidence |
| --- | --- | --- |
| `pnpm test` passes twice in a row with the same counts | | |
| `pnpm lint` and `pnpm typecheck` are clean | | |
| A request with a session never reads the Authorization header (quote the code path and a test) | | |
| The change set is limited to the deliverables and this ledger; nothing left listening | | |

## G3 — platform events

| AC | Item | Plan | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| AC-17 | Q8 / SC-003: one delivery id sent three times has one effect; a bad signature and a 6-minute-old timestamp answer 401 with no effect (T030) | measure | | |
| AC-18 | controls: with the signature check bypassed and with the window unlimited, in a test build, the forged and the stale event are applied (T031) | measure | | |
| AC-19 | FR-016: the acknowledgement returns before processing finishes (a test with a slow processor quotes both times) (T033, T034) | measure | | |
| AC-20 | Q9 / FR-017: a stored but unprocessed delivery is processed by the start-up sweep; another by the hourly sweep after the clock advances one hour (T032) | measure | | |
| AC-21 | FR-016: the TTL index on `deliveries.expiresAt` exists and `expiresAt` = `receivedAt` + 30 days; the test says the deletion itself is MongoDB's (T060) | measure | | |
| AC-22 | FR-018: after start-up the mock lists every event type with the callback URL of the tagged route (T035, T061) | measure | | |
| AC-23 | an unknown event type is stored as `ignored` and answers 200; an event type without a secret answers 401 `not_configured` | measure | | |

### G3 checks

| Check | Verdict | Evidence |
| --- | --- | --- |
| `pnpm test` passes twice in a row with the same counts | | |
| `pnpm lint` and `pnpm typecheck` are clean | | |
| The mock's `/__control/log` and the inbox agree for the deliveries of AC-17 | | |
| The change set is limited to the deliverables and this ledger; nothing left listening | | |

## G4 — tenants and devices

| AC | Item | Plan | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| AC-24 | Q10 / SC-004 / FR-019: created and deleted events, twice each and in reverse order, leave every tenant as the last platform change implies (T037, T040) | measure | | |
| AC-25 | Q11 / FR-020 / FR-021: a lookup the tenant API refuses is `rejected` and not retried; an unreachable one is `pending`, retried after the clock advances an hour, `expired` after 30 days (T038, T041) | measure | | |
| AC-26 | FR-022: a deleted tenant's sign-in and API calls are refused; its data is kept until `purgeAfter` and gone after it (T039) | measure | | |
| AC-27 | Q12 / FR-023: 450 devices over three pages are stored (T043, T046) | measure | | |
| AC-28 | SC-006 / FR-024: a failing second page keeps `lastSuccessAt`, records `lastError` and `lastAttemptAt` (T044) | measure | | |
| AC-29 | FR-025: with the device pull off, no pull runs when the clock advances an hour (T045) | measure | | |
| AC-30 | FR-023: a `tenant.created` event leads to a pull without the clock advancing (T062) | measure | | |
| AC-31 | FR-032: the production wiring schedules 1 h pick-ups, retries and pulls, and 30-day expiries (T063) | measure | | |

### G4 checks

| Check | Verdict | Evidence |
| --- | --- | --- |
| `pnpm test` passes twice in a row with the same counts | | |
| `pnpm lint` and `pnpm typecheck` are clean | | |
| "Refused" and "unreachable" are different branches with different outcomes (quote the code and both tests) | | |
| The change set is limited to the deliverables and this ledger; nothing left listening | | |

## G5 — what integrated tenants see

| AC | Item | Plan | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| AC-32 | Q13 / FR-026: tenant-a hides password management, invitations and tenant deletion (the pages, the `security` tab, the `pending-invitations` section) and lands on `/board`; `local` sees all of them and lands on `/home` (T048, T051) | measure | | |
| AC-33 | Q14 / SC-007 / FR-028: a forced loop stops on `/error/loop` after at most one return; control: with the guard off it bounces more than twice within 60 s (T049, T052) | measure | | |
| AC-34 | FR-027: every sign-in exit of the web client goes through the one gate (quote the search for direct redirects) | measure | | |
| AC-35 | the web client builds, and `pnpm e2e` passes twice in a row | measure | | |

### G5 checks

| Check | Verdict | Evidence |
| --- | --- | --- |
| `pnpm test` and `pnpm e2e` pass | | |
| `pnpm lint` and `pnpm typecheck` are clean | | |
| The change set is limited to the deliverables and this ledger; nothing left listening | | |

## G6 — closing

| AC | Item | Plan | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| AC-36 | `docker compose up -d && pnpm i && pnpm test && pnpm e2e` from a fresh clone of the working tree passes, twice, naming the commit and the image tags (T053) | measure | | |
| AC-37 | `packages/contracts` and `specs/…/contracts/*.md` rewritten as AS-BUILT, every difference marked with its reason (T054) | read + quote | | |
| AC-38 | README.md: the English summary, the seven sections, the sign-in and webhook sequence diagrams, 「実務で実施した点」 and 「デモで追加した点」 kept apart from `goal-pack/materials/sources.md`, the signature line (T055) | read + quote | | |
| AC-39 | traceability: a table in this ledger maps every FR-001–FR-032 and SC-001–SC-008 to the rows that verified it; none is missing | measure | | |

### G6 closing

| Condition | Verdict | Evidence |
| --- | --- | --- |
| HANDOFF.md written in the fixed structure (T056) | | |
| Change list, and one proposed commit message per goal (G0–G6) | | |
| `docker compose down -v` for acme-idp-demo: no container, volume or network of the run left (quote `docker ps -a` and `docker volume ls` filtered by the project) | | |
| No process of the run left listening on 18400–18419 or 18480 | | |
| No unexplained empty verdict anywhere | | |

---

## Handover (filled at the end; each item = fact, impact, the decision needed)

## Incidental findings (recorded, not fixed)

| # | Finding | Where | Note |
| --- | --- | --- | --- |
