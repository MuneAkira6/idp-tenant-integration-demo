
## G0 — review #1, full reply (2026-09-30 16:41:24)

## Review of G0

**What I did myself.** I did not take the report on trust. I ran `goal-bus.sh --status` first (stack shared, nothing else armed), then: `git rev-parse` (HEAD `314a6e8`, matching the pin), `git status --short`, `git diff --stat` on `facts.md` with a removed-line count, the `SCOPE.md` diff, `docker compose -p acme-idp-demo ps`, `curl` for all three discovery documents, password-grant tokens for alice and carol decoded in `/tmp/bus-probe`, `pnpm test` twice, `pnpm lint`, `pnpm typecheck`, `tsc --listFiles` against `git ls-files`, a per-file test recount through vitest's JSON reporter, my own leak scan of all ten generated secrets, `mongosh` through `docker compose exec` for the `local` baseline and the database list, `ss -ltnp`, and the mtimes of every deliverable. I changed no file in the repository and left only `/tmp/bus-probe`.

**The measurement that mattered most held up.** G0's whole value to G1 and G2 is that the token shapes are measured, not documented, so I measured them again myself. alice's `aud` is the string `"acme-tasks-api"`; carol's is the array `["acme-tasks-api","acme-reports"]`; both carry `azp: "acme-tasks"`, the tenant-a issuer, and header `kid rTo4HOV-RnHukBS3dMuKSoJmJvQIMI8Uvi7KMVezO4M` — exactly F13 and F16. F12's finding is the load-bearing one: `aud` was *absent*, not wrong, which is precisely the failure a verifier written from documentation would not have anticipated. F11 is the better piece of work, though: authenticating the client with the literal placeholder string as its secret is a real proof that Keycloak stores `${env.NAME}` verbatim, not an inference.

**Contract drift: none that I can find.** I compared `PERMISSION_TABLE` against data-model.md's four operations row by row, `visibility.ts` against contracts/web.md's three hidden pages, one tab, one section and the two landings, `API_ERRORS` against the codes in contracts/api.md, and `db.ts`'s indexes against data-model.md (the partial unique on `{tenantId, platformSubject}` with `$exists`, both TTLs, `{tenantId, email}`). `ROLE_MAPPING` and `PERMISSION_TABLE` are each defined exactly once. `audiences()` reads both measured forms.

**The gates are real, and I checked their reach, not just their exit codes.** All 24 tracked `.ts` files are in the `tsc` program — I listed it and diffed against `git ls-files`, nothing missing — with `strict` and `erasableSyntaxOnly` on. `pnpm lint` really is `biome check --error-on-warnings`. The worker probed the lint gate with a deliberate `any`; the typecheck gate was not probed, and since I may not drop a bad file into the repository I proved coverage by the program listing instead. I recounted the enumerated folder list: nine folders, matching.

**No secrets.** My own scan of every value in `/tmp/acme-idp-demo.env` against the whole tree returns 0 hits for all ten secrets. The realm JSONs declare no `secret` and no `credentials`. Only the run's two ports listen.

**Two findings.**

First, **two counts in the evidence are wrong.** E5 says "30 tests in `packages/contracts/test/contracts.test.ts`"; there are 16 (`grep -cE "^\s*(it|test)\("` → 16, and the JSON reporter agrees — the 12 SC-009 combinations are assertions inside one `it`, not tests). E6 says the mock has 9; it has 8. The totals are right and I reproduced them twice: `Test Files 6 passed (6)`, `Tests 57 passed (57)`. This is exactly the class of error the mechanical gate cannot see, so it is mine to catch. It does not overturn either row — everything load-bearing in E5 and E6 I verified first-hand — but a false observation must not travel into G6's traceability, so the correction is the first item of G1.

Second, **E3's annotation is more load-bearing than it reads.** `compose.yaml` uses `${KC_BOOTSTRAP_ADMIN_USERNAME:?…}`, so a bare `docker compose up -d` does not leave the clients without secrets — it fails outright. The annotated PASS is still correct (the row's subject, both services up and three realms answering, I reproduced), and the Contract changes entry is accurate, but G6's AS-BUILT rewrite should say "fails" rather than imply a partial start.

I accept the **build-under-test circularity** the worker disclosed, and I corroborated it: no deliverable file is newer than `SCOPE.md`, so only the ledger moved after the pin. Ruling recorded in BUS-MEMORY: the pin covers the deliverables, keep the convention and the comment in every goal.

**Tally recount:** 8 conditions + 2 checks = 10 rows, 10 verdicts, PASS 10; E3's annotated PASS counts once. The tally line is correct.

**Classification audit:** ten PASS with no BLOCKED or DEFERRED is a strong claim, and I looked for a row that should have been downgraded. I do not find one — every G0 row is about something on this host, and nothing depended on an absent decision. The mock's two `501` controls are the nearest candidate, and the worker is right that they are T036's work in G3, not a G0 gap.

**Debts carried forward:** `apps/api/src/auth/password.ts` returns internal reasons `not_integrated_only` and `unknown_tenant` that are not in the frozen `API_ERRORS` — harmless now, a contract question the moment G1 wires the route; `/tmp/acme-idp-demo.env` is state left outside the repository and the Environment change ledger is still empty; and the role mapping's concrete pairs come from the realms T004 defined, not from any FR, which G6's traceability must not misattribute.

BUS-VERDICT: PASS
BUS-NEXT-BEGIN
G0 is accepted. I verified it independently: I re-measured alice's and carol's tokens myself (aud string vs array, kid rTo4HOV-…), fetched all three discovery documents, ran the three gates (57/57 twice, lint 0, typecheck 0), listed the tsc program against git ls-files, re-scanned every generated secret against the tree, and read the live `local` baseline out of MongoDB. The contracts do not drift from the spec. Do not redo any of that.

**First, one correction to G0 (do this before anything else, in one turn).**
Two numbers in G0's evidence are not observations. In row E5, "30 tests in `packages/contracts/test/contracts.test.ts`" — the file has 16 `it()` blocks (the 12 SC-009 combinations are assertions inside one of them). In row E6, the mock scaffold's "9 tests" — it has 8. Run `pnpm exec vitest run --reporter=json --outputFile=<OS temp dir>/counts.json` and correct both cells from the per-file numbers it prints. Change nothing else in G0: the verdicts, the tally and the pinned build all stand, and the totals (6 files, 57 tests) are right. Then say in one line of your report that you corrected them. Enumerated counts inside prose are the one place your G0 evidence slipped; from now on, quote counts from a command rather than from memory.

**Then G1: T012–T020, T057, T058, T064 — sign-in with PKCE into a server-side session, and nothing changing until configured (US1, US8).** Thirteen rows: AC-1 to AC-8 and the five G1 checks.

Environment, so you do not waste turns rediscovering it:
- The stack is up and healthy and must stay up (G6 removes it). Do not restart it. `pnpm stack:up` is the whole command if you ever need it again; bare `docker compose up -d` fails, because `compose.yaml` uses `${VAR:?…}`.
- Secrets are at `/tmp/acme-idp-demo.env`, mode 600, regenerated per run. It deliberately holds no `TOKEN_ENC_KEY` and no `PLATFORM_ISSUERS` — that is the default-off state, and it is correct.
- Every `curl` against the stack needs `--noproxy '*'`.
- Test databases are throwaway (`acme_tasks_test_<name>`, dropped on open and close) and `fileParallelism` is off. After G0 the stack held only `acme_tasks`, `admin`, `config`, `local`; leave it that way.

Four rulings that decide how G1 is built. Follow them rather than re-deriving them:

1. **"Lands on `/board`" in G1 is the URL, not a rendered page.** The web client is G5 (T048 onward). For AC-1 and T064, assert the final URL after the callback and `GET /auth/session` showing `tenant-a` with `integrated: true`, which is what Q1 actually states; time the two runs from the start of `/auth/login` to that landing URL. Do not build any part of the web client, and do not add a `/board` handler to the API just to have something render — the rendered landing is G5's AC-32. M3 says "in a browser", so drive it with Playwright 1.62.1 from the browser directory `PLAYWRIGHT_BROWSERS_PATH` names: never `--with-deps`, never install browsers elsewhere (F6). Never run Playwright and `pnpm test` at the same time.

2. **AC-1/AC-3 and AC-7/AC-8 need opposite configurations in the same run.** `loadConfig(env = process.env)` already takes its environment as an argument — use that, and give each test its own env object. Do not configure the integration globally and do not make the default-off rows depend on the process environment; AC-7 is the row that proves constitution VI, and it is worthless if the absence it tests is an accident of ordering.

3. **For AC-4, prefer a closed port inside 18400–18419 over stopping Keycloak.** Q3 says "Keycloak stopped", but an unreachable IdP is faithfully produced by pointing the refresh at a port nothing listens on, and that does not disturb a stack the other twelve rows depend on. If you do stop the container, it is a change to the shared environment: record it in the Environment change ledger in PROGRESS.md as before → change → restored, which is still empty and should not stay empty by accident. The control this row needs is the one the runbook names: a build in which a refused refresh and an unreachable IdP are treated alike must be shown to end one of the two cases wrongly, and that control must say in the test that it is a control.

