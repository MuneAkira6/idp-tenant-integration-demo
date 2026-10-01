# Bus memory — idp-tenant-integration-demo

**This is a complement, not a summary.** Anything in PROGRESS.md, BUS-LOG.md, the goal brief or the spec
folder does not belong here. When a later measurement corrects an entry, come back and rewrite it.
Marks: 🆕 new · ✅ verified · 🔴 warning · ~~struck~~ no longer true.

## Environment facts across goals

- 🆕 The measured facts of this host are entries F3–F10 of `specs/001-idp-tenant-integration/facts.md`,
  each with its command and output; cite them by id. The run appends its own from F11 on.
- 🆕 An HTTPS proxy is configured through environment variables. Nobody unsets or prints them.
  Every `curl` against the stack needs `--noproxy '*'`; the worker does this and it works.
- 🆕 The run uses its own Claude configuration directory: no user-level skills, memory or MCP servers.
  The project's `.claude/skills/speckit-*` exist but belong to the finished SDD phase.
- ✅ **The stack is up and must stay up between goals** (G6 removes it): `acme-idp-demo-keycloak-1`
  (healthy, `127.0.0.1:18480`) and `acme-idp-demo-mongodb-1` (healthy, `127.0.0.1:18417`). I confirmed
  both with `docker compose -p acme-idp-demo ps` after G0.
- ✅ **`docker compose up -d` alone does not work.** `compose.yaml` uses `${KC_BOOTSTRAP_ADMIN_USERNAME:?…}`
  and `${…PASSWORD:?…}`, so without `--env-file` Compose errors out — the failure is harder than "the
  clients lack their secrets", which is how G0's E3 annotation reads. `pnpm stack:up` is the whole
  command. quickstart.md §2 still says the bare form; G6 rewrites it (Contract changes, 2026-09-30).
- ✅ **The secrets live at `/tmp/acme-idp-demo.env`** (mode 600), regenerated per run by `scripts/stack.sh`
  and pushed into Keycloak by `scripts/provision.ts`. It holds no `TOKEN_ENC_KEY` and no
  `PLATFORM_ISSUERS` — correct, because default-off is the G0 state. This file is state left outside the
  repository: it belongs in G6's HANDOFF part 5, and the Environment change ledger in PROGRESS.md is
  still empty.
- ✅ **`pnpm e2e` exists from G1** (the runbook says "from G5"; T064 forced it earlier). `playwright.config.ts`
  starts the API itself on 18400 with `MONGO_DB=acme_tasks_test_e2e` and a random `TOKEN_ENC_KEY`, and a
  global teardown drops that database. It reads the secrets from `/tmp/acme-idp-demo.env`. It leaves a
  `test-results/` directory behind — I created one myself by running it and removed it again.
- ✅ Tests use throwaway databases `acme_tasks_test_<name>`, dropped on open and on close
  (`apps/api/test/helpers.ts`); `vitest.config.ts` sets `fileParallelism: false`. Running `pnpm test`
  myself is safe and leaves nothing: after two runs the stack held only `acme_tasks`, `admin`, `config`,
  `local`.
- ✅ `loadConfig(env = process.env)` takes its environment as an argument. That is how one run can hold
  both a configured row and a default-off row; nothing needs the process environment.

## Doubts to re-check

- ~~G0's per-file test counts are wrong in two evidence cells.~~ Corrected at the start of G1, with the
  reporter command quoted in both cells. My G1 recount reconciled every file exactly (88 tests, 10 files).
- ~~`refreshSession` has no production caller.~~ **Closed in G4**, the run's longest-carried debt
  (opened G1, closed G4). Exactly one production call site: `apps/api/src/scheduler.ts:55`, on the
  hourly `sessions.refresh` job, taking only sessions whose `refreshRetryAt` has passed. I verified the
  grep myself. FR-004 is now a behaviour the running system performs.
- 🔴 **G3's AC-20 evidence contains two sentences G4 falsified**, and they are still there: "this
  implementation never writes `'pending'`" (G4 writes it — see the Contract changes row) and
  "`start()` awaits its own `sweep()` before it schedules anything" (the inbox no longer schedules;
  the scheduler owns the hourly sweep — Incidental finding 4). I **accepted** this: under the run's own
  convention a goal's evidence describes the build it was pinned on, and both transitions are recorded
  in the run-wide tables naming G3's earlier statement. But **G6 must not carry the stale sentences
  into the AS-BUILT contracts or the FR-017 traceability row**; it is on the G6 list below.
