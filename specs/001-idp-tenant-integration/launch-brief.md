# Launch brief — ACME-2040 Sign-in and tenant integration with the group platform

Form: the launch brief of spec-driven-dev-playbook (`templates/sdd-launch-prompt.md`), in its seven
parts.

Written: 2026-09-30, before the SDD session / by: the author. Revised the same day, before the goal pack
went to the run: parts 1, 3, 4, 6 and 7 put into the playbook's form, F8–F10 added, and C6–C7 added
when the permissions section of the spec showed that the roles decided nothing (research R-17). The
agent reads this brief first and does not re-investigate the settled facts.

## 1. Settled facts (do not re-investigate)

| # | Fact | Source | Measured or read on |
|---|---|---|---|
| F1 | The design this demo reproduces: authorisation code + PKCE (S256) sign-in ending in the app's own session; platform Bearer tokens accepted on the existing API with an in-memory principal only; roles re-derived at every sign-in (union → mapping table → replace, written only when changed, unmapped → lowest role with a warning); signed webhooks stored first and processed asynchronously; tenant sync with claims and tombstones; hourly device pulls; one visibility registry; everything default off | the author's case study 01 (public): https://github.com/MuneAkira6/engineering-case-studies/blob/main/01-platform-integration.md | 2026-09-30 (read) |
| F2 | The stand-ins: Keycloak for the platform's IdP (one realm per tenant, so the issuer names the tenant; client roles in `resource_access`; service accounts for client credentials; realms imported from JSON), a mock platform for events, the tenant API and the device API, MongoDB 7 for the app's data | the approved design of this repository | 2026-09-30 (read) |
| F3 | Docker 28.1.1 and Compose v2.35.1 are available to the account that runs the implementation | [facts.md](facts.md), F3 | 2026-09-30 |
| F4 | Keycloak 26.7.4, the newest stable tag, and `mongo:7` (7.0.43) are on the host | [facts.md](facts.md), F4 | 2026-09-30 |
| F5 | Ports 18400–18419 and 18480 are free; the ports in use belong to other services | [facts.md](facts.md), F5 | 2026-09-30 |
| F6 | Playwright 1.63.0 refuses this Ubuntu 20.04 host; 1.62.1 installs Chromium 151 and opens a page | [facts.md](facts.md), F6 | 2026-09-30 |
| F7 | Node v24.19.0; pnpm 11.28.0 through `packageManager` | [facts.md](facts.md), F7 | 2026-09-30 |
| F8 | Rsbuild 1 stops the install under the supply-chain settings (a core-js build script) | [facts.md](facts.md), F8 | 2026-09-30 |
| F9 | Rsbuild 2, React Router 8 and the MongoDB driver 7 install with no build script | [facts.md](facts.md), F9 | 2026-09-30 |
| F10 | The host has no Java and no MongoDB shell | [facts.md](facts.md), F10 | 2026-09-30 |

## 2. Constraints that shape the spec

- Demo scale: two integrated tenants and one tenant that is not integrated; a handful of users and
  devices each. Synthetic data only; the product is Acme Tasks, and no name or figure from the author's
  work appears.
- Default off (constitution VI): the tenant that is not integrated must behave exactly as before, with
  its own password sign-in, and every integration path is refused until it is configured.
- Everything runs locally: Keycloak and MongoDB with Docker Compose, the Node services from the
  workspace.
- The ticket ACME-2040 is input. Its acceptance criteria reach the spec only through the disposition
  table, and the spec decides (constitution II).
- The spec describes what and why, not how: no framework, library or endpoint names in spec.md.

## 3. Questions for a human, one at a time

The agent does not answer these. Each goes to a human with a recommendation and its reason, and the
answer is recorded in spec.md, Clarifications, before planning.