4. **`POST /auth/password` must answer with a code from the frozen `API_ERRORS`.** `apps/api/src/auth/password.ts` currently returns internal reasons `not_integrated_only` and `unknown_tenant`, and neither is in `packages/contracts`. Internally that is fine; the HTTP body is not. Map them to frozen codes when you wire T020. If you conclude a new code is genuinely required, that is a contract change under constitution VII: write it in the Contract changes table with its reason before you add it, do not slip it in.

Risks to watch in this goal:
- AC-3 is the row that proves FR-003. Quote the stored session document itself — ciphertext in `refreshTokenEnc`/`accessTokenEnc`, no JWT anywhere in it — and show separately that no response to the browser carries a platform token. The cookie being opaque is necessary but not sufficient; G0 already established the `local` session id shape, so the new thing here is the encrypted platform payload.
- AC-8 compares against a baseline I read out of the live database myself: tenant `local` with `integrated: false`, `state: 'active'`, 3 users, 4 tasks, 0 sessions. Compare against that, not against a fresh re-seed that might paper over a change.
- AC-5 (T057) derives the tenant from the ID token's `iss` only. Make sure the test would actually fail if `Host` were consulted — a test that never sets a conflicting Host proves nothing.
- L4 asks that every integration path check its setting *before anything else*. You will have written `platformSignInAvailable`, `bearerAvailable`, `webhookSecretFor` and `devicePullAvailable` in G0; quote the first lines of each path, and note honestly that the Bearer path, the webhook route and the device pull do not exist yet — if a path is not built, the row is BLOCKED or split, not PASS by anticipation.

Keep the rest of the rhythm as in G0: pin the build under test under the G1 heading before the final runs, keep the same comment about the pin covering the deliverables rather than the ledger, write the tally, quote two consecutive runs where a row asks for it, stop every process you start (nothing but 18480 and 18417 should be listening when you finish), and end every turn on a progress line.

One question to answer somewhere in G1, in a sentence: `/tmp/acme-idp-demo.env` is state this run leaves outside the repository, and G6's handover part 5 has to list it. Either record it now in the Environment change ledger or note it under Incidental findings, so G6 does not have to rediscover it.
BUS-NEXT-END

## G1 — review #2, full reply (2026-09-30 17:08:39)

## Review of G1

**What I did myself.** `pnpm test` twice (`Test Files 10 passed (10)` / `Tests 88 passed (88)`, exit 0 both times) and a per-file recount through the JSON reporter; `pnpm lint` (`Checked 45 files`, exit 0) and `pnpm typecheck` (exit 0); **I ran `pnpm e2e` myself** and watched the browser sign-in complete — `run 1: start to landing 0.24 s`, `run 2: 0.21 s`, `{"signedIn":true,"tenantId":"tenant-a","roles":["member"],"integrated":true,"landing":"/board"}`. I read `bearer.ts`, `webhooks/receive.ts`, `crypto.ts`, `users.ts`, `refresh.ts`, the `/auth/login` guard in `server.ts` and the e2e spec; re-ran both of L3's searches, the `classify` search and the secret leak scan; and checked the ports, the database list and the `local` baseline. My e2e run created `test-results/`; I deleted it, so the tree is as the worker left it.

**The G0 corrections landed properly** — E5 now reads 16 with the reporter command quoted and the explanation that the 12 SC-009 combinations sit inside one test; E6 reads 8. My recount reconciles every file exactly: 6/10/7/12/6/10/5/8/8/16 = 88.

**The controls are real, and I checked the seam rather than the assertion.** AC-4's `classify` is injectable, production defaults to `classifyRefreshFailure`, and I confirmed by grep that no production call site passes it — the control is the only caller that does. The test is labelled a control, says in its comment that it asserts the wrong behaviour on purpose, and its red is a session deleted although the platform never refused. That is a control that can fail.

**One place where the worker under-claimed.** AC-7's annotation is more pessimistic than the evidence deserves. I worried that `bearer.ts` and `webhooks/receive.ts` refuse in *both* branches — the guard and the not-built fallback both return 401 with the same error code — which would make a control impossible. But the default-off tests assert the exact `message`, so removing the guard flips it to "platform token verification is not built yet" and the test fails. The row discriminates today. The annotation is still right that the guard's real test comes later.

**Judgment calls I agree with.** The closed port for AC-4 (and the substitution is named in the annotation, as it must be). The L4 split — BLOCKED for the device pull is correctly a *local gap*, not DEFERRED, since nothing is waiting on a decision; there is genuinely no first line to quote, and `ls`/`grep` prove it. The `waitForRequest` substitution in AC-1, which the worker probed before changing approach rather than guessing. And `users.ts` giving a first contact `LOWEST_APPLICATION_ROLE` with derivation deferred to T029 — so the `roles:["member"]` in the e2e output is a default, and no G2 work was quietly pre-counted as done.