- 🔴 ~~`refreshSession` has no production caller~~ (kept for the pointer below) `grep -rn 'refreshSession(' apps/api/src` finds only
  its own definition; every call site is a test. FR-004's classification is implemented, tested and
  controlled, but nothing in the running system invokes it, so today it is dead code. No G1 row claims
  wiring, so this did not sink AC-4. **Check it in G4** (AC-31 / T063, "the production wiring schedules
  1 h pick-ups, retries and pulls"): `refreshRetryAt` is set an hour out, which implies an hourly retry
  that AC-31 should own. If it is still uncalled at G6, FR-004's traceability row cites a behaviour the
  running system never performs — that would be a real FAIL, not a debt.
- ~~AC-7 was passed before the code that could break it existed.~~ Re-proved in G2 with two controls in
  `default-off.test.ts` (guarded: `fetchCount` 0; unguarded: `fetchCount` 1 and the refusal comes from
  the issuer lookup instead). **G3 still owes the same for events**, after T033.
- ~~G3 was REJECTED once, on the record and not on the engineering.~~ Resolved in one turn: Incidental
  findings row 3 now records the `config.webhookSecrets` re-keying, and it is fuller than I asked —
  it also explains that the old shape made AC-23's `tenant.renamed` case unreachable, which is what
  made the change necessary rather than cosmetic. I confirmed G3's eleven PASS verdicts, its tally and
  its build pin were untouched and that no code or spec file moved. The worker accepted the rejection
  without argument and proposed the gate itself. **The REJECT worked; that is why the threshold is worth
  keeping.**
- ~~quickstart §4's first-contact control is wrong as written, and that is not yet recorded as a
  contract change.~~ Recorded by the worker as the third Contract changes row, with AC-11's annotation
  extended to name both conditions.
- 🔴 **quickstart §4's first-contact control was wrong as written** The spec says "Q6 with the index dropped → more than one user"; G2 measured that
  dropping R-8's partial index alone still yields **one**, because `users_tenant_email_unique` catches
  the same race. Only dropping both gives 8. quickstart.md is a given file the worker may not edit, so
  the Contract changes table is where it belongs. I required the row at the start of G3.
- 🔴 **AC-7 was passed before the code that could break it existed.** The Bearer and webhook paths refuse
  in *both* branches today, so "every token and event is refused" is partly true by absence. It is not
  vacuous — the tests assert the guard's exact message, and removing the guard flips the message to
  "not built yet" and fails them — but the guard's real test comes when verification exists. **G2 (after
  T024) and G3 (after T033) must re-prove Q15**, with the guard removed as a control.
- 🔴 `apps/api/src/auth/password.ts` returns internal reasons `not_integrated_only` and `unknown_tenant`,
  neither of which is in the frozen `API_ERRORS`. No route exists yet, so nothing is broken. When G1
  wires `POST /auth/password`, the HTTP body must carry a frozen code; if a new code is genuinely
  needed, that is a contract change with its reason, not a quiet addition.
- 🔴 The mock's `/__control/deliver` and `/__control/redeliver` answer `501 not_implemented` naming T036.
  Honest scaffolding, but G3 must replace both, and G3's check M8 needs `/__control/log` to be real.

## The worker's habits

- ✅ Honest about its own limits: it disclosed the build-under-test circularity itself, annotated E3
  rather than claiming the bare command works, and left the mock's unwritten controls as a loud 501
  instead of untested code. Evidence quotations I spot-checked were real observations, not paraphrase.
- 🔴 **Counts enumerated inside prose are not reliable** (see above). Totals quoted straight from a
  command are.
- 🆕 Writes long, well-sourced evidence cells. The risk is not invention, it is a number transcribed
  from memory in the middle of a true paragraph. Recount; do not skim. (In G1 every count reconciled.)
- ✅ Acts on instructions precisely and reports substitutions rather than hiding them: the closed port
  for AC-4, the `waitForRequest` substitution in AC-1, the L4 split. It also under-claims sometimes —
  the AC-7 annotation is more pessimistic than the tests it describes.
