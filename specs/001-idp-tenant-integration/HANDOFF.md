# Handover: sign-in and tenant integration with the group platform

Form: the handover of spec-driven-dev-playbook (`templates/HANDOFF.md`), in its eight parts and this
order. A part with nothing to say says "None".

**Updated**: 2026-09-30
**Owner**: unassigned — the implementation run has ended and nobody is carrying this forward yet
**Next step**: part 8, one item

*(Part 1 is these four lines: title, updated, owner, next step.)*

## 2. The current state, in one sentence

The feature specified in `specs/001-idp-tenant-integration/` is built and verified end to end: 84 rows
of `goal-pack/PROGRESS.md` are judged across seven goals, with no FAIL and one BLOCKED arm that a
later goal satisfied, and the running system performs every behaviour FR-001 to FR-035 name on a local
stack of Keycloak 26.7.4 and MongoDB 7.

## 3. Decisions not to reopen

Cited by id; the reasoning is in the file named, and is not restated here.

| Id | Decision | Date | Where the reason is |
|---|---|---|---|
| C1 | The application session stays on the server; the browser holds an opaque cookie and the platform tokens are encrypted at rest | 2026-09-30 | spec.md, Clarifications |
| C2 | A platform role with no mapping yields the tenant's lowest role, with a warning naming it | 2026-09-30 | spec.md, Clarifications |
| C3 | Deleting a tenant leaves a tombstone; data is kept 30 days and then removed | 2026-09-30 | spec.md, Clarifications |
| C4 | Production keeps the real intervals; tests advance an injected clock and say so | 2026-09-30 | spec.md, Clarifications |
| C5 | An integrated tenant hides password management, invitations and tenant deletion, and lands on the task board | 2026-09-30 | spec.md, Clarifications |
| C6 | Three permission tiers, decided on the server for each operation | 2026-09-30 | spec.md, Clarifications (second round) |
| C7 | A caller with a platform token gets the roles that token maps to, in memory, never written | 2026-09-30 | spec.md, Clarifications (second round) |
| R-1 | Keycloak with one realm per tenant, so the issuer names the tenant | 2026-09-30 | research.md |
| R-2 | The token shapes are measured in G0, not taken from documentation | 2026-09-30 | research.md; facts.md F12–F16 |
| R-8 | A partial unique index over `{tenantId, platformSubject}` is the first-contact guard | 2026-09-30 | research.md |
| R-9 | Tenant events apply only if newer than the last applied change; tombstones, not hard deletes | 2026-09-30 | research.md |
| R-10 | Playwright is pinned at 1.62.1 because 1.63.0 refuses this host | 2026-09-30 | research.md; facts.md F6 |
| R-16 | Rsbuild 2, React Router 8, MongoDB driver 7, chosen by measurement under the supply-chain settings | 2026-09-30 | research.md; facts.md F8, F9 |
| R-18 | One permission table, one check per request, before the handler | 2026-09-30 | research.md |

## 4. Verdicts

84 rows across G0–G6, judged with evidence in `goal-pack/PROGRESS.md`. Per goal:

| Goal | Rows | Verdicts | PASS | FAIL | BLOCKED | DEFERRED |
|---|---|---|---|---|---|---|
| G0 | 10 | 10 | 10 | 0 | 0 | 0 |
| G1 | 13 | 14 | 13 | 0 | 1 | 0 |
| G2 | 19 | 19 | 19 | 0 | 0 | 0 |
| G3 | 11 | 11 | 11 | 0 | 0 | 0 |
| G4 | 13 | 13 | 13 | 0 | 0 | 0 |
| G5 | 8 | 8 | 8 | 0 | 0 | 0 |
| G6 | 10 | 10 | 10 | 0 | 0 | 0 |
| **Total** | **84** | **85** | **84** | **0** | **1** | **0** |

Four rows are annotated PASSes and count as one PASS each: G0 E3 (the stack is brought up by
`pnpm stack:up`), G1 AC-4 (the unreachable IdP is a closed port, not a stopped Keycloak), G1 AC-7 (the
token and event arms are proved at the fail-closed entry points) and G2 AC-11 (the control drops both
unique indexes, and the interleaving is forced).

### Every BLOCKED of the run

**G1, check L4 — "every integration path checks its setting before anything else".** Judged
`PASS (sign-in, Bearer, webhook) / BLOCKED (device pull)`. At G1's pin the device pull did not exist,
so there was no first line to quote: `ls apps/api/src/devices` reported the directory absent and
`devicePullAvailable` had no caller.

**Satisfied in G4, and this is where that is recorded.** The condition the G1 row named is now met:
the first statement of `pullDevices` is

```
apps/api/src/devices/pull.ts:33:  if (!devicePullAvailable(config)) return { status: 'off' }
```

and it precedes the source URL, the token request and the first page. It is observed as well as read,
in `apps/api/test/devices.test.ts` (AC-29): with the flag on, the hourly `devices.pull` job pulls 450
devices; with the flag off, the same job still runs and pulls nothing — `devices` 0 and
`deviceSyncStates` 0 — and a direct `pullDevices` returns `{ status: 'off' }`. G1's own row is left as
it was written: it records what was true at `tree 1e5fd772f998`, and a ledger that is edited after the
fact stops being evidence.

### Every DEFERRED of the run

**None.** No row of any goal was deferred: no question of scope, security or what the user sees
blocked a verdict. One such question was *raised* during the run and is in part 7 as an open question
rather than as a deferred row, because no acceptance row depends on it.

## 5. What is left in the environment

**Nothing of the run is left.** It was all removed in G6, and the removal is itself a verdict row in
`goal-pack/PROGRESS.md`. Part 4 above records the one BLOCKED arm and that there are no DEFERRED rows.