| # | Question | Options (the recommendation first) | Work that stops until it is decided |
|---|---|---|---|
| C1 | How is the application's own session kept after a platform sign-in? | a server-side session with an opaque cookie / a signed cookie with no server state / the platform token forwarded to the browser | the session design (research R-5), FR-003 |
| C2 | What happens to a platform role that has no mapping in the application? | the lowest role and a warning / refuse the sign-in / ignore the role | role derivation (T029) |
| C3 | What does deleting a tenant on the platform do to its data in the application? | a tombstone: access refused, data kept for 30 days / delete at once / deactivate, restorable | tenant sync (research R-9) |
| C4 | How are hourly timers and 30-day expiries verified without waiting for them? | an injected clock in tests, the real intervals in the running system / wait for the real timer once more / shorten the defaults | every test of hourly and 30-day behaviour |
| C5 | What does an integrated tenant no longer see, and where do its users land? | hide the functions the platform owns and land on the task board / hide nothing and show a notice / hide the whole administration area | the visibility registry (contracts/web.md) |
| C6 | What may each application role do? | three tiers / two tiers / no difference | the permission check (FR-033) |
| C7 | Where do the roles of a caller with a platform token come from? | from the token, on every request / the stored roles / always `member` | the permissions of the token path (FR-034) |

C6 and C7 were added on 2026-09-30, when the permissions section of the spec showed that the first
draft gave the roles nothing to decide.

## 4. Steps

1. constitution: the seven principles in `.specify/memory/constitution.md`.
2. specify: `spec.md`, with the permissions section and the ticket's disposition table.
3. clarify: C1–C7, one at a time; the answers go to spec.md, Clarifications.
4. plan: `plan.md` through the seven constitution gates, with research, data model, contracts and
   quickstart; the measured facts in `facts.md`.
5. tasks: `tasks.md`, with the manual and logical verification checklists.
6. analyze: `analyze.md`; every finding remediated before the implementation.
7. goal pack: `goal-pack/`, made from the spec as `goal-pack/from-spec.md` records.
8. implement: the unattended run of goal-bus-kit, which judges every row of `goal-pack/PROGRESS.md`.

## 5. Verification rules

- Every row is judged PASS / FAIL / BLOCKED / DEFERRED with quoted evidence; a FAIL reads
  "expected X / actual Y".
- A precondition the environment cannot produce is BLOCKED, and so is a result that needed the
  environment fixed by hand.
- A guard counts only after its test has been seen red without it: the uniqueness of first contact,
  the signature check, the timestamp window, the refresh classification, the loop guard and the
  permission check.
- A verdict counts when two consecutive runs agree.
- The build under test is pinned: each goal records the commit, a fingerprint of the working tree and
  the image digests before its first verdict.
- An annotated PASS keeps its note in the row. A split verdict counts once per arm, so each goal's table
  ends with its tally of rows and of verdicts.

## 6. Constitution articles in force

- I, Agents Never Touch Branches: the spec folder is named explicitly, and nothing in the run creates
  or switches a branch. The exception about commits at goal boundaries is recorded in the constitution.
- II, The Spec Folder Is the Requirement: ACME-2040 is input, and its criteria reach the spec only
  through the disposition table.
- III, Humans Decide the Open Questions: C1–C7.
- IV, Measure Before Asserting: F3–F10 are measured with their commands, and Keycloak's token shapes are
  measured in G0 before G1 depends on them.
- V, Verdicts Rest on Evidence: every guard has a control, the permission check included.
- VI, Default Off, One Session Downstream: the tenant that is not integrated is the baseline of every
  goal.
- VII, Contracts Freeze Before Parallel Work: `packages/contracts` is frozen in G0 and rewritten as
  AS-BUILT in G6.

## 7. Finishing checklist

- [x] spec.md has no open clarification marker and records the answers to C1–C7
- [x] every row of the disposition table has a disposition, and every change and exclusion its reason
- [x] the permissions section says what each role can and cannot do, and where that is decided
- [x] plan.md passes the seven constitution gates
- [x] the contracts are named and shaped, for the run to freeze in G0
- [x] tasks.md carries the manual and logical verification checklists and what they do not cover
- [x] analyze reports no unresolved finding
- [x] every row of the goal pack traces to the spec, and the counts are reconciled in
      `goal-pack/from-spec.md`