- ✅ Finds real defects by measuring rather than reasoning, and reports the inconvenient half. G2's two
  best findings (F18, and the second index doing the guard's job) both made its own earlier work look
  worse, and it wrote them up anyway. Reward this; do not let a review punish disclosure.
- ✅ **The gate held in G4.** Both defects were in Incidental findings (rows 4 and 5) *before* the
  report, in the template of row 1, and the `'pending'` producer went into Contract changes. This is
  the behaviour the G3 REJECT was for; it took one rejection to fix a three-goal habit.
- ✅ **It finds latent defects that no row asked about** and reports them against its own earlier work:
  the `setInterval` clamping (G0's clock, unreachable until G4 wired a real scheduler) and the double
  hourly sweep (its own G3 inbox). Neither was on any checklist.
- 🔴 **It records a finding where it found it, and does not always propagate it** to the annotation a
  reader scans or to the table that owns it. G2: the index finding is in the evidence cell and the test
  comment, but not in AC-11's annotation nor in Contract changes. Distinct from the habit below — the
  ledger does say it, just not in the right place.
- 🔴 **Three times it has told the bus something the ledger does not say.** G0: the two counts. G1: the
  `db.ts` `_id` change. G3: the `config.webhookSecrets` re-keying. Every one was an honest disclosure in
  its final message, and every one belonged in PROGRESS.md, which is the auditable record — my messages
  are not, and I rotate. I warned after G1 that a third would be a REJECT, and I rejected G3 for it.
  **The threshold has now been enforced once; keep enforcing it.** The tell is a sentence in the
  worker's message beginning "one thing I changed" or "also worth your attention" that has no
  counterpart in the ledger — always grep PROGRESS.md for it before believing it is recorded.

## Proven along the way — later goals may cite

- ✅ **The token shapes are real, and I measured them myself**, not from the worker's report: for
  `tenant-a`, alice's `aud` is the **string** `"acme-tasks-api"` and carol's is the **array**
  `["acme-tasks-api","acme-reports"]`; both carry `azp: "acme-tasks"`, `iss`
  `http://localhost:18480/realms/tenant-a`, header `kid rTo4HOV-RnHukBS3dMuKSoJmJvQIMI8Uvi7KMVezO4M`,
  `alg RS256`; carol's `resource_access` spans both clients. F13 and F16 are trustworthy. **G2's
  audience check must accept a token whose `aud` array merely contains the audience**, and the second
  entry is the *client id* `acme-reports`, not another API.
- ✅ The three discovery documents answer with their own issuers (I fetched all three).
- ✅ `packages/contracts` does not drift from the spec. I compared, line by line: `PERMISSION_TABLE`
  against data-model.md's four operations, `visibility.ts` against contracts/web.md's three hidden
  pages / one tab / one section and the two landings, `API_ERRORS` against contracts/api.md's codes, and
  `db.ts`'s indexes against data-model.md. `ROLE_MAPPING` and `PERMISSION_TABLE` are each defined once.
- ✅ `audiences()` in `packages/contracts/src/tokens.ts` reads both measured forms of `aud`.
- ✅ The gates are real and complete: all 24 tracked `.ts` files are in the `tsc` program (I listed it),
  `strict` and `erasableSyntaxOnly` are on, and `pnpm lint` runs `biome check --error-on-warnings`.
- ✅ No secret is in the repository. I scanned every generated value from the env file against the whole
  tree: 0 hits for all ten. The realm JSONs declare no `secret` and no `credentials`.
- ✅ The `local` baseline in the live database: `{_id: 'local', integrated: false, state: 'active'}`,
  3 users, 4 tasks, 0 sessions. This is the G0 baseline AC-8 compares against.
- ✅ **G1's sign-in works end to end and I drove it in a browser myself**: `pnpm e2e` → `0.24 s` and
  `0.21 s` to the landing request, `{"signedIn":true,"tenantId":"tenant-a","roles":["member"],
  "integrated":true,"landing":"/board"}`. The test fills the real Keycloak form and times from before
  `page.goto`. Nothing listens on 18401 until G5, so the landing is asserted as a navigation request.
- ✅ **First contact deliberately gives `LOWEST_APPLICATION_ROLE`** (`apps/api/src/users.ts`), with
  derivation left to T029 in G2. So the `roles:["member"]` in the e2e output is the default, not a
  derivation: **G2's AC-14 must show roles actually derived from `resource_access`** — carol is the case
  that matters, mapping to `{member, admin}` across two clients.
- ✅ AES-256-GCM is real (`apps/api/src/auth/crypto.ts`, `v1.<iv>.<tag>.<ciphertext>`), and AC-3 does not
  rest on the format check alone: the whole session document and every browser-visible response are
  scanned token by token for a JWS.
- ✅ The AC-4 control is a genuine seam: `classify` is injectable, production defaults to
  `classifyRefreshFailure`, and I confirmed no production call site passes it.
- ✅ **`resource_access` is in the access token and not in the ID token** (F18) — I decoded both for
  carol myself: the ID token has no `resource_access` at all and its `aud` is the client id
  `"acme-tasks"`, while the access token carries both clients' roles and `aud`
  `["acme-tasks-api","acme-reports"]`. Roles must be derived from the access token; the tenant still
  comes from the ID token's verified `iss`. This also corroborates F19.
- ✅ **The G2 seams are sound.** `testControls` is an optional parameter of `buildApi`, is never set by
  `main()` and has no path from the environment — I checked. The three switches
  (`disablePermissionCheck`, `readRolesFromStoredUser`, `skipNotConfiguredGuard`) implement exactly the
  controls quickstart §4 names. AC-11's barrier lives in the test file and wraps the `Collections`
  handed to `findOrCreatePlatformUser`; production code is untouched. `principals` is a `WeakMap`.
- ✅ **L7 is structurally strong, not merely asserted**: `grep -rn "'/api/" apps/api/src` returns
  nothing — no route path literal exists in the API. All four routes go through `apiRoute(operation)`,
  which reads `OPERATION_ROUTES`, and `checkPermission` has exactly one call site, in the `preHandler`
  at `server.ts:393`. L5 likewise: one `headers.authorization`, at `server.ts:119`, reached only after
  the session branch returns.
- ✅ **Both G2 realm changes are genuinely restored** — I queried Keycloak's admin API directly: dave's
  `acme-tasks` roles are `["tasks-manager"]`, and all three realms publish exactly one `use=sig` key
  with the `kid`s F16 records. F16 needs no Superseded box.
- ✅ **G3's event guards are real and I checked their reds myself.** The signature control and the window
  control each show the forged / stale tenant created and the delivery `outcome: 'applied'`, with the
  secret, the body parse, the delivery-id novelty and the other window explicitly ruled out first. The
  raw-bytes test uses a body whose re-serialisation differs and still verifies. AC-19 has two real
  timestamps from one delivery; AC-20 separates the start-up sweep from the hourly one by leaving the
  clock unmoved.
- ✅ **A stored-but-failed delivery is owned by the `{processedAt: 1}` sweep, not by `outcome: 'pending'`**
  — this implementation never writes `'pending'`. G4's retries live on `tenantLookups` with their own
  `nextAttemptAt`, so the two do not overlap. Answered in AC-20's evidence, as I asked.
- ✅ **I drove the web client myself in G5** (own Playwright config in `/tmp/bus-probe`, own screenshots)
  and saw the rendered text, not the assertions: tenant-a lands on `/board` ("Task board / Signed in to
  tenant-a", integrated `true`) and `/settings/password` renders "Not available — This tenant's group
  platform manages this function."; `local` lands on `/home` (integrated `false`) and the same address
  renders the real "Password / New password / Change password" form; a `member` on `/devices` sees
  exactly "You do not have permission to see this page". The behaviour is right. The presentation is
  bare — unstyled, and the shell prints raw diagnostic values.
- ✅ **Node clamps any `setInterval` delay above 2³¹−1 ms to 1 ms** — I measured it myself: a 30-day
  interval fired **43 times in 50 ms** with `TimeoutOverflowWarning`. G0's `systemClock().every` had
  this latent; it was unreachable until G4 wired a real scheduler, so no earlier verdict rested on it.
  Fixed by counting long intervals down in slices of `MAX_TIMER_DELAY_MS` with `unref()`.
- ✅ **G4's wiring is real**: `scheduler.jobs()` registers `inbox.sweep`, `tenantLookups.retry`,
  `devices.pull`, `sessions.refresh` at `3600000` and `expiries` at `2592000000` — the true intervals,
  not shortened. `clock.every` is called from exactly one place, `scheduler.ts:107`. `lastSuccessAt` has
  exactly one write, `devices/pull.ts:95`, in the success branch.
- ✅ **AC-24's ordering is concurrency-safe by construction**: the `occurredAt` vs `platformChangedAt`
  comparison is inside the update's own filter (`$lt`) with an upsert, and the duplicate-key path means
  "the stored change is at least as new" → `ignored`. Not a read-then-write race.
- ✅ `facts.md` grew by 280 insertions and **0 deletions**; only `facts.md`, `SCOPE.md` and `PROGRESS.md`
  are modified, and SCOPE.md's diff is the single FROZEN line.

## What the bus verified itself

**G0 (2026-09-30).** `goal-bus.sh --status`; `git rev-parse --short HEAD` = 314a6e8; `git status --short`;
`git diff --stat` and the removed-line count on facts.md; the SCOPE.md diff; `docker compose -p
acme-idp-demo ps`; the three discovery `issuer`s by `curl`; password-grant tokens for alice and carol
decoded in `/tmp/bus-probe` (header and the R-2 claims only, no signatures, no secrets printed);
`pnpm test` twice (57/57, 6 files, exit 0), `pnpm lint` (exit 0), `pnpm typecheck` (exit 0);
`tsc --listFiles` compared against `git ls-files` for the 24 `.ts` files; a per-file test recount with
vitest's JSON reporter (this is what caught the two wrong counts); my own leak scan of all ten generated
secrets; `mongosh` through `docker compose exec` for the `local` baseline and the database list;
`ss -ltnp` for the run's ports; mtimes of every deliverable against SCOPE.md. I changed nothing and left
nothing behind but `/tmp/bus-probe`.

**G1 (2026-09-30).** `pnpm test` twice (88/88, 10 files, exit 0) and a per-file recount through the JSON
reporter — every figure reconciled; `pnpm lint` (`Checked 45 files`, exit 0) and `pnpm typecheck` (exit 0);
**`pnpm e2e` myself** (2 passed, 0.24 s / 0.21 s, the session JSON above); read `bearer.ts`,
`webhooks/receive.ts`, `crypto.ts`, `users.ts`, `refresh.ts` and the `/auth/login` guard in `server.ts`;
re-ran both of L3's searches and the `classify` search; re-ran the secret leak scan over the G1 files
(0 hits for all ten); `ss -ltnH` (only 18417 and 18480) and `listDatabases` (only `acme_tasks admin config
local`) and the `local` baseline (3 users, 4 tasks, 0 sessions, unchanged). My e2e run created
`test-results/`; I deleted it, so the tree is as the worker left it.

**G2 (2026-09-30).** `pnpm test` twice (126/126, 16 files) plus a per-file recount that reconciled every
one of the sixteen figures; `pnpm lint` (`Checked 53 files`) and `pnpm typecheck`, both exit 0; **`pnpm
e2e` again** to check G1 had not regressed under G2's sign-in change — 0.25 s / 0.20 s, still
`roles:["member"]`, now genuinely derived; decoded carol's ID and access tokens myself to test F18;
queried Keycloak's admin API for dave's roles and every realm's signing `kid`s to verify the
restorations; reproduced the L5, L6 and L7 searches; read `apiRoute`, `authenticate`, the `testControls`
declaration and every use, the production `main()`, and the AC-11 barrier and control bodies; re-ran the
secret scan (0 hits for all ten); checked ports, databases and the `local` baseline. I removed the
`test-results/` my own e2e run created.

**G3 (2026-09-30).** `pnpm test` twice (145/145, 19 files) with a per-file recount that reconciled all
nineteen figures; `pnpm lint` (`Checked 60 files`) and `pnpm typecheck`, exit 0; read the production
webhook path and confirmed the signature is verified over the **raw buffer** (`addContentTypeParser`
with `parseAs: 'buffer'`, `signDelivery(secret, timestamp, rawBody)`, `timingSafeEqual` with a
length check first) — the trap I flagged is genuinely avoided; read all four controls in
`webhooks-controls.test.ts` and confirmed each red asserts the **effect in the data**
(`tenant-forged` and `tenant-stale` going 0 → 1) with the other guards ruled out inline; confirmed
`packages/contracts/src/` has not been touched since G0 (mtimes 16:21–16:27, against 17:38 for
`webhooks/receive.ts`), so `EVENT_TYPES` and `webhookSecretEnvName` were in the original freeze and
there is no contracts drift; confirmed `webhookSecretFor(config, eventType)` keeps its G0 signature, so
G0's E6 evidence is still literally true; checked ports, databases and the `local` baseline.

**G4 (2026-09-30).** `pnpm test` twice (179/179, 24 files) with a per-file recount — all twenty-four
figures reconcile, including `clock` rising 6 → 8 for the two new timer tests; `pnpm lint`
(`Checked 73 files`) and `pnpm typecheck`, exit 0; **reproduced the Node timer clamping myself** (43
firings in 50 ms); grepped `refreshSession(` to confirm the single production caller at
`scheduler.ts:55`; grepped `lastSuccessAt` to confirm the single write at `devices/pull.ts:95`;
confirmed `clock.every` is called only from the scheduler, so the inbox's duplicate timer is really
gone; read the clock fix, the scheduler registration and `tenants/sync.ts`'s ordering filter; checked
ports, databases and that `local` is still `active` with no `purgedAt`, 3 users, 4 tasks, 0 sessions.

**G5 (2026-09-30).** `pnpm test` twice (186/186, 25 files); `pnpm lint` and `pnpm typecheck`, exit 0 —
and I opened the one `info` rather than accepting the ledger's description of it, which is how the false
sentence was found; `pnpm e2e` myself (8/8, with `1 return … 0.17 s` green and `6 returns … 0.43 s`
control reproduced exactly); **built my own Playwright config and specs in `/tmp/bus-probe` and drove
the two tenants side by side with screenshots**; reproduced AC-34's three searches and AC-45's two
(no role literal anywhere in `apps/web/src`, one exit to sign-in in `gate.tsx:39`, no anchors); read
`pull.ts:33` to confirm G1's L4 blocked arm is now satisfiable; checked ports, databases and the
`local` baseline. I removed `test-results/`, `playwright-report/` and my `node_modules` symlink.

**G6 (2026-09-30) — the closing review.** I could not re-run `pnpm test` or `pnpm e2e`: G6 correctly tore
the stack down, so AC-36's two passes are the worker's observation. My last independent runs were on
G5's build (186/186 and 8/8, both mine), and G6's only code delta is the seed fix
(`package.json` `scripts.seed`, `scripts/stack.sh`'s `seed` subcommand sourcing the env file) plus the
AS-BUILT header in `packages/contracts/src/index.ts` — I read all of it. What I did verify myself:
**the teardown, three ways** (no container, volume or network by Compose label, by name/image across the
whole host, or by volume name) and that the host's listening ports are now
`22 53 139 445 631 3128 3350 3389`, **byte-for-byte the list F5 recorded before the run began**;
`/tmp/acme-idp-demo.env` gone; `facts.md` at 400 insertions, **0 deletions**, 17 entries, append
beginning at F11; **my own recount of every table** — G0 10, G1 13, G2 19, G3 11, G4 13, G5 8, G6 10 =
**84 rows**, 85 verdicts once G1's split arm is counted twice, exactly as the tallies claim;
FR-001–035 and SC-001–009 each present exactly once in the traceability table with **no gaps in either
range**; `evidence-gate.sh --check` exit 0 over the whole ledger; the README's §5/§6 bullets at **13 and
5**, one for one against `materials/sources.md`'s 13 and 5 rows, with the only proper noun the author's
own case-study link that sources.md directs; HANDOFF's eight parts present and in order with part 6
saying "None"; the five `testControls` switches documented in the AS-BUILT `api.md`; and the
Environment change ledger closed, 4 rows, none open.

## Rulings the bus made

- **The build-under-test pin covers the deliverables, not the ledger.** Writing the evidence necessarily
  moves the tree, so the fingerprint can never be recomputed to the same value afterwards. G0's comment
  under its heading says so. Keep that convention and that comment in every goal; do not treat the
  mismatch as a defect, and do not re-pin merely because PROGRESS.md was written.
- **G0's E3 annotated PASS stands.** The row's subject — both services up, three realms answering — is
  true and I reproduced it; the annotation names the real condition.
- **"Lands on `/board`" in G1 is the URL, not a rendered page.** The web client is G5 (T048+); in G1 the
  observable is the final URL after the callback plus `GET /auth/session`. Building any part of the web
  client early is scope creep, and AC-32 in G5 is where the rendered landing is judged.
- **A closed port inside 18400–18419 is an acceptable stand-in for "the IdP is unreachable"** (AC-4),
  in preference to stopping Keycloak. Q3's wording is a suggestion; the observation is identical and the
  stack the other rows depend on stays up. The annotation must name the substitution, as G1's does.
- **AC-11 stands as an annotated PASS even though the control quickstart §4 words did not go red.** The
  outcome FR-010 requires is proved, the control that goes red (both indexes dropped → 8) is real, and
  the run measured *why* the narrower control does not. The remedy is to propagate the finding, not to
  re-run the goal. R-8's index remains the correct guard: the subject is the stable key, and the email
  index only coincides because a first contact for one subject always carries the same address.
- **`apps/web/.gitignore` holding `dist/` is a deliverable, not an incidental finding.** It is a new
  file of this goal, not a change to an earlier goal's deliverable nor to the given root `.gitignore`;
  AC-35's change-set evidence is the right home. The worker asked; the answer is that its own judgment
  was correct.
- **A REJECT may be purely about the record.** G3's engineering was accepted on the spot and explicitly
  exempted from re-verification; only a missing ledger row was sent back. Word such a REJECT so the
  worker does not re-run anything: name the one row, the completion criterion and the one-turn budget.
- **An internal re-keying behind an unchanged function signature is not a contract change**, so
  `config.webhookSecrets` belongs in Incidental findings and not in the Contract changes table. What
  made it a defect was its absence from the ledger entirely, not the table it was missing from.
- **A test-only seam inside production source is acceptable when it is unreachable from the
  environment and the spec names the control.** `testControls` meets both. G6 should still document the
  three switches as test-only in the AS-BUILT contracts.
- **"Told the bus, not the ledger" is a defect of the deliverable.** PROGRESS.md must stand alone. Twice
  forgiven, with the correction required in the following goal; the third time is a REJECT.
- **The two G0 miscounts do not overturn G0.** The rows' verdicts rest on figures I reproduced; the
  correction is an edit to two evidence cells, not a re-run.

## The run is finished (verdict DONE, 2026-09-30)

84 rows, 85 verdicts: PASS 84, FAIL 0, BLOCKED 1 (G1's L4 device-pull arm, satisfied in G4 and resolved
in the handover), DEFERRED 0. Six reviews passed, one REJECT (G3, on the record, fixed in a turn).
**What is left for a human**: commit the uncommitted tree, one commit per goal, against the seven
proposed messages; decide the presentation question of Incidental finding 6; and note that the
`noUselessFragments` `info` at `apps/web/src/app.tsx:30` was deliberately left so G5's pinned build
would keep matching its evidence. Everything below is the record of how the run went, kept for anyone
who reopens it.

## What G6 owed (all of it landed; kept for the audit trail)

- **Rewrite quickstart.md's two wrong statements** in the AS-BUILT pass: §2 still says `docker compose
  up -d` (it fails outright without the env file), and §4's first-contact control is wrong as measured
  (dropping R-8's partial index alone still yields one user). Both are recorded as Contract changes
  rows; quickstart.md is a given file, so only the G6 AS-BUILT rewrite may touch it.
- **Document the three `testControls` switches as test-only** in the AS-BUILT contracts:
  `disablePermissionCheck`, `readRolesFromStoredUser`, `skipNotConfiguredGuard`, plus G3's
  `skipSignatureCheck` and `unlimitedTimestampWindow`. They are unreachable from the environment —
  say so, and say which quickstart §4 control each one serves.
- **The three Incidental findings must appear in HANDOFF part 4 or 7**, not be dropped: the `db.ts`
  `_id` typing, `refreshSession`'s wiring, the `config.webhookSecrets` re-keying.
- **Environment ledger rows 1 and 2 are still open**: `/tmp/acme-idp-demo.env` and the Compose project,
  both removed in G6 and listed in HANDOFF part 5.
- **Strike the two stale sentences in G3's AC-20 evidence**, or mark them: `'pending'` now has a
  producer (`apps/api/src/tenants/sync.ts`) and the inbox no longer schedules the hourly sweep (the
  scheduler does). The FR-017 traceability row must describe the built system, not G3's snapshot.
- **Resolve G1's L4 BLOCKED** (see above) — the run's only one, with no DEFERRED anywhere.
- **Record the web client's presentation as an open question for a human** (constitution III): the shell
  renders the raw values `tenant-a` and `true` as unlabelled visible text and shows a "Sign in" button
  while already signed in. Nothing in spec.md or contracts/web.md covers labelling, so it is not the
  worker's to settle with a default — it belongs in Incidental findings and in the handover, and the
  README must not imply a finished interface.
- **The role mapping's concrete pairs trace to the realms, not to an FR** — the traceability table
  (AC-39, L12) must not cite an FR for them.
- **Every goal's build pin is a different tree** (G0 `6b86190996e3`, G1 `1e5fd772f998`, G2
  `780dbf0745be`, G3 `1b779e05e74e`), and G0's and G3's evidence describe files later goals changed.
  AC-36's two fresh-clone runs are what reconciles this; do not let G6 claim one pin covers the run.

## Watch closely

- 🔴 **G1's L4 is the run's ONLY `BLOCKED`, and its stated remedy never happened.** Its evidence says the
  device-pull arm "is re-judged in G4 with T046". G4 built the pull (AC-27 to AC-30) but its check rows
  are L9 and L10 — **nobody re-read L4**. I verified the condition is now satisfiable:
  `apps/api/src/devices/pull.ts:33` is `if (!devicePullAvailable(config)) return { status: 'off' }`,
  the first statement of `pullDevices`. G6 must resolve this in HANDOFF part 4 and in the AC-39
  traceability, not carry a stale BLOCKED into the handover. There are **no DEFERRED rows** in the run.
- 🔴 **G5's lint evidence contains a false statement**: it calls the one Biome `info` "Biome's own
  summary line, not a diagnostic". It is a real diagnostic —
  `lint/complexity/noUselessFragments` at `apps/web/src/app.tsx:30:57`, `<>{children}</>`. `info` is
  below the `--error-on-warnings` threshold so the gate is genuinely green, but the sentence is wrong.
  Correction required at the top of G6.
- 🔴 ~~`pnpm e2e` will need the web client running from G5.~~ Handled: `playwright.config.ts` starts both
  servers, and `signin.spec.ts` now also asserts the rendered board. **`pnpm e2e` will need the web client running from G5.** `playwright.config.ts`'s `webServer`
  starts only the API on 18400, and `tests/e2e/signin.spec.ts` asserts the landing as a *request* to
  18401 precisely because nothing listens there (F17). Once T050 makes 18401 live, check whether that
  spec still measures what AC-1 measured, and whether the config now needs a second server.

- 🔴 The recorded token shapes of G0 (facts.md, F11 on) are the truth for G1 and G2; a verifier written
  from documentation instead is a defect even if its tests pass.
- 🔴 Every guard needs its control red: first-contact uniqueness, signature, timestamp window, refresh
  classification, loop guard, the permission check, and the roles of the token path.
- 🔴 Permissions are the server's: one table, one check before every handler. A web client that hides
  a link is not a check (FR-033).
- 🔴 A token's principal gets its roles from the token, in memory; a write to `users.roles` on the token
  path is a defect (FR-034).
- 🔴 Default off: the `local` tenant must give the same results as its G0 baseline in every goal.
- 🔴 Docker only through compose for acme-idp-demo; nothing mounted from outside the repository.
- 🔴 The injected clock is for tests only; the production wiring keeps the real intervals (AC-31).
- 🔴 facts.md grows only by new entries or Superseded boxes; an edited entry is a defect.
- 🔴 The README separates practice from demo exactly as `materials/sources.md` does.
- 🔴 **Stopping the Keycloak container to produce "IdP unreachable" (Q3, AC-4) is a change to the shared
  stack.** If a goal does it, it belongs in the Environment change ledger with its restoration. A closed
  port inside 18400–18419 is the cheaper and safer way to be unreachable.
- 🔴 **A guard can be over-determined.** Before accepting any control, ask what *else* would produce the
  same outcome if the guard were removed. G2 found this for the first-contact indexes; the same question
  applies to G3's signature check and timestamp window (does the inbox's `_id` uniqueness, or a missing
  secret, mask a bypassed signature?) and to G5's loop guard.
- 🔴 **A guard and an unbuilt path can return the same refusal.** `bearer.ts` and `webhooks/receive.ts`
  both refuse twice over — once for "not configured", once for "not built yet" — differing only in the
  message. That is why the default-off tests assert the message and not just the status. When G2 and G3
  build the real verification, keep that discrimination.
- 🔴 **The role mapping's concrete pairs are the run's, not the spec's.** data-model.md only says "the
  union … goes through the mapping table in `packages/contracts`"; `tasks-user → member` and the rest
  come from the realms T004 defined. Legitimate, but G6's traceability must not cite an FR for them.