| What the run created | Where | State now | How it was removed |
|---|---|---|---|
| Compose project `acme-idp-demo`: two containers, one network, the `mongo-data` volume | Docker on the host | gone — `docker ps -a`, `docker volume ls` and `docker network ls` filtered by the project each print nothing | `bash scripts/stack.sh down -v` |
| Generated secrets: the Keycloak administrator password, the seeded users' passwords, seven client secrets, `LOCAL_SEED_PASSWORD` | `${TMPDIR:-/tmp}/acme-idp-demo.env`, mode 600 | gone | `rm -f "$(bash scripts/stack.sh env)"` — run **after** the teardown, because that command recreates the file if it is absent |
| The fresh clone AC-36 ran from | `${TMPDIR:-/tmp}/acme-idp-clone` | gone | `rm -rf` |
| Listening ports | 18400–18419, 18480 | none — the host is back to `22 53 139 445 631 3128 3350 3389`, exactly the list facts.md F5 recorded before the run | the services stop with the tests that start them |

Two things stay, and neither belongs to this run: the images `quay.io/keycloak/keycloak:26.7.4` and
`mongo:7`, which facts.md F4 records as already present (the run pulled nothing), and Playwright's
Chromium in the directory `PLAYWRIGHT_BROWSERS_PATH` names, which F6 records as already installed.

Two realm changes were made during G2 and restored inside G2, not left for the closing: dave's client
roles in `tenant-a`, and an extra signing key in `tenant-b`. Both restorations were verified
afterwards, and both are rows of the Environment change ledger in `goal-pack/PROGRESS.md`, which now
has no open row.

## 6. Messages drafted and waiting to be sent

None.

## 7. Remaining work, per person who does it

**A human, before anything else — the commits.** The run never committed (constitution I). The working
tree holds the whole implementation as untracked and modified files, and `goal-pack/PROGRESS.md`
carries one proposed commit message per goal in its change list. Each message should be checked
against the change it describes before it is used.

**A human — one open question about what the user sees** (constitution III; Incidental finding 6).
The web client's header renders `tenant-a` and the word `true` as unlabelled text and offers a
"Sign in" button to a user who is already signed in. The values are correct and the e2e tests read
them; what is undecided is the labelling, the wording and whether that control should be a sign-out.
The spec says nothing about any of it, so the run recorded it and invented no default. No verdict
depends on it.

**Whoever maintains this next — six findings worth knowing.** All of them are in the Incidental
findings table of `goal-pack/PROGRESS.md` with their measurements; they are listed here because they
are the kind of thing that is expensive to rediscover.

1. **A 30-day `setInterval` does not do what it looks like.** Node clamps any delay above 2³¹−1 ms to
   **1 ms**, so the 30-day expiry job of FR-032 ran about a thousand times a second instead of monthly.
   Measured directly: `TimeoutOverflowWarning: 2592000000 does not fit into a 32-bit signed integer.
   Timeout duration was set to 1.` and 45 firings in 50 ms. `systemClock().every` now counts long
   intervals down in slices; `apps/api/src/clock.ts` and two tests in `apps/api/test/clock.test.ts`.
   Anything else on this codebase that schedules a long interval should use that clock and not
   `setInterval`.
2. **`resource_access` is in the access token, not the ID token** (facts.md F18). The authorisation
   code flow verifies the ID token, so deriving roles from it looked right and produced an empty role
   set for every user, which the permission check turned into 403 everywhere.
3. **`refreshSession` had no production caller** from G1 until G4. The classification of FR-004 was
   correct and tested the whole time, but nothing in the running system invoked it; it is now the
   hourly `sessions.refresh` job of `apps/api/src/scheduler.ts`. A guard with no caller passes its own
   tests indefinitely.
4. **`config.webhookSecrets` is keyed by the environment variable's name, not by the event type**, so
   that a secret can exist for a type the application does not handle — which is the `ignored` case
   contracts/api.md requires. Keying it by the known types made that case unreachable.
5. **`_id` was typed `unknown` on three documents** in `apps/api/src/db.ts`, which no real caller could
   insert. data-model.md always said `ObjectId`; the code now matches it.
6. **The documented start sequence did not reproduce from nothing.** It had no `pnpm seed` step, and
   `pnpm seed` would have failed anyway because nothing sourced the env file. One test asserts the
   **live** `acme_tasks` database — `local`, 3 users, 4 tasks — because that is the FR-031 baseline,
   and nothing in the sequence created it. Measured: with `acme_tasks` dropped the file gives
   `Tests  3 failed | 3 passed (6)`; after `pnpm seed`, `Tests  6 passed (6)`. Fixed in
   `scripts/stack.sh`, `package.json`, README §2 and quickstart §2. It was invisible for five goals
   because every one of them ran against the stack G0 had seeded.

**Nobody, unless the scope changes.** The two ticket criteria the spec excluded — inviting users from
an integrated tenant, and SAML — are excluded with their reasons in spec.md's disposition table.

## 8. The first thing the next person does

Commit the working tree, one commit per goal, using the proposed messages in
`goal-pack/PROGRESS.md` and checking each message against the change it describes. Nothing else can
be reviewed, bisected or reverted until that is done.

---

**After the run (2026-10-01, by the human who took this over).** Part 8 is done, as one commit rather
than seven, because every goal touched files later goals changed again; the open question of part 7
is decided (a labelled header with Sign out); AC-36 was re-run from a fresh tree, twice, green. The
details are in `goal-pack/SCOPE.md`, "Changes after the run". The parts above are left as the run
wrote them.