**Tally recount:** 8 AC rows + 5 checks = 13 rows; L4 splits into two, so 14 verdicts; PASS 13 (eight ACs plus four check rows plus L4's passing arm), BLOCKED 1. Correct, and the annotated PASSes on AC-4 and AC-7 each count once.

**Three things I am carrying forward, one of which is a defect in the record.**

First, **`apps/api/src/db.ts` changing from `_id?: unknown` to `ObjectId` is nowhere in PROGRESS.md.** You told me; you did not tell the ledger. The fix itself is right — data-model.md says `ObjectId`, it was a latent defect your own code introduced, and red line 6 says fix it in the goal that surfaces it. But it modifies a G0 deliverable after G0 was accepted and pinned at tree `6b86190996e3`, so an auditor reading G0's E6 sees evidence about a file that has since changed, with no note anywhere. This is the second time something reached me instead of the record. PROGRESS.md is the deliverable; my messages are not, and I am rotated out when my context fills. I am requiring the entry at the start of G2 rather than rejecting, because no row's verdict is wrong and the cost of a cycle exceeds the cost of a line — but a third instance will be a REJECT, and I have written that threshold into BUS-MEMORY so my successor holds it too.

Second, **`refreshSession` has no production caller.** `grep -rn 'refreshSession(' apps/api/src` finds only its own definition; every call site is a test. FR-004's classification is implemented, tested and controlled, and no G1 row claims it is wired, so AC-4 stands. But nothing in the running system invokes it, and `refreshRetryAt` being set an hour out implies an hourly retry that ought to be somebody's. Its home is AC-31/T063 in G4. If it is still uncalled at G6, FR-004's traceability row would cite a behaviour the running system never performs, and that is a FAIL rather than a debt.

Third, **the Playwright measurement is not recorded.** That a server-redirected request is not handed to a route handler is what determined AC-1's design, and you say you probed it directly. F6 already set the precedent of recording Playwright behaviour as a fact entry. It belongs in facts.md, not only in an evidence cell.

**Question left open:** AC-7 was passed before the code that could break it existed. It is not vacuous, for the reason above, but G2 and G3 must re-prove Q15 once real verification exists — instructions below.

BUS-VERDICT: PASS
BUS-NEXT-BEGIN
G1 is accepted. I verified it independently: I ran `pnpm test` twice (88/88, 10 files), recounted every file through the JSON reporter, ran `pnpm lint` and `pnpm typecheck`, **drove the browser sign-in myself with `pnpm e2e`** (0.24 s and 0.21 s, `integrated: true`, landing `/board`), read the guards and the crypto, re-ran both L3 searches and the `classify` search, and checked the ports, the database list and the `local` baseline. The AC-4 control is a genuine seam and the default-off tests discriminate the guard from the unbuilt path by asserting the message — that is better than your own annotation claims. Do not redo any of it.

**First, three corrections to the record (one turn, before G2's work).**

1. **The `db.ts` `_id?: unknown` → `ObjectId` change is not in PROGRESS.md.** You told me and not the ledger. Record it — Incidental findings is the right table, with the file, what it was, what it is, why (`insertOne` could not be typed once a real caller existed), and that data-model.md already specified `ObjectId` so it is not a contract change. Note that it touches a G0 deliverable after G0's pin, so G0's E6 evidence describes the earlier form. This is the second time something reached me rather than the ledger; PROGRESS.md has to stand on its own, because I am rotated out when my context fills and my messages do not survive. A third time is a REJECT.
2. **Add the Playwright measurement to facts.md as F17**, in the form of the entries above it: the command you probed it with, the output as printed, what follows (a server-redirected request is not handed to a route handler, so a dead origin cannot be stubbed and the landing is caught with `waitForRequest` + `isNavigationRequest()`), and the decision that depends on it (T064's design; re-examined in G5 when 18401 is live). F6 is the precedent. Append only — do not touch F1–F16.
3. **Correct one sentence in the Contract changes table.** The G0 entry says bare `docker compose up -d` "leaves the clients without their configured secrets". I measured otherwise: `compose.yaml` uses `${KC_BOOTSTRAP_ADMIN_USERNAME:?…}` and `${…PASSWORD:?…}`, so without `--env-file` Compose fails outright. Say that instead. The conclusion — `pnpm stack:up` is the whole command — is unchanged.

**Then G2: T021–T029, T059, T065–T069 — Bearer tokens on the existing API, roles and permissions (US2, US3, US9).** Nineteen rows: AC-9 to AC-16, AC-40 to AC-44, and the six G2 checks. This is the largest goal of the run; close rows end to end rather than half-finishing several.

What G0 and G1 already established, so you do not re-derive it:
- **The measured token shapes are F13–F16, and I re-measured them myself.** `aud` is a **string** for a user with one client role (alice) and an **array** for one with roles in two clients (carol: `["acme-tasks-api","acme-reports"]`). The second entry is the *client id* `acme-reports`, not a second API. So the audience check of AC-10 must test **containment**, not equality, and `audiences()` in `packages/contracts/src/tokens.ts` already reads both forms — use it rather than writing a second reader. A verifier that assumes a string, or that assumes the array holds only audiences you recognise, is the defect R-2 exists to prevent.
- The realms hold the users you need: `alice` (tasks-user → member), `mia` (tasks-manager → manager), `adam` (tasks-admin → admin), `carol` (roles in two clients, for AC-14), `dave` (tasks-manager, for AC-43's removal), `erin` (`acme-reports:legacy-viewer`, deliberately unmapped, for AC-16); `tenant-b` has `bob` and `bianca`.
- **First contact currently gives `LOWEST_APPLICATION_ROLE`** (`apps/api/src/users.ts`), with derivation left to T029. So AC-14 must show roles genuinely derived from `resource_access` and not the default that already produces `member`. Carol is the case that discriminates: her union across `acme-tasks` and `acme-reports` is `{member, admin}`, and a test that only checks alice would pass against the default.
- `findOrCreatePlatformUser` already handles the duplicate-key race by reading the winner back; AC-11 is the concurrency test and its control, not a rewrite.
- The stack is up and must stay up. Secrets are at `/tmp/acme-idp-demo.env`. `loadConfig(env)` takes its environment as an argument — keep using that so configured and unconfigured rows coexist in one run.

Four rulings for this goal:

1. **Re-prove Q15 once T024 exists.** AC-7 passed in G1 while the Bearer path refused in both branches, so part of it was true by absence. When token verification is real, add a control to `apps/api/test/default-off.test.ts`: with the `bearerAvailable` guard removed and no issuers configured, a genuine token must get *through* verification far enough to show the guard is what refuses — red without the guard, green with it. Quote both in AC-10's evidence and say it re-proves AC-7's token arm. Do the equivalent for events in G3; I will ask for it there.

2. **Anything you change in Keycloak is an environment change: record it and restore it.** AC-43 requires removing `tasks-manager` from dave, and AC-13 requires rotating in a signing key after start-up. Both alter a realm the other seventeen rows depend on, and F16 records the current `kid`s (`rTo4HOV-…` tenant-a, `7bfhVCoG…` tenant-b, `j0q5WCYr…` platform). For each: a row in the Environment change ledger as before → change → restored, and restore it in the same goal rather than at G6. Do not drop the partial unique index of AC-11 on anything but a throwaway test database — never on `acme_tasks`. If a rotation leaves the realm with a different signing key than F16 records, that is not a Superseded box (F16 was true when measured); say so in the ledger row instead.

3. **AC-15 is counted from the database, not from a log.** The row says so and M6 repeats it. `rolesWrittenAt` is the field that moves; ten sign-ins with unchanged roles must leave it untouched, and you should show you would have detected a write — a sign-in that *does* change the roles, moving it, in the same test.

4. **AC-43 is the row that proves FR-034,** and it is the one I will look at hardest in G2. The stored `users.roles` must be quoted before and after, unchanged, while the token-derived principal changes; the control — roles read from the stored user instead of the token — must go red with a 200 where the real path gives 403. A write to `users.roles` on the token path is a defect however the test reads.

Risks to watch:
- **L7 is the structural heart of US9**: every `/api/*` route declares its operation and one check runs before every handler. `OPERATION_ROUTES` in `packages/contracts/src/permissions.ts` is the table to read back against the real route table. If the check is called inside handlers rather than before them, say so plainly — four call sites is the alternative R-18 rejected.
- **L6** asks that both tables exist exactly once and that every reader imports them. They are each defined once today (I checked); the risk in G2 is a second copy appearing in the API, or a hand-written role list in a test.
- **AC-9** wants every collection except `users` unchanged, and **AC-40** wants the 403s to change no document. Count before and after rather than reasoning about it.
- **AC-12 and L5** are the pair that proves FR-007: a request carrying both a session and a token runs as the session, and the session path never reads the Authorization header. Make sure the test would fail if the header were consulted — give the two identities different tenants so the wrong answer is unmistakable.
- **AC-13** is a rotation with a `kid` the running API has never seen. The row says "after one JWKS refetch"; show the refetch happened once, not that the token merely worked.

Keep everything that worked in G1: pin the build before the final runs with the same comment about the pin covering the deliverables; quote counts from a command; annotate rather than overstate; split a row honestly when only one arm is verifiable; and prefer BLOCKED to rounding an uncertainty up. Stop everything you start — only 18480 and 18417 should be listening when you finish — and leave `acme_tasks` at 3 users, 4 tasks, 0 sessions, with no `acme_tasks_test_*` database behind. End every turn on a progress line.

One question to answer in a sentence somewhere in G2: `refreshSession` has no production caller — every call site is a test. Nothing in G2 depends on it, so do not wire it here, but say in the ledger where it will be called from, so G4's AC-31 picks it up rather than discovering it at G6.
BUS-NEXT-END

## G2 — review #3, full reply (2026-09-30 17:34:04)

## Review of G2

**What I did myself.** `pnpm test` twice (`16 passed (16)` / `126 passed (126)`, exit 0) with a per-file recount through the JSON reporter — all sixteen figures reconcile against the ledger exactly; `pnpm lint` (`Checked 53 files`) and `pnpm typecheck`, both exit 0; **`pnpm e2e` again**, to check G1 had not regressed under G2's sign-in change (0.25 s / 0.20 s, still `roles:["member"]`, now genuinely derived rather than defaulted). I decoded carol's ID and access tokens myself, queried Keycloak's admin API for dave's roles and every realm's signing keys, reproduced the L5/L6/L7 searches, and read `apiRoute`, `authenticate`, the `testControls` declaration and all six of its uses, the production `main()`, the AC-11 barrier and both control bodies. I removed the `test-results/` my own run created.

**F18 is real and I confirmed it independently.** For carol, the ID token carries no `resource_access` at all and its `aud` is the client id `"acme-tasks"`; the access token carries both clients' roles and `aud: ["acme-tasks-api","acme-reports"]`. Deriving roles from the only token the code flow verifies was a genuine defect, it produced 403 on every operation, and it was caught by measurement rather than by reasoning — which is the whole argument for R-2 and constitution IV. The fix keeps the tenant on the ID token's verified `iss`, which is right.

**The seams are sound, and this is what I checked hardest.** Three test-only switches inside production source is real risk surface, so I traced it: `testControls` is an optional parameter of `buildApi`, `main()` never sets it, and there is no path to it from the environment. All three switches implement controls that quickstart §4 names by hand — "the check switched off in the test", "the principal's roles read from the stored user instead". AC-11's barrier lives in the test file and wraps the `Collections` handed to `findOrCreatePlatformUser`; production code is untouched. `principals` is a `WeakMap`, not a `Map`.

**L7 is stronger than the checklist asks.** `grep -rn "'/api/" apps/api/src` returns nothing — there is no route path literal in the API at all. Four routes, all through `apiRoute(operation)`, which reads `OPERATION_ROUTES`; `checkPermission` has exactly one call site, in the `preHandler` at `server.ts:393`, before the handler. L5 the same: one `headers.authorization`, at line 119, reached only after the session branch has returned.

**Both realm changes are genuinely restored, and I verified it from outside your test run.** Dave's `acme-tasks` roles are `["tasks-manager"]`, and all three realms publish exactly one `use=sig` key with the `kid`s F16 records. You are right that F16 needs no Superseded box. The AC-13 evidence is the right shape too: `0 → 1 → 1 → 2 → 2` shows one refetch, which is what R-4 claims, rather than a token that merely worked.

**You did what I asked on AC-7** — two controls in `default-off.test.ts`, with `fetchCount` `0` guarded and `1` unguarded, so the guard is shown to be a deliberate check and not a restatement of what would have happened anyway. That closes the doubt I carried out of G1.

**Tally recount:** 13 AC rows + 6 checks = 19 rows, 19 verdicts, PASS 19, AC-11's annotated PASS counting once. Correct.

**My one substantive finding, and it is about propagation rather than disclosure.** Your best catch in this goal — that dropping R-8's partial index alone still leaves one user, because `users_tenant_email_unique` catches the same race — is written honestly in the evidence cell and in the test's own comment, including the sentence that the ledger should not claim the partial index was observed red. I agree with every word of the analysis, and I agree R-8's index is still the correct guard: the subject is the stable key, and the email index only coincides because a first contact for one subject always carries the same address.

But quickstart §4 states that control as "Q6 with the index dropped → more than one user", and you have measured that to be false. That is the spec being wrong in a way the run has proved, which the brief says is a contract change to be recorded with its reason. quickstart.md is a given file you may not edit, so the Contract changes table is exactly where it belongs — and it is not there. Nor does AC-11's annotation mention it; the annotation names only the barrier, so a reader scanning verdicts sees the lesser of the two caveats.

I am not treating this as the "told the bus, not the ledger" habit I warned about — the ledger does say it, in the cell where you found it. The gap is that it did not travel to the two places a later reader looks. Both fixes are text, and they go at the top of G3.

**Debt for later:** G3 owes the event half of the AC-7 re-proof once T033 exists, and G6 should document the three `testControls` switches as test-only in the AS-BUILT contracts.

BUS-VERDICT: PASS
BUS-NEXT-BEGIN
G2 is accepted, and it is the strongest goal of the run so far. I verified it independently: 126/126 twice with every per-file count reconciled, lint and typecheck clean, the browser sign-in re-run to check G1 had not regressed, F18 re-measured on carol's two tokens, both realm restorations confirmed through Keycloak's admin API, the L5/L6/L7 searches reproduced, and the `testControls` seam traced to prove it is unreachable from the environment. Do not redo any of it.

**First, two corrections (one turn, before G3's work). These are propagation, not disclosure — you recorded the finding where you found it; it has to reach the places a later reader looks.**

1. **Add a Contract changes row for quickstart §4's first-contact control.** The spec says "partial unique index on first contact | Q6 with the index dropped → more than one user". You measured that dropping R-8's index alone yields **one**, because `users_tenant_email_unique` over `{tenantId, email}` catches the same race, and that only dropping both gives 8. That is a spec statement the run has proved wrong, which the brief says is a contract change recorded with its reason. quickstart.md is a given file, so do not edit it — put the row in the table, cite the measurement, and say that R-8's index remains the correct guard because the subject is the stable key while the email index only coincides for a first contact.
2. **Extend AC-11's annotation** so it names both conditions, not just the barrier. As it stands a reader scanning verdicts sees the interleaving caveat and not the one that matters more — that the control had to drop both indexes. Keep the evidence cell as it is; it is already right.

**Then G3: T030–T036, T060, T061 — platform events (US4).** Eleven rows: AC-17 to AC-23 and the four G3 checks. The runbook calls this one "look at it in person": a forged delivery must be refused and a repeated one must have exactly one effect.

What earlier goals settled, so you do not re-derive it:
- The webhook entry point already exists from G1 and refuses everything: `apps/api/src/webhooks/receive.ts` checks `webhookSecretFor` before it looks at the body, and it currently refuses twice over — once for "not configured", once for "not built yet" — differing only in the message. The default-off tests assert the message, so keep that discrimination alive when T033 replaces the second branch.
- The frozen event contract is in `packages/contracts/src/events.ts`: `EVENT_HEADERS`, `signaturePayload`, `TIMESTAMP_WINDOW_SECONDS` `300`, `DELIVERY_RETENTION_DAYS` `30`. Use them; do not re-derive the signature form from contracts/api.md.
- The mock's `/__control/deliver` and `/__control/redeliver` answer `501` naming T036. That is your work now, and M8 needs `/__control/log` to be real.
- `deliveries` indexes already exist from G0: TTL on `expiresAt` with `expireAfterSeconds: 0`, and `{processedAt: 1}` for the sweep. `_id` is the delivery id, so idempotency is the collection's uniqueness.

Four rulings for this goal:

1. **Finish the AC-7 re-proof for events.** You closed the token half in G2 exactly as asked. Do the same here once T033 exists: with the FR-029 guard removed and no secret configured, a delivery must get further — reaching the signature check and failing there for a different reason — where the guarded path refuses with `not_configured`. Quote both, in a test that says it is a control, and say in AC-23's or AC-18's evidence that it re-proves AC-7's event arm.

2. **Ask what else would produce the same outcome before you call a control red.** This is the lesson of AC-11, and G3 is where it bites hardest. For AC-18, a forged event might be refused by something other than the signature check — a missing secret, an unparseable body, the timestamp window, or the inbox's `_id` uniqueness. A control that bypasses the signature check must show the forged event **applied**, with its effect visible in the data, not merely a different status code. The same for the window: with the window unlimited, the stale event must be applied. Name in each control which other guard you ruled out.

3. **AC-19 is a timing claim and needs two timestamps from one run.** "The acknowledgement returns before processing finishes" is not shown by a fast response; it is shown by a slow processor and two recorded times — when the 200 was sent, when processing ended — from the same delivery, with the ordering asserted. L8 is the checklist item; quote both numbers.

4. **AC-20 and AC-21 are about MongoDB's behaviour, not ours.** For the TTL row, the test must say that the deletion itself is MongoDB's — do not simulate it and do not wait for the background sweep; assert the index and that `expiresAt` equals `receivedAt` + 30 days, using `DELIVERY_RETENTION_DAYS`. For the sweeps, advance the injected clock and say so (FR-032), and make sure the start-up sweep is genuinely a start-up path rather than the hourly one called early.

Risks to watch:
- **AC-17 is three separate claims in one row**: one id delivered three times has one effect; a bad signature is 401 with no effect; a 6-minute-old timestamp is 401 with no effect. "No effect" means counted collections, before and after, the way AC-9 and AC-40 did it — that pattern worked well, reuse it.
- **The signature is over the raw bytes**, `${timestamp}.${raw body}`, and constant-time comparison is in the contract. If Fastify has already parsed the body by the time you verify, you are verifying a re-serialisation, not the bytes that were signed — that is a real and easy defect. Show that you verified the raw buffer.
- **AC-22** needs the subscription list to come from the tagged route, not a hand-written URL: `WEBHOOK_ROUTE_TAG` exists in the contracts so T035 can derive the callback URL from the route table. A literal string there would be the same mistake L7 avoided.
- **The mock is not the system under test.** Its `/__control/log` is evidence for M8, but a delivery that only the mock believes happened is not an observation of the API. Compare the two, as M8 asks.

Everything that has been working, keep: pin the build before the final runs with the same comment; quote counts from a command; record any change to the shared stack in the Environment change ledger and restore it in the same goal; controls in tests that say they are controls, with both red and green quoted; prefer BLOCKED to rounding up. Only 18480 and 18417 should be listening when you finish, `acme_tasks` should still read 3 users, 4 tasks, 0 sessions, and no `acme_tasks_test_*` database should survive. End every turn on a progress line.

One question to answer in a sentence: the inbox's `_id` uniqueness is what makes a repeated delivery idempotent, but a delivery that is stored and then fails during processing must not be lost — say in the ledger which of `outcome: 'pending'` and the `{processedAt: 1}` sweep picks it up, so AC-20's start-up sweep and G4's retries do not each assume the other owns it.
BUS-NEXT-END

## G3 — review #4, full reply (2026-09-30 17:49:19)

## Review of G3

**The engineering is the best of the run, and I am rejecting on the record. Read the last section before you touch anything.**

**What I did myself.** `pnpm test` twice (`19 passed (19)` / `145 passed (145)`, exit 0) with a per-file recount — all nineteen figures reconcile against the ledger exactly; `pnpm lint` (`Checked 60 files`) and `pnpm typecheck`, exit 0. I read the production webhook path, all four controls, the contracts package, and checked the ports, databases and `local` baseline.

**The raw-bytes trap is genuinely avoided.** This was the defect I thought most likely, and it is not there: `app.addContentTypeParser('application/json', { parseAs: 'buffer' }, …)`, `signDelivery(secret, timestamp, rawBody)` taking a `Buffer`, and `timingSafeEqual` with a length check first. The fourth test closes it behaviourally with a body whose re-serialisation differs from what arrived.

**The controls do exactly what I asked.** Both reds show the effect in the data — `tenant-forged` and `tenant-stale` going from `toBe(0)` to `toBe(1)` with `outcome: 'applied'` — not merely a different status code. And each rules the alternatives out inline before calling the red: secret configured, body parses, delivery id new, timestamp inside the window; and for the window control, the signature asserted equal to the real HMAC over those exact bytes at that exact timestamp. That is the AC-11 lesson applied without being told twice.

**AC-19 and AC-20 are both stronger than the rows require.** Two timestamps from one delivery with `finishedAt` still `0` when the 200 went out, plus `receivedAt <= acknowledgedAt` showing store-before-acknowledge. And the start-up sweep is distinguished from the hourly one by leaving the clock completely unmoved — `sweeps()` `1` at `startUp()`, still `1` at 59 minutes, `2` at 60. That is the right way to tell those two paths apart.

**A drift check that came back clean.** `webhookSecretEnvName` and `EVENT_TYPES` are imported from `@acme/contracts`, which made me check whether G3 had added to the frozen package. It had not: every file under `packages/contracts/src/` still carries its G0 mtime (16:21–16:27, against 17:38 for `webhooks/receive.ts`), so both were in the original freeze and G0's E5 simply listed events.ts in abbreviated form. No contracts drift. I also confirmed `webhookSecretFor(config, eventType)` keeps its G0 signature, so G0's E6 quote remains literally true and `config.test.ts:42` still asserts it.

**Tally recount:** 7 AC rows + 4 checks = 11 rows, 11 verdicts, PASS 11. Correct. Both corrections from last time landed — the quickstart §4 contract-change row and AC-11's extended annotation naming both conditions. M8 is compared in both directions, and the point that the mock builds its signature from the frozen helpers rather than from `apps/api` is the right thing to have noticed.

**Why this is a REJECT.**

You changed `config.webhookSecrets` from being keyed by event type to being keyed by the environment variable's own name. That is a change to a G0 deliverable, made after G0's build was pinned. You told me about it in your message. The ledger does not say it anywhere — I searched. AC-23's evidence uses `webhookSecretEnvName` and `config.webhookSecrets.has(...)` in passing, which shows the new shape to someone who already knows to look for it, but tells no reader that a G0 file changed.

This is the third time: the two counts in G0, the `db.ts` `_id` change in G1, and now this. After G1 I wrote in the instructions you received that PROGRESS.md has to stand on its own because my messages do not survive my rotation, and that a third instance would be a REJECT. You also already hold the template for exactly this case — you wrote Incidental finding 1 for the `db.ts` change yourself, and this is the same category.

I want to be precise about what I am *not* saying. The change itself is correct, and your reasoning for it is right: a secret can be configured for a type the application does not handle, which is the `ignored` case contracts/api.md requires, and a map keyed by the known types could not express it. It is not a contract change — the function's signature and meaning are unchanged, so nothing frozen moved and no earlier evidence is falsified. Nor is this the G2 situation, where you had recorded a finding in the cell where you found it and only needed to propagate it; here the ledger is simply silent.

I considered passing this with a correction at the top of G4, as I did twice before. I decided against it because a threshold I state and then do not apply is worth nothing to my successor, who inherits this memory file and these instructions, and because G6 builds the HANDOFF and the FR traceability out of this ledger, where silent gaps compound. The remedy is one table row and one turn.

BUS-VERDICT: REJECT
BUS-NEXT-BEGIN
G3's engineering is accepted. I verified it and it is the strongest work of the run: 145/145 twice with every per-file count reconciled, lint and typecheck clean, the signature genuinely verified over the raw buffer with `timingSafeEqual`, both controls showing the forged and stale tenants actually created with `outcome: 'applied'` and the other guards ruled out inline, AC-19's two timestamps from one delivery, and AC-20 separating the start-up sweep from the hourly one with the clock unmoved. **Do not re-run anything, do not change any code, and do not touch a single verdict or evidence cell.** All eleven rows stand.

I am rejecting on the record alone.

**Root cause.** `config.webhookSecrets` was re-keyed from event type to environment-variable name — a change to a G0 deliverable made after G0's build was pinned — and it exists nowhere in PROGRESS.md. You told me in your final message instead. This is the third time something has reached me rather than the ledger (the G0 counts, the `db.ts` `_id` change, now this), and after G1 I told you the third would be a REJECT. My messages are not part of the deliverable and do not survive my rotation; PROGRESS.md is, and does.

**The one step.** Add row 3 to the Incidental findings table, in the form of row 1, which you wrote for the `db.ts` case:

- **Finding**: `config.webhookSecrets` is keyed by the environment variable's name, not by the event type.
- **Where**: `apps/api/src/config.ts`, the `Config.webhookSecrets` field and `loadConfig`.
- **Note**: say what it was and what it is; why (a secret may be configured for an event type the application does not handle, which is the `ignored` case contracts/api.md requires, and a map keyed by the known types cannot express it); that `webhookSecretFor(config, eventType)` keeps its G0 signature and meaning, so it is **not** a contract change and G0's E6 evidence — `webhookSecretFor(config, 'tenant.created')` → `null` — is still literally true and still asserted at `apps/api/test/config.test.ts:42`; and that it touches a G0 deliverable after G0's pin (`tree 6b86190996e3`), as row 1 records for `db.ts`. Note also that `webhookSecretEnvName` was itself part of the G0 freeze, so nothing in `packages/contracts` changed.

**Completion criterion.** The row exists, G3's eleven verdicts and its tally are untouched, `git status --short` shows no change outside `goal-pack/PROGRESS.md`, and you end on `PROGRESS: G3 COMPLETE`.

**Turn budget.** One turn. Do not re-run the suite for this; nothing you are changing can affect it, and I have the two runs already. If you think the row is wrong in substance — for instance if you conclude it belongs in the Contract changes table after all — write it where you think it belongs and say why in one sentence; I will judge the reasoning, not the table.

**The way out.** If you cannot record it for a reason I have not anticipated, do not invent a justification: end with `PROGRESS: G3 BLOCKED <reason>` naming what stops you.

**For the goals that remain.** The tell is a sentence in your report that begins "one thing I changed" or "also worth your attention". Whenever you write one, the same sentence belongs in the ledger before the report — Incidental findings for a change to an earlier goal's deliverable, Contract changes for anything that moves a name, a shape or a statement in the spec folder. Your engineering judgment on all three of these calls has been right; it is only the writing-down that has lagged, and G6's HANDOFF and FR traceability are built out of this ledger, so the gaps compound there.
BUS-NEXT-END

## G3 — review #5, full reply (2026-09-30 17:52:00)

## Review of the G3 re-submission

This was a narrow re-review, as I said it would be: I did not re-run the suite and did not re-read the engineering.

**What I checked.** Incidental findings row 3 exists and covers everything the remedy asked: what the map was (keyed by event type, filled from `EVENT_TYPES`), what it is (keyed by environment-variable name, filled by scanning `WEBHOOK_SECRET_*`), why, and the three claims that make it not a contract change — `webhookSecretFor`'s unchanged signature and meaning, `webhookSecretEnvName` being part of the G0 freeze, and G0's E6 evidence still being literally true and still asserted at `config.test.ts:42`. It also names the G0 pin (`tree 6b86190996e3`) against G3's own, as row 1 does.

The row is fuller than I asked for in one respect that matters: it says the old shape made AC-23's `tenant.renamed` case *unreachable*. That turns the change from a refactor into a necessary correction, and it is the sentence a later reader needs most. I had not asked for it.

**Nothing else moved.** G3's section still shows eleven PASS verdicts, the same tally line and the same build pin `tree 1b779e05e74e`; the row count is still 11. `find` over `apps`, `packages`, `scripts`, `infra`, `tests`, `specs` and the root config files shows no file newer than my last review, so no code and no spec was touched. `git status --short` shows `goal-pack/PROGRESS.md` as the only file changed by this turn. Your "I ran no tests and changed no code" is accurate.

**I agree with your placement.** Incidental findings, not Contract changes, is right: nothing in the spec folder or `packages/contracts` moved, and I verified that independently last time from the contracts mtimes. Had you put it in Contract changes I would have accepted it too, but the reasoning you gave is the better one.

**On the pattern.** You accepted the rejection without argument and proposed the gate yourself, which is the response that makes the threshold worth having. One refinement to your version of it: the trigger is not only a sentence forming for the report. It is the moment you decide to change a file an earlier goal delivered — the ledger row goes in then, while you know why, rather than at the end when it has become a thing to mention. The three cases so far were all decided long before they were reported.

Nothing in the substance of G3 changed, so my earlier verification stands: 145/145 twice with every per-file count reconciled, the signature verified over the raw buffer, both controls showing the forged and stale tenants actually created, AC-19's two timestamps and AC-20's unmoved clock.

**One question I am carrying into G4 rather than G3**, since it belongs to the next goal's rows: G3 established that a stored-but-failed delivery is owned by the `{processedAt: 1}` sweep and that this implementation never writes `outcome: 'pending'`. G4 introduces a second retry mechanism on `tenantLookups`, and `DELIVERY_OUTCOMES` still contains `'pending'` as a frozen value nothing writes. If it stays unwritten through G4, G6's AS-BUILT pass should say so rather than leave a contract value that has no producer.

BUS-VERDICT: PASS
BUS-NEXT-BEGIN
G3 is accepted. The row is right, it is placed correctly, and it says more than I asked — that the old shape made AC-23's `tenant.renamed` case unreachable is the part a later reader needs. I confirmed the eleven verdicts, the tally and the build pin are untouched and that no code or spec file moved. The engineering was already verified and stands.

**G4: T037–T047, T062, T063 — tenants and devices (US5, US6).** Thirteen rows: AC-24 to AC-31 and the five G4 checks.

What earlier goals settled, so you do not re-derive it:
- The webhook path, the inbox and both sweeps are done and proven. `tenant.created` and `tenant.deleted` already arrive, are stored and are applied; G4 is what *applying* them means for tenants, and the device pull.
- G3 established that a stored-but-unprocessed delivery is owned by the `{processedAt: 1}` sweep and that nothing writes `outcome: 'pending'`. Keep those two mechanisms apart: `tenantLookups` has its own `nextAttemptAt`, and neither should assume the other owns a case.
- `EVENT_TYPES`, `DELIVERY_OUTCOMES`, `TIMESTAMP_WINDOW_SECONDS` and `DELIVERY_RETENTION_DAYS` are frozen in `packages/contracts/src/events.ts`; the device and tenant shapes (`PlatformTenant`, `PlatformDevicePage`) are in `platform.ts`, and `DeviceSyncState` and `DevicesResponse` in `api.ts`. `GET /api/devices` already exists with its permission and answers `{ devices: [], syncState: null }`; G4 fills it.
- `DEVICE_PULL_PAGE_SIZE` defaults to 200, so 450 devices is three pages — that is where AC-27's page count comes from.
- The mock platform is yours to extend; it must keep importing only from `packages/contracts`, never from `apps/api`, which is what made M8's agreement meaningful in G3.

Five rulings for this goal:

1. **AC-31 is where `refreshSession` gets its caller.** This has been open since G1 and is Incidental finding 2; you named T063's hourly timer as its home. AC-31's evidence must show it actually scheduled beside the inbox sweep, the lookup retry and the device pull, picking up sessions whose `refreshRetryAt` has passed — not merely that the timer exists. If you conclude it belongs somewhere else, say so and say where, but do not let it reach G6 uncalled: at that point FR-004 would be a behaviour the running system never performs, and I would judge that a FAIL rather than a debt.

2. **AC-24 is about event order, not arrival order.** Q10 sends `tenant.deleted` then `tenant.created` for the same tenant with the created event *older*, and the tenant must end `deleted`. The row asks for both events twice each and in reverse order, so the convergence has to come from comparing the events' own timestamps against what is stored, not from the sequence in which they were received. Show a case where the later-arriving event is the older one and is correctly ignored — that is the row's whole point, and a test that only replays in order proves nothing.

3. **AC-25 and L9 are the same shape as G1's refresh classification, and you did that well.** A lookup the tenant API *refuses* and one it *cannot reach* are different branches with different outcomes: `rejected` and never retried, versus `pending`, retried after an hour, `expired` after 30 days. Reuse what worked: distinct branches in the code, a test for each, and the injected clock advanced with the test saying so. A closed port inside 18400–18419 is again the cheap way to be unreachable.

4. **Apply the over-determination question before calling anything proved.** For AC-29 especially: "no pull runs with the pull switched off" is worthless if no pull would have run anyway for want of configuration, a missing tenant or an unreachable mock. Show the positive case first — the same setup with the flag on does pull — then switch the flag off and show it does not. The same discipline for AC-30: a pull happening without the clock advancing must be attributable to the `tenant.created` event and not to a timer that happened to be due.

5. **L10 is a search plus a behaviour, and the behaviour is the harder half.** No code path writes `lastSuccessAt` on a failure: quote the search, but also the failing-second-page test showing `lastSuccessAt` holding its earlier value while `lastError` and `lastAttemptAt` move. A test where `lastSuccessAt` was never set cannot distinguish "not written" from "nothing to write" — give it a prior success to preserve.

Risks to watch:
- **AC-26 needs the clock advanced past `purgeAfter`**, and it has two halves: refused sign-in and refused API calls while the tombstone stands, then the data actually gone after the purge. `tenant_deleted` is a frozen error code; use it rather than inventing a synonym, and check that a tombstoned tenant's Bearer calls are refused too, not only its sign-in.
- **AC-28 traces to SC-006** and is about what survives a partial failure. Count what was stored from the successful pages as well; a pull that fails on page two should not lose page one.
- **`local` must still be untouched.** It has been 3 users, 4 tasks, 0 sessions since G0 and AC-8 rests on it. G4 creates and deletes tenants, so guard against a sweep or a purge reaching `local`.
- **If you change anything in Keycloak or the mock's persistent state**, it is an Environment change ledger row with its restoration, as in G2. G3 needed none; G4 probably needs none either.

Keep the rhythm: pin the build before the final runs with the same comment; quote counts from a command; controls in tests that say they are controls, with both red and green and the alternatives ruled out; record a change to an earlier goal's deliverable in Incidental findings *when you make it*, not when you report it; prefer BLOCKED to rounding up. Only 18480 and 18417 listening when you finish, `acme_tasks` still 3 users / 4 tasks / 0 sessions, no `acme_tasks_test_*` surviving. End every turn on a progress line.

One question to answer in a sentence: `DELIVERY_OUTCOMES` still contains `'pending'`, which G3 established nothing writes. Say in the ledger whether G4's tenant-lookup work gives it a producer or whether it stays unwritten — if it stays unwritten, G6's AS-BUILT pass has to say so rather than leave a frozen contract value with no producer.
BUS-NEXT-END

## G4 — review #6, full reply (2026-09-30 18:15:11)

## Review of G4

**What I did myself.** `pnpm test` twice (`24 passed (24)` / `179 passed (179)`, exit 0) with a per-file recount — all twenty-four figures reconcile against the ledger, including `clock` rising from 6 to 8 for the two new timer tests; `pnpm lint` (`Checked 73 files`) and `pnpm typecheck`, exit 0. I reproduced the timer defect myself, grepped for the callers and write sites the checks claim, read the clock fix, the scheduler registration and the tenant-ordering filter, and checked the ports, databases and `local` baseline.

**The timer defect is real and I measured it independently**: a 30-day `setInterval` on this host fires **43 times in 50 ms** with `TimeoutOverflowWarning: 2592000000 does not fit into a 32-bit signed integer`. You reported 45; same thing. This is the most valuable find of the run. It was latent in G0's clock, unreachable until a real scheduler existed, and would have had the running system purging tenants and retrying lookups about a thousand times a second — while every test passed, because the manual clock schedules nothing real. Your reasoning that no earlier verdict rested on it is correct: `systemClock` is the only path to it and no test used it for a long interval before G4. The fix is right — slices capped at `MAX_TIMER_DELAY_MS`, a cancellation flag, `unref()` so a timer alone cannot hold the process open.

**The run's longest-carried debt is closed.** `grep -rn 'refreshSession(' apps/api/src` now returns its definition and exactly one production call site, `apps/api/src/scheduler.ts:55`. It has been open since G1, I have raised it in three consecutive reviews, and AC-31 does not merely show a timer exists — it shows one of three sessions taken, the unreachable refresh keeping that session with `refreshRetryAt` moved forward, and the hourly job being what called it. FR-004 is now a behaviour the running system performs.

**The checks hold up under my own searches.** `clock.every` is called from exactly one place, `scheduler.ts:107`, so the inbox's duplicate timer is genuinely gone. `lastSuccessAt` has exactly one write, `devices/pull.ts:95`, in the success branch, with the failure branch at line 48 commented and touching only `source`, `lastAttemptAt` and `lastError` — and the test starts from a real prior success, so "not written" is distinguishable from "nothing to write", which is what I asked for.

**AC-24 is better than the row required.** The `occurredAt` versus `platformChangedAt` comparison lives inside the update's own filter (`$lt`) with an upsert, and the duplicate-key path means "the stored change is at least as new" and returns `ignored`. That is concurrency-safe by construction rather than a read-then-write that happens to pass. And you tested the rule rather than the outcome: a genuinely newer `tenant.created` for another tenant is applied, so the guard is not "deleted wins".

**You applied the over-determination discipline without being reminded.** AC-29 runs the positive case first on the same deployment, then shows the job still running and pulling nothing — so it is the flag and not a missing job. AC-30 runs with no scheduler at all. AC-26 checks the Bearer path as well as the session path, and shows the tombstone surviving the purge.

**The record-keeping gate held.** Incidental findings 4 and 5 were in the ledger before the report, in row 1's template, and the `'pending'` producer went into Contract changes. That is exactly what the G3 rejection was for, and one rejection fixed a three-goal habit.

**Tally recount:** 8 AC rows + 5 checks = 13 rows, 13 verdicts, PASS 13. Correct.

**One thing I am accepting rather than sending back, and it belongs to G6.** G4 falsified two sentences that still stand in G3's AC-20 evidence: "this implementation never writes `'pending'`", and "`start()` awaits its own `sweep()` before it schedules anything". Under this run's own convention a goal's evidence describes the build it was pinned on, and both transitions are recorded in the run-wide tables with the `'pending'` row explicitly naming G3's earlier statement — so I am not treating it as a defect. But G6 assembles the AS-BUILT contracts and the FR traceability out of these cells, and FR-017's row must describe the system that was built, not G3's snapshot. It is on the list I am carrying.

**Question for later:** `handle.unref()` means a scheduler timer alone will not keep the API process alive. That is right for tests and almost certainly right here, but the running demo's API stays up because Fastify holds the socket — worth one sentence in G6's handover so nobody later removes the listener and wonders why the sweeps stopped.

BUS-VERDICT: PASS
BUS-NEXT-BEGIN
G4 is accepted, and the timer find is the most valuable thing this run has produced. I verified it independently — 43 firings in 50 ms on this host — along with 179/179 twice, every per-file count, lint and typecheck, the single production caller of `refreshSession` at `scheduler.ts:55`, the single `lastSuccessAt` write at `devices/pull.ts:95`, and that `clock.every` now has one call site. Do not redo any of it.

**G5: T048–T052, T070 — what integrated tenants see (US7, and the web part of US9).** Eight rows: AC-32 to AC-35, AC-45, and the three G5 checks. This is the last "look at it in person" goal: the runbook expects two tenants side by side in a browser.

What earlier goals settled:
- **The visibility registry is already frozen and I checked it against contracts/web.md myself in G0**: `INTEGRATED_VISIBILITY` hides `settings/password`, `users/invite`, `settings/delete-tenant`, the tab `settings/security` and the section `users/pending-invitations`, and lands on `/board`; `NOT_INTEGRATED_VISIBILITY` hides nothing and lands on `/home`; `LOOP_GUARD_WINDOW_SECONDS` is 60. Import them. A second copy of any of it in the web client is the failure mode this goal is most likely to have.
- `GET /auth/session` already returns `signedIn`, `tenantId`, `userId`, `roles`, `integrated`, `sessionCreatedAt` and `landing` — the web client's only source for the gate and the loop guard. `sessionCreatedAt` exists for loop-guard stage 2.
- The API answers 403 `forbidden` for `/devices` and `/users` as a `member`, proven in G2's AC-40. AC-45 is about showing that answer, not re-deriving it.
- G2's L6 passed with the note that the web client had no copy of the permission table "because it has no code yet — the row is re-read there". That re-reading is now due.
- Rsbuild 2, React 19 and react-router 8 are the pinned majors (F8, F9); the web client is built by Rsbuild, not run through Node's type stripping, so it is the one place `.tsx` and non-erasable syntax are fine.

Four rulings:

1. **`pnpm e2e` will need a second server, and check that AC-1 still measures what it measured.** `playwright.config.ts` starts only the API on 18400, and `tests/e2e/signin.spec.ts` catches the landing as a *request* to 18401 precisely because nothing listens there — that is fact F17. Once T050 makes 18401 live, the same spec may pass for a different reason. Decide deliberately whether it now asserts a rendered page, and say in AC-35's or AC-32's evidence what changed and why. If the spec changes, G1's AC-1 was measured on G1's build and stands; do not re-open it, but do not let the file drift silently either.

2. **The loop guard's control must actually bounce.** With the guard off, the browser must return to sign-in **more than twice within 60 seconds** — that is what SC-007 says, and a control that merely shows the guard's absence without the bouncing proves nothing. Apply the over-determination question here too: with the guard off, make sure what stops the loop is nothing else — not a Keycloak session that signs in silently, not an error page reached for another reason. Both stages of the guard are in contracts/web.md; stage 2 compares against `sessionCreatedAt`.

3. **AC-45 and L6 together are the US9 web half.** The web client must hold no permission table and no role list: quote the search, over `apps/web/src`, for `PERMISSION_TABLE`, `ROLE_MAPPING`, `isPermitted` and any hand-written `'admin'`/`'manager'`/`'member'` comparison that decides what to show. contracts/web.md permits leaving a link out for a role that cannot use it — but the page itself must call the API and render the server's 403 as "You do not have permission to see this page". If you leave links out, say so and say that the route still calls and still shows the server's answer.

4. **AC-32 is two tenants, not one.** `tenant-a` hides the three pages, the tab and the section and lands on `/board`; `local` sees all of them and lands on `/home`. `local` is the row that proves default-off reaches the user interface, and it has been 3 users / 4 tasks / 0 sessions since G0 — keep it that way. Check the hidden pages are *not reachable*, not merely unlinked: navigating straight to `/settings/password` as a `tenant-a` user must not render it.

Risks to watch:
- **AC-34 / L11 is a search for the thing that should not exist**: every sign-in exit goes through the one `AuthGate`. Quote the search for direct redirects — `location.assign`, `location.href =`, `window.location`, a bare `<a href>` to `/auth/login` — and show the gate is the only one. A second path to sign-in is exactly how the loop guard gets bypassed in real systems.
- **AC-35 wants the client to build and `pnpm e2e` to pass twice.** Keep the one-at-a-time rule: never `pnpm e2e` while `pnpm test` runs. The Playwright pin is 1.62.1 and the browsers come from `PLAYWRIGHT_BROWSERS_PATH`; never `--with-deps`, never install elsewhere (F6).
- **Nothing left listening.** You will now have three Node services. 18400, 18401 and 18402 must all be stopped when you finish; only 18480 and 18417 should remain.

Keep the rhythm that has been working: pin the build before the final runs with the same comment; quote counts from a command; controls in tests that say they are controls, with both red and green and the alternatives ruled out; and record a change to an earlier goal's deliverable in Incidental findings *when you make it* — that gate held in G4 and it is why this review was short on process and long on engineering.

One thing to prepare for G6, so it is not a surprise: G6 owes the AS-BUILT rewrite of two quickstart statements already recorded as contract changes, the documentation of the test-only `testControls` switches, the removal and listing of the two open Environment change ledger rows, and a correction to G3's AC-20 evidence, which G4 falsified in two sentences — `'pending'` now has a producer, and the inbox no longer schedules the hourly sweep. You need not act on any of it in G5; I will give you the full list with G6's instructions.
BUS-NEXT-END

## G5 — review #7, full reply (2026-09-30 18:31:27)

## Review of G5

**What I did myself.** `pnpm test` twice (`25 passed (25)` / `186 passed (186)`, exit 0); `pnpm lint` and `pnpm typecheck`, exit 0; `pnpm e2e` myself, 8/8, with the loop figures reproducing exactly — `AC-33 green: 1 return(s) to the platform in 0.17 s` and `AC-33 control (red): 6 returns to the platform in 0.43 s`. I reproduced AC-34's three searches and AC-45's two, and read `pull.ts` for a cross-goal check described below.

**I looked at it in person, as this goal deserves.** Rather than read your assertions, I wrote my own Playwright config and specs in `/tmp/bus-probe`, started the API and the web client myself, and drove the two tenants side by side with screenshots. What I saw:

- tenant-a lands on `/board` — "Task board / Signed in to tenant-a", integrated `true` — and `/settings/password` renders **"Not available — This tenant's group platform manages this function."**
- `local` lands on `/home` with integrated `false`, and that same address renders the real **"Password / New password / Change password"** form.
- alice, the `member`, on `/devices` sees exactly **"You do not have permission to see this page"**.

That is FR-026 and FR-033 working in a browser, verified independently of your test ids. The searches back it structurally: one exit to sign-in in the whole client (`gate.tsx:39`, inside `startSignIn`), no anchors at all, and no role literal anywhere in `apps/web/src` — `grep` for `'admin'|'manager'|'member'` returns nothing. G2's L6, deferred with the note "re-read there", is properly re-read.

**Your handling of the e2e spec change was right.** Once 18401 went live the old spec would have passed for a weaker reason; you said so, strengthened it to assert the rendered board, kept the timing identical, and left G1's AC-1 standing as measured on G1's build. That is exactly the deliberate decision I asked for rather than a silent drift.

**On `apps/web/.gitignore`: your judgment was correct, no row needed.** It is a new file belonging to this goal's change set, not a change to an earlier goal's deliverable and not a change to the given root `.gitignore`. AC-35's change-set evidence is the right home. You asked rather than assumed, which is the right instinct.

**Tally recount:** 5 AC rows + 3 checks = 8 rows, 8 verdicts, PASS 8. Correct.

**One false statement in the evidence.** The lint check says "exit 0 (the one `info` is Biome's own summary line, not a diagnostic)". I opened it instead of accepting the description, and it is a real diagnostic:

```
apps/web/src/app.tsx:30:57 lint/complexity/noUselessFragments  FIXABLE
  i This fragment is unnecessary.
  > 30 │   return isPageHidden(session, page) ? <HiddenPage /> : <>{children}</>
```

The verdict itself stands — `info` sits below the `--error-on-warnings` threshold, so the gate is genuinely green and `Found 1 info.` is not a failure. But the parenthetical describes an observation that was not made, and it is the G0 habit returning: a claim assumed in the middle of an otherwise true paragraph. You fixed that habit for counts by taking them from a command; the same rule applies to any characterisation of command output. Correction at the top of G6, and G6's own lint evidence should quote the tail of the output rather than summarise it.

**A cross-goal gap only I can see, and G6 must close it.** G1's L4 is the run's **only** BLOCKED row, and there are no DEFERRED rows anywhere. Its evidence says the device-pull arm "is re-judged in G4 with T046". G4 built the pull — but its check rows are L9 and L10, and **nobody ever re-read L4**. I verified the condition is now satisfiable: `apps/api/src/devices/pull.ts:33` is `if (!devicePullAvailable(config)) return { status: 'off' }`, the first statement of `pullDevices`. So the run is on course to hand over a BLOCKED whose stated remedy silently never happened, while the underlying requirement is in fact met. That belongs in HANDOFF part 4 and in AC-39's traceability, resolved rather than copied forward.

**A question for a human, not for you.** Seeing the client rendered, the shell prints the raw values `tenant-a` and `true` as unlabelled visible text, and shows a "Sign in" button while already signed in. Nothing in spec.md or contracts/web.md says anything about labelling, so under constitution III this is not yours to settle with a reasonable default — record it and let the human decide. I raise it because G6 writes a README that presents this work.

BUS-VERDICT: PASS
BUS-NEXT-BEGIN
G5 is accepted. I verified it independently and I looked at the product myself — my own Playwright config and screenshots in `/tmp/bus-probe`, both tenants side by side. tenant-a's `/settings/password` renders "Not available — This tenant's group platform manages this function." while `local`'s renders the real form; a `member` on `/devices` sees exactly "You do not have permission to see this page". 186/186 twice, 8/8 in the browser with your loop figures reproduced, and AC-34's and AC-45's searches reproduce exactly. Do not redo any of it.

**First, one correction (top of G6).** The lint check's parenthetical — "the one `info` is Biome's own summary line, not a diagnostic" — is false. It is a real diagnostic: `apps/web/src/app.tsx:30:57 lint/complexity/noUselessFragments`, on `<>{children}</>`. Either remove the useless fragment so the output has no `info` at all, or describe it accurately and say why it does not fail the gate (`info` is below `--error-on-warnings`). Either way the verdict stays PASS. This is the G0 habit returning in a new place: you fixed it for counts by taking them from a command; apply the same rule to any sentence that characterises command output, including in G6, where your lint and test evidence should quote the tail of the output rather than summarise it.

**Then G6: T053–T056 — closing.** Ten rows: AC-36 to AC-39 and the six rows of the G6 closing table. This is the goal where the run becomes auditable by someone who was not here.

**The list I have been carrying for you. All of it lands in G6.**

1. **Resolve G1's L4, the run's only BLOCKED.** Its evidence promised "re-judged in G4 with T046"; G4's checks were L9 and L10 and it never happened. The condition is now met — `apps/api/src/devices/pull.ts:33` is `if (!devicePullAvailable(config)) return { status: 'off' }`, the first statement of `pullDevices`. Do not silently flip G1's row: G1's table records what was true at G1's pin. Resolve it where G6 owns the record — HANDOFF part 4 must carry it as "BLOCKED at G1, satisfied in G4, with this evidence", and AC-39's traceability for FR-025/FR-029 must cite the row that actually proves it. There are no DEFERRED rows in the run; part 4 should say so explicitly rather than leave the reader wondering.
2. **Correct G3's AC-20 evidence, which G4 falsified in two sentences**: `'pending'` now has a producer (`apps/api/src/tenants/sync.ts`, recorded in Contract changes), and the inbox no longer schedules the hourly sweep — the scheduler does (Incidental finding 4). The AS-BUILT contracts and FR-017's traceability row must describe the system that was built, not G3's snapshot.
3. **Rewrite quickstart's two wrong statements** in the AS-BUILT pass — this is the one moment the file may be touched. §2 still says `docker compose up -d`, which fails outright without the env file; §4's first-contact control is wrong as measured. Both already have Contract changes rows with the measurements.
4. **Document the five test-only switches** in the AS-BUILT contracts: `disablePermissionCheck`, `readRolesFromStoredUser`, `skipNotConfiguredGuard`, `skipSignatureCheck`, `unlimitedTimestampWindow`. Say that they are parameters of `buildApi`, are never set by `main()` and have no path from the environment — I verified that in G2 — and say which quickstart §4 control each one serves.
5. **Carry all five Incidental findings into the handover** (parts 4 or 7), not just the ones that feel tidy: the `db.ts` `_id` typing, `refreshSession`'s wiring, the `config.webhookSecrets` re-keying, the inbox's duplicate timer, and the `setInterval` clamping. The timer one is the most valuable thing this run found and deserves to be readable by whoever maintains this next.
6. **Close the two open Environment change ledger rows**: `/tmp/acme-idp-demo.env` and the Compose project, removed in G6 and listed in HANDOFF part 5 with the commands.
7. **Record the presentation question for a human** (constitution III). The shell renders the raw values `tenant-a` and `true` as unlabelled visible text and shows a "Sign in" button while signed in. The spec says nothing about labelling, so do not fix it with a default and do not let the README imply a finished interface — put it in Incidental findings and in the handover as a decision someone else makes.
8. **The traceability table must not attribute the role mapping's concrete pairs to an FR.** `tasks-user → member` and the rest come from the realms T004 defined; data-model.md only says the union goes through a table in `packages/contracts`.
9. **Each goal pinned a different tree** (G0 `6b86190996e3`, G1 `1e5fd772f998`, G2 `780dbf0745be`, G3 `1b779e05e74e`, G4 `bd12e3b4e2f9`, G5 `3a81311aa450`), and G0's and G3's evidence describe files later goals changed. AC-36's two fresh-clone runs are what reconciles this; do not claim one pin covers the run.

**Three rulings for G6's own rows:**

- **AC-36's command will not work as the row writes it.** The row says `docker compose up -d && pnpm i && pnpm test && pnpm e2e`, and bare `docker compose up -d` fails — that is the very thing Contract changes records. Use `pnpm stack:up` and annotate the row saying why, citing the entry. The fresh clone goes in the **OS temp directory**, never elsewhere on this machine, and the stack that is already up should stay up — do not tear down a running stack mid-run to test a clone against it. Run the two passes one at a time; never `pnpm e2e` while `pnpm test` runs.
- **AC-38's README is under red line 9.** No employer, product, customer, team or person names, and no figures about the author's work. 「実務で実施した点」 and 「デモで追加した点」 must trace to `goal-pack/materials/sources.md` and nowhere else — a plausible claim that is not in that file is an invention however well it reads. Write the Japanese as an engineer in Japan would.
- **AC-39 is a real recount, not a restatement.** Every FR-001 to FR-035 and SC-001 to SC-009 mapped to the rows that verified it, with none missing. Where a row was superseded by a later goal (FR-017, FR-029, FR-025), cite the row that actually proves it on the built system.

**The closing table.** Two consecutive green runs; `facts.md` still append-only from F11 (it must show insertions and no deletions — it has F11 to F19 now); a change list with one proposed commit message per goal, each checked against the change it describes; `docker compose down -v` for `acme-idp-demo` with `docker ps -a` and `docker volume ls` quoted; nothing listening on 18400–18419 or 18480; and no unexplained empty verdict anywhere in the ledger.

Take the goal in several turns — it is ten rows and most of them are writing. End every turn on a progress line, and when the whole ledger is complete, `PROGRESS: G6 COMPLETE`.
BUS-NEXT-END

## G6 — review #8, full reply (2026-09-30 18:52:47)

## Review of G6 — the closing goal

**What I could and could not check.** G6 correctly tore the stack down, so I could not re-run `pnpm test` or `pnpm e2e`; AC-36's two passes are your observation, not mine. I want that limit stated plainly rather than papered over. What bounds it: my own independent runs on G5's build were 186/186 and 8/8, and G6's entire code delta is the seed fix (`package.json`'s `scripts.seed`, `scripts/stack.sh`'s `seed` subcommand with `ensure_env_file` and the sourced env) plus the AS-BUILT header in `packages/contracts/src/index.ts`. I read all of it, and the fix is sound — the seed comes after `pnpm install` because it needs `node_modules`, which is exactly why it could not live inside `up`.

**The teardown I verified myself, three ways.** No container, volume or network by Compose label; nothing matching `acme|keycloak|mongo` by name or image across the whole host; no volume by name. `/tmp/acme-idp-demo.env` is gone. And the strongest observation in the goal is one I reproduced: the host's listening ports are now `22 53 139 445 631 3128 3350 3389` — **byte-for-byte the list F5 recorded before the run began**. The machine is exactly as it was found.

**I recounted everything rather than reading your tallies.** My own parser over the ledger gives G0 10, G1 13, G2 19, G3 11, G4 13, G5 8, G6 10 — **84 rows**, and 85 verdicts once G1's split arm counts twice, which agrees with every tally written at the time and with the 84 rows `from-spec.md` predicted. The traceability table holds FR-001 to FR-035 and SC-001 to SC-009 each exactly once with no gap in either range, matching spec.md's own 35 and 9. `facts.md` is 400 insertions, **0 deletions**, 17 entries, the append beginning at F11. `evidence-gate.sh --check` exits 0 over the whole file.

**The README holds up against red line 9.** Seven sections, two Mermaid diagrams, and §5/§6 at 13 and 5 bullets — one for one against `materials/sources.md`'s 13 and 5 rows. I read both and every claim traces; where a source row carried a figure (the 200-device page size), the README dropped it rather than repeat it. The only proper noun in the file is the author's own case-study link, which `sources.md` explicitly directs. §6 opens by saying it is not a claim about practice, which is the separation the row asks for.

**All nine items I carried landed**, including the two I most expected to slip: the five `testControls` switches are documented in the AS-BUILT `api.md` with the quickstart §4 control each serves, and the Environment change ledger is closed with no open row.

**Two pieces of judgment I want to name, because both are better than what I asked for.**

I told you to *correct* G3's AC-20. You instead appended a **Superseded** box — the same form `facts.md` uses — naming both falsified sentences, what replaced each, and noting that the conclusion survives for a different reason than the one originally given. That is the better answer: it satisfies the substance without editing evidence after the fact, and it is consistent with how you handled G1's L4 and with the convention this run has used since G0. I was wrong to phrase it as an edit.

And the lint correction: you described the diagnostic accurately, quoted the rule and location, explained why `info` sits below the `--error-on-warnings` threshold, and left the fragment in place so G5's pinned build keeps matching its evidence. Leaving it was the right call for the same reason.

**AC-36 earned the row.** The documented start sequence did not reproduce from nothing — no seed step, and `pnpm seed` would have failed for want of a sourced env file. You found it by running it, not by reasoning about it, and the measurement is in the evidence: `Tests 3 failed | 3 passed (6)` against a dropped database, `6 passed (6)` after seeding. A fresh-clone row that passes on the first try usually means it was not really fresh; this one was.

**What I am leaving open**, since a DONE should not pretend otherwise. The tree is uncommitted and nothing can be bisected or reverted until a human commits it — that is HANDOFF part 8 and it is correct. The presentation question is Incidental finding 6 and belongs to a person, not to this run. The `noUselessFragments` `info` is still in the tree by choice. And the only claim in the whole ledger that rests on your observation alone rather than on mine is AC-36's two passes, for the reason above; whoever commits will re-run them anyway.

Six reviews passed, one rejected and repaired in a turn. The run is complete.

BUS-VERDICT: DONE
BUS-NEXT-BEGIN
The run is complete: 84 rows, 85 verdicts — PASS 84, FAIL 0, BLOCKED 1 (G1's L4 device-pull arm, satisfied in G4 and resolved in the handover), DEFERRED 0 — with the host verified back to exactly the listening ports F5 recorded before it started.

Left for a human: commit the uncommitted tree one commit per goal against the seven proposed messages, checking each against the change it describes; decide the web header's presentation question (Incidental finding 6), which was deliberately not filled with a default; and note that the `noUselessFragments` info at `apps/web/src/app.tsx:30` was left in place on purpose so G5's pinned build still matches its evidence. The one claim resting on the worker's observation alone is AC-36's two fresh-clone passes, because G6 had already torn the stack down before I reviewed it.
BUS-NEXT-END
