# Goal brief — idp-tenant-integration-demo

> This file is the worker's only entry point. Read all of it before you start.
> Scope of the run: [SCOPE.md](SCOPE.md). Ledger: [PROGRESS.md](PROGRESS.md). Human manual:
> [runbook.md](runbook.md). **The requirement is the spec folder**:
> [specs/001-idp-tenant-integration/](../specs/001-idp-tenant-integration/spec.md).

## Mission

Implement the spec in `specs/001-idp-tenant-integration/` as a working local demo: Acme Tasks, a
fictional multi-tenant task SaaS, joins a group platform (played by Keycloak and a mock service) without
a second session, with signed events, tenant sync, device pulls, permissions decided on the server, one
visibility registry, and everything off until configured. Every guard is proved by a control that shows
it red.

| Goal | Scope | In one line |
|---|---|---|
| G0 | stack | workspace, Compose, realms, token shapes measured, contracts frozen, clock, config, database, mock, seed |
| G1 | US1, US8 | sign-in with PKCE into a server-side session; nothing changes until configured |
| G2 | US2, US3, US9 | Bearer tokens on the existing API; exactly one user on first contact; roles; permissions |
| G3 | US4 | signed webhooks: store first, acknowledge, process; sweeps; subscriptions |
| G4 | US5, US6 | tenant sync with claims and tombstones; lookups; device pulls |
| G5 | US7 | the web client: one gate, one registry, the loop guard, the server's 403 shown |
| G6 | closing | two green runs, contracts AS-BUILT, README with the diagrams, HANDOFF |

Every row is already listed in PROGRESS.md. Do not add or remove rows; to change a plan, write the
reason in PROGRESS.md first. The tasks T001–T070 of `tasks.md` are the work items; the rows are what
the bus judges.

## Required reading

| Resource | Why |
|---|---|
| [spec.md](../specs/001-idp-tenant-integration/spec.md) with its Clarifications, Permissions and disposition table | the requirement |
| [plan.md](../specs/001-idp-tenant-integration/plan.md), [research.md](../specs/001-idp-tenant-integration/research.md) | the decisions and why |
| [facts.md](../specs/001-idp-tenant-integration/facts.md) | the measured facts; you append yours from F11 on |
| [data-model.md](../specs/001-idp-tenant-integration/data-model.md), [contracts/](../specs/001-idp-tenant-integration/contracts/api.md) | the names and shapes you freeze in G0, the permission table included |
| [quickstart.md](../specs/001-idp-tenant-integration/quickstart.md) | the scenarios Q1–Q18 and the controls |
| [tasks.md](../specs/001-idp-tenant-integration/tasks.md) | the work, by user story, and the checklists M1–M12 and L1–L12 |
| [SCOPE.md](SCOPE.md), [materials/sources.md](materials/sources.md) | the rules of the run; what the README may say about the practice |
| [materials/playbook/](materials/playbook/README.md) | the forms of a fact entry, a verdict table and the handover |
| [PROGRESS.md](PROGRESS.md) | the rows you judge |

## Facts already verified — use them, do not re-investigate

Each fact has its entry in [facts.md](../specs/001-idp-tenant-integration/facts.md), with the command
and the output; the ids are those of the spec folder.

- F7: Linux (Ubuntu 20.04), Node `v24.19.0`; pnpm switches itself to `11.28.0` from `packageManager` (the global pnpm is 11.22.0; corepack is not enabled here, see red line 8).
- F8, F9: **dependencies, measured under the supply-chain settings** (`minimumReleaseAge: 4320`,
  `strictDepBuilds: true`, `allowBuilds: {}`): `@rsbuild/core` ^2, `@rsbuild/plugin-react` ^2,
  `react-router` ^8, `mongodb` ^7, `fastify` ^5, `@fastify/cookie` ^11, `openid-client` ^6, `jose` ^6,
  `react`/`react-dom` ^19, `vitest` ^5, `typescript` ^7, `@biomejs/biome` ^2, `@types/node` ^24 install
  with no build script. **Rsbuild 1 fails** (`[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts:
  core-js@3.47.0`), so do not downgrade; keep `allowBuilds` empty.
