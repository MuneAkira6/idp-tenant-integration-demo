
## Bus seeded (2026-09-30 16:11:31)

- session: `fb009345-975a-47b7-acf7-b6096047405c`
- model: opus[1m]

## G0 — review #1 (2026-09-30 16:41:24)

**Verdict: PASS** (bus context: 115494 tokens)

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

## G1 — review #2 (2026-09-30 17:08:39)

**Verdict: PASS** (bus context: 164050 tokens)

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

## G2 — review #3 (2026-09-30 17:34:04)

**Verdict: PASS** (bus context: 202473 tokens)

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

## G3 — review #4 (2026-09-30 17:49:19)

**Verdict: REJECT** (bus context: 230343 tokens)

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

## G3 — review #5 (2026-09-30 17:52:00)

**Verdict: PASS** (bus context: 239112 tokens)

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

## G4 — review #6 (2026-09-30 18:15:11)

**Verdict: PASS** (bus context: 265637 tokens)

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

## G5 — review #7 (2026-09-30 18:31:27)

**Verdict: PASS** (bus context: 299753 tokens)

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

## G6 — review #8 (2026-09-30 18:52:47)

**Verdict: DONE** (bus context: 334905 tokens)

The run is complete: 84 rows, 85 verdicts — PASS 84, FAIL 0, BLOCKED 1 (G1's L4 device-pull arm, satisfied in G4 and resolved in the handover), DEFERRED 0 — with the host verified back to exactly the listening ports F5 recorded before it started.

Left for a human: commit the uncommitted tree one commit per goal against the seven proposed messages, checking each against the change it describes; decide the web header's presentation question (Incidental finding 6), which was deliberately not filled with a default; and note that the `noUselessFragments` info at `apps/web/src/app.tsx:30` was left in place on purpose so G5's pinned build still matches its evidence. The one claim resting on the worker's observation alone is AC-36's two fresh-clone passes, because G6 had already torn the stack down before I reviewed it.
