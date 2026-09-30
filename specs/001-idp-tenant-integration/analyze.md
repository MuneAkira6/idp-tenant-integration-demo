# Analysis report: spec ↔ plan ↔ tasks (before implementation)

2026-09-30. Read-only cross-check of [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md),
[contracts/](contracts/api.md), [quickstart.md](quickstart.md) and [tasks.md](tasks.md) against the
constitution. Each finding was then remediated in tasks.md; the new tasks got new ids (T057–T064) so the
existing ids stay stable.

## Findings

| ID | Severity | Where | Finding | Remediation |
|---|---|---|---|---|
| A1 | HIGH | FR-005, US1 scenario 5, T016 | Deriving the tenant from `iss` and ignoring the Host header is a security property, but no task tests it: a spoofed Host could pass unnoticed | T057: a test sends a valid sign-in for `tenant-a` with `Host: tenant-b.localhost` and must land in `tenant-a` |
| A2 | MEDIUM | FR-006, T018 | Logout ending both sessions has no test | T058: after logout, the application session is gone and the IdP session no longer silently signs the browser in |
| A3 | MEDIUM | FR-007, US2 scenario 3 | "A session decides, the token is ignored" has no test | T059: a request with a session of Alice and a token of Bob runs as Alice |
| A4 | LOW | FR-016, data-model `deliveries` | Forgetting delivery ids after 30 days relies on a MongoDB TTL index, whose deletion runs on the server's clock and cannot be driven by the injected clock | T060: assert the index (`expireAfterSeconds: 0` on `expiresAt`) and that `expiresAt` = `receivedAt` + 30 days; say in the test that the deletion itself is MongoDB's |
| A5 | MEDIUM | FR-018, T035 | Subscription registration from the route table has no test | T061: after start-up, the mock's `GET /subscriptions` lists every event type with the callback URL of the tagged route |
| A6 | LOW | FR-023 | The device pull "when the tenant is created" is implemented but not tested | T062: a `tenant.created` event leads to a pull without the clock advancing |
| A7 | LOW | FR-032 | Nothing checks that the running system is wired with the real intervals | T063: a test of the production wiring reads the scheduled intervals (1 h pick-up, retry and pull; 30-day expiries) |
| A8 | MEDIUM | SC-001 | The 10-second sign-in target has no measurement | T064: the sign-in e2e records the time from start to the landing page and asserts it is under 10 s, twice |

## Coverage after remediation

- Every FR-001 to FR-032 has at least one implementing task and one test task.
- Every SC-001 to SC-008 has a test that measures it (SC-002, SC-003 and SC-007 with a control).
- Constitution: I (no branch step anywhere), II (every task cites the spec), III (five clarifications
  recorded), IV (T005 measures the token shapes before G1), V (controls in T017, T023, T031, T049), VI
  (T008, T019), VII (T006 freezes, T054 rewrites AS-BUILT) — no violation.

## Consistency notes (no change needed)

- contracts/web.md hides a tab and a section in addition to the three pages; both belong to the password
  and invitation functions the clarification names.
- "The tenant that is not integrated" is `local` everywhere; the lowest role is `member` everywhere; the
  ports agree across plan, research, contracts and quickstart.

## Result

8 findings (1 HIGH, 4 MEDIUM, 3 LOW), all remediated before implementation. No open finding.

## Round 2 (2026-09-30, after the alignment with the playbook)

The same read-only cross-check, repeated after the folder was put into the playbook's forms (research
R-17), with the new artifacts included: facts.md, the permissions section and the disposition table of
spec.md, and the verification checklists of tasks.md. The new tasks got new ids (T065–T070) and the new
requirements new numbers (FR-033–FR-035, SC-009), so every existing id stays stable.

| ID | Severity | Where | Finding | Remediation |
|---|---|---|---|---|
| A9 | HIGH | US3, FR-011–FR-013; the ticket's criterion 7 | Roles were derived from the platform but decided nothing: no operation depended on a role, and the ticket's "permissions follow the roles" had no requirement. Found by filling in the permissions section of the spec addendum | The Permissions section, US9, FR-033–FR-035 and SC-009; the tiers and the token path's roles decided by a human (C6, C7); Q16–Q18 with two controls; T065–T070 |
| A10 | MEDIUM | the goal brief's facts; F10 | "The host has no Java and no MongoDB shell" was stated without a measurement (constitution IV) | Measured on 2026-09-30 and recorded as F10, with its command and output |
| A11 | MEDIUM | tasks.md, the verification lines of each phase | The verification items had no ids, and four logical items had no row in the goal ledger (no secret in the repository; every integration path checks its setting first; one mapping table; no failure writes `lastSuccessAt`) | The checklists M1–M12 and L1–L12, each naming its ledger row; check rows added to the goal ledger for L1, L4, L6, L7 and L10 |
| A12 | MEDIUM | the goal ledger, AC-39 | The traceability row covered FR-001–FR-032 and SC-001–SC-008 only | AC-39 now covers FR-001–FR-035 and SC-001–SC-009 |
| A13 | LOW | constitution I; the unattended run | Principle I has humans commit at goal boundaries, which nobody can do during an unattended run | An exception recorded in the constitution, with its reason and the condition that ends it (version 1.1.0) |
| A14 | LOW | T004; Q16 | Q16 needs one user of each application role in `tenant-a`, and the seeded users did not provide them | T004 seeds one user per role in `tenant-a` |
| A15 | LOW | research.md | R-16 stood before R-15 | Reordered; no id changed |

Coverage after remediation:

- Every FR-001 to FR-035 has at least one implementing task and one test task.
- Every SC-001 to SC-009 has a test that measures it (SC-002, SC-003, SC-007 and SC-009 with a control).
- Every adopted or changed criterion of the ticket leads to at least one FR (the disposition table of
  spec.md); the two excluded criteria lead to none.
- Constitution: re-judged in plan.md, all seven gates passed; the one exception is recorded.

Round 2: 7 findings (1 HIGH, 3 MEDIUM, 3 LOW), all remediated before implementation. No open finding.