- F6: **Playwright is pinned at 1.62.1**: 1.63.0 refuses this host (`Playwright does not support
  chromium on ubuntu20.04-x64`). 1.62.1's Chromium is already installed in the directory
  `PLAYWRIGHT_BROWSERS_PATH` names; never pass `--with-deps` and never install browsers elsewhere.
- F3, F4: Docker `28.1.1`, Compose `v2.35.1`. Already pulled: `quay.io/keycloak/keycloak:26.7.4` (the
  newest stable tag) and `mongo:7` (`db version v7.0.43`).
- F5: ports 18400–18419 and 18480 are free; other services listen on this machine (3128 among them) and
  must not be touched.
- F10: the host has no Java and no MongoDB shell: use `docker compose exec mongodb mongosh` for queries.

Two rules of this machine, not measurements:

- The HTTPS proxy comes from environment variables: **never unset or print them.**
- Node runs `.ts` files directly for the API and the mock (type stripping): write erasable TypeScript
  only — no enums, namespaces or parameter properties — and keep `tsc --noEmit` as the compile check.
  The web client is built by Rsbuild.

## Facts you measure

When you measure something the spec depends on (G0: the token shapes of research R-2), append it to
facts.md as a new entry from F11 on, in the form of the entries above it
([materials/playbook/fact-entry.md](materials/playbook/fact-entry.md) is the playbook's form): the date,
the command, the output as printed (signatures cut, secrets never), what follows, and the decisions that
depend on it. Quote the entry's id in the PROGRESS row. When a measurement contradicts an existing
entry, add a "Superseded" box under that entry — never edit its text — and record it under "Contract
changes" if the spec depended on it.

## The constitution, verbatim

The lines you must not cross, as `.specify/memory/constitution.md` states them:

- **I. Agents Never Touch Branches.** AI agents MUST NOT create, switch, rename or delete branches, and
  MUST NOT commit or push. The spec folder is chosen by its explicit name, never derived by an agent
  creating a branch. Humans commit at goal boundaries and check every commit message against the change
  it describes. *(The recorded exception: during this unattended run the human commits after the run.
  For you nothing changes: never commit.)*
- **II. The Spec Folder Is the Requirement.** `specs/001-idp-tenant-integration/` is the single source
  of truth for what is built. A ticket, a chat message or a code comment is input to the spec, never a
  requirement by itself. When they disagree, the spec wins until the spec is changed on purpose, with
  the change recorded.
- **III. Humans Decide the Open Questions.** Every question that changes scope, security or what the
  user sees is handed to a human, one item at a time, with a recommendation and its reason. Agents MUST
  NOT fill such a gap with a "reasonable default". The answers are recorded in the spec's
  Clarifications section before planning starts.
- **IV. Measure Before Asserting.** Every statement about an external system (the IdP, the platform
  APIs, container images, the host) is recorded with its date, the command that measured it and the
  output. A fact is measured again before something depends on it. "Not declared in a document" does
  not mean "absent", and "the data exists" does not mean "our credentials can reach it": both are
  measured.
- **V. Verdicts Rest on Evidence.** Acceptance is judged per row with PASS, FAIL, BLOCKED or DEFERRED.
  PASS quotes what was observed; FAIL is written as "expected X / actual Y"; a precondition the
  environment cannot produce is BLOCKED, never PASS; DEFERRED names the decision it waits for. A test
  counts only after it has been seen to fail without the thing it guards (a control), and a verdict
  counts when two consecutive runs agree.
- **VI. Default Off, One Session Downstream (NON-NEGOTIABLE).** Every integration path is off until it
  is configured: no issuer configured means every external token is refused; no signing secret means
  every webhook is refused; the device pull and the tenant-level integration flag default to off.
  Tenants that are not integrated behave exactly as before. However many entry points there are, each
  one ends in the application's own session or principal; nothing downstream learns about the platform.
- **VII. Contracts Freeze Before Parallel Work.** The shared contracts (`packages/contracts`) are frozen
  by name and shape before the parts that depend on them are built, and rewritten as AS-BUILT when they
  are done. After freezing, any change is recorded with its reason; a rename or a reshape needs a human
  decision.

A question of scope, security or what the user sees that the spec does not answer is not yours to
decide (III): judge the row DEFERRED, name the question, and say so in your report.

## How to build this repository

- **The spec decides, never the code.** Expectations come from spec.md, the contracts and the
  quickstart. If the code disagrees, the code is wrong, unless the run proves the spec wrong — then it
  is a contract change, recorded with its reason before anything else changes.
- **Measure before depending** (IV): G0 records the real token shapes; later goals use the recorded
  shapes, not documentation.
- **Controls before greens** (V): every guard's row quotes its control red and its test green — the
  uniqueness of first contact, the signature check, the timestamp window, the refresh classification,
  the loop guard, the permission check and the roles of the token path. A control runs in a test that
  says it is a control.
- **Permissions are the server's** (FR-033): one table, one check before every handler. The web client
  shows the server's answer and decides nothing.
- **Time**: tests advance the injected clock and say so; the running system keeps the real intervals.
- **Two runs agree**: a count or a pass is quoted from two consecutive runs.

## Definition of done for each goal

1. **Read first.** Read the current state before changing a file.
2. **It runs.** `pnpm test`, `pnpm e2e` (from G5), `pnpm lint` and `pnpm typecheck` pass as the rows
   require; paste the output.
3. **The build under test is pinned.** Once the goal's code is done and before its final verification,
   write one line under the goal's heading in PROGRESS.md:
   `Build under test: <commit> + tree <fingerprint> · keycloak <digest> · mongo <digest>`, with the commit
   from `git rev-parse --short HEAD`, the fingerprint from
   `{ git rev-parse HEAD; git diff HEAD; git ls-files -o --exclude-standard -z | sort -z | xargs -0 -r sha256sum; } | sha256sum | cut -c1-12`
   and the digests from `docker image inspect --format '{{index .RepoDigests 0}}' <image>`. The goal's
   two final runs are made on that build; if anything changes after them, write the new line and run
   them again.
4. **Every row has a verdict** from the table below; nothing is left unexplained.
5. **The tally is written.** Under the goal's last table, one line:
   `Tally: <n> rows · <m> verdicts (PASS a · FAIL b · BLOCKED c · DEFERRED d)`. A split verdict counts
   once per arm, so m can exceed n; an annotated PASS counts as one PASS.
6. **PROGRESS.md first, report second.**
7. **Leave nothing behind.** Temporary files go to the OS temp directory; stop every process you
   started; the Compose stack may stay up between goals of this run and is removed in G6.

### Verdicts

| Verdict | Meaning | Required |
|---|---|---|
| PASS | you observed what the row describes | quote the observation (command output with the exit code, an HTTP exchange, a database document) |
| FAIL | the observation contradicts the row | `expected "<X>" / actual "<Y>"`; if you cannot write that, it is not a FAIL |
| BLOCKED | you could not verify it | say what is missing; a result that needed the environment fixed by hand is BLOCKED too |
| DEFERRED | it depends on an open decision | name the decision |

Two forms the playbook allows ([materials/playbook/verdict-table.md](materials/playbook/verdict-table.md)):

- **Annotated PASS**: `PASS (note: <the condition>)` when it passed under a condition; the note stays in
  the row.
- **Split verdict**: when a row has two paths and only one could be verified, write both, verified arm
  first, for example `PASS (sign-in path) / BLOCKED (rotation path)`, with the evidence of each arm in
  the evidence cell. Do not split a row just to avoid a FAIL.

The auxiliary words (N/A, INFO, INCONCLUSIVE) are not verdicts in this ledger; use them only inside the
evidence. "Works as expected", "no issues" and "looks fine" count as unverified. When in doubt, BLOCKED —
never round an uncertainty up to PASS.

### The evidence gate is mechanical

`.claude/hooks/evidence-gate.sh` runs at the end of every turn while `goal-pack/.gate-armed` exists.
It blocks the turn when a PASS has empty evidence, a weasel phrase or no quotation mark; when a FAIL is
not "expected / actual"; when a BLOCKED or DEFERRED gives no reason; or when a verdict word is unknown.
It reads the file, not the conversation: **never invent a quotation to pass it.** After 5 blocks in a
row it lets the turn end to avoid a loop; say so plainly in your report.

### Run things one at a time

One test run at a time; never run `pnpm e2e` while `pnpm test` runs. Wait for a long command with one
blocking call; do not start it in the background. Keep every single command under ten minutes; split a
longer one.

## The handover (G6)

`specs/001-idp-tenant-integration/HANDOFF.md` follows the playbook's handover
([materials/playbook/HANDOFF.md](materials/playbook/HANDOFF.md)), in English, in these eight parts and
this order; a part with nothing to say says "None" and is not dropped:

1. Title, updated, owner, next step (four lines)
2. The current state, in one sentence
3. Decisions not to reopen (id, decision, date, reason — cite the spec's ids, do not restate them)
4. Verdicts (PASS / FAIL / BLOCKED / DEFERRED with evidence; every BLOCKED and DEFERRED of the run)
5. What is left in the environment (path, id, how to remove it)
6. Messages drafted and waiting to be sent
7. Remaining work, per person who does it
8. The first thing the next person does (one item)

## Red lines — stop and report if you are about to cross one

1. Do not create, switch or modify branches.
2. Do not commit or push; the human commits after the run.
3. **Read and write only inside this repository, the OS temp directory and the browser directory.**
   Do not open, list or search anything else on this machine — not the home directory, not other
   repositories.
4. **Docker only through `docker compose` in this repository, project `acme-idp-demo`.** No
   `docker run`, no `docker exec` into containers of other projects, no volumes or bind mounts outside
   this repository, no changes to other containers, images, networks or volumes. Docker on this host is
   root-equivalent; treat it that way.
5. No secret in any file of the repository; dummy values only in `.env.example`. Do not unset or print
   the proxy environment variables.
6. Do not fix unrelated problems; record them under "Incidental findings". A defect **your own change**
   introduced is not unrelated: fix it in the same goal.
7. Do not edit the given files listed in SCOPE.md. The spec-kit skills in `.claude/skills/` belong to the
   finished SDD phase: do not run them.
8. Network: only `pnpm install`, `pnpm exec playwright install chromium` and the Compose images already
   pulled. No `sudo`.
   **Nothing that installs or enables a tool outside this repository**: no `corepack enable`, no
   `npm install -g`, no global `pnpm add -g`. pnpm 11.28.0 is already selected by `packageManager`
   (F7). The Node installation on this machine is shared, and `corepack enable` rewrites its `pnpm`
   (another run on this host did so and lost `pnpm` until it was repaired by hand). A CI workflow may
   contain such setup steps; they run on CI only. Here, verify only the project's own commands.
9. No employer, product, customer, team or person names; no figures about the author's work.

### There is a bus above you

While `goal-pack/.bus-armed` exists, every turn you end meets the goal-bus Stop hook:
- **Inside a goal** it sends you back ("Continue Gn: N row(s)…"). The hook reads PROGRESS.md, not the
  conversation: a table where every row has a verdict is the only way out.
- **When you print `PROGRESS: <goal> COMPLETE`** it checks the table and the evidence, then wakes the
  bus. The bus answers PASS (the next goal's instructions) or REJECT (what to fix).
- **The bus sees every earlier goal** and re-runs checks itself. An invented quotation will not survive
  it; BLOCKED will.

## Turn rhythm and progress protocol

- Each turn closes at least one row end to end, including writing it to PROGRESS.md.
- End the turn with: `PROGRESS: <goal> ac_done=X/Y pass=a fail=c blocked=d deferred=e`
- When every row of the goal has a verdict and PROGRESS.md is written: `PROGRESS: <goal> COMPLETE`
- When you are blocked: `PROGRESS: <goal> BLOCKED <reason>` — goal name first.
- The numbers must match PROGRESS.md.

**A turn must end on one of these lines. This is not formatting; it is what keeps the chain alive.**
The hooks run only when a turn ends, and they recognise you and your boundary by this line. End on
anything else and nobody is woken: your process ends and the chain stops silently. It follows that
starting a long task in the background and ending the turn throws its result away, and that a long task
is awaited with **one blocking call**, anchored on its output.

## After context compaction

1. Read PROGRESS.md and take the next empty verdict of the current goal.
2. If this brief is no longer in your context, read it again, completely, then SCOPE.md and spec.md.
3. Check that SCOPE.md still says FROZEN (or AS-BUILT after G6).
4. Check the stack (`docker compose ps` for acme-idp-demo) and run `pnpm test` once before going on.
