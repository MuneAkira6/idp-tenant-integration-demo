# Goal brief — idp-tenant-integration-demo

> This file is the worker's only entry point. Read all of it before you start.
> Scope of the run: [SCOPE.md](SCOPE.md). Ledger: [PROGRESS.md](PROGRESS.md). Human manual:
> [runbook.md](runbook.md). **The requirement is the spec folder**:
> [specs/001-idp-tenant-integration/](../specs/001-idp-tenant-integration/spec.md).

## Mission

Implement the spec in `specs/001-idp-tenant-integration/` as a working local demo: Acme Tasks, a
fictional multi-tenant task SaaS, joins a group platform (played by Keycloak and a mock service) without
a second session, with signed events, tenant sync, device pulls, one visibility registry, and everything
off until configured. Every guard is proved by a control that shows it red.

| Goal | Scope | In one line |
|---|---|---|
| G0 | stack | workspace, Compose, realms, token shapes measured, contracts frozen, clock, config, database, mock, seed |
| G1 | US1, US8 | sign-in with PKCE into a server-side session; nothing changes until configured |
| G2 | US2, US3 | Bearer tokens on the existing API; exactly one user on first contact; roles |
| G3 | US4 | signed webhooks: store first, acknowledge, process; sweeps; subscriptions |
| G4 | US5, US6 | tenant sync with claims and tombstones; lookups; device pulls |
| G5 | US7 | the web client: one gate, one registry, the loop guard |
| G6 | closing | two green runs, contracts AS-BUILT, README with the diagrams, HANDOFF |

Every row is already listed in PROGRESS.md. Do not add or remove rows; to change a plan, write the
reason in PROGRESS.md first. The tasks T001–T064 of `tasks.md` are the work items; the rows are what
the bus judges.

## Required reading

| Resource | Why |
|---|---|
| [spec.md](../specs/001-idp-tenant-integration/spec.md) with its Clarifications | the requirement |
| [plan.md](../specs/001-idp-tenant-integration/plan.md), [research.md](../specs/001-idp-tenant-integration/research.md) | the decisions and why |
| [data-model.md](../specs/001-idp-tenant-integration/data-model.md), [contracts/](../specs/001-idp-tenant-integration/contracts/api.md) | the names and shapes you freeze in G0 |
| [quickstart.md](../specs/001-idp-tenant-integration/quickstart.md) | the scenarios Q1–Q15 and the controls |
| [tasks.md](../specs/001-idp-tenant-integration/tasks.md) | the work, by user story |
| [SCOPE.md](SCOPE.md), [materials/sources.md](materials/sources.md) | the rules of the run; what the README may say about the practice |
| [PROGRESS.md](PROGRESS.md) | the rows you judge |

## Facts already verified (2026-09-30, on this Linux host) — use them, do not re-investigate

- Linux (Ubuntu 20.04), Node `v24.19.0`; corepack gives pnpm `11.28.0` from `packageManager`.
- **Dependencies, measured under the supply-chain settings** (`minimumReleaseAge: 4320`,
  `strictDepBuilds: true`, `allowBuilds: {}`): `@rsbuild/core` ^2, `@rsbuild/plugin-react` ^2,
  `react-router` ^8, `mongodb` ^7, `fastify` ^5, `@fastify/cookie` ^11, `openid-client` ^6, `jose` ^6,
  `react`/`react-dom` ^19, `vitest` ^5, `typescript` ^7, `@biomejs/biome` ^2, `@types/node` ^24 installed
  in 8 s with no build script. **Rsbuild 1 fails** (`[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts:
  core-js@3.47.0`), so do not downgrade; keep `allowBuilds` empty.
- **Playwright is pinned at 1.62.1**: 1.63.0 refuses this host (`Playwright does not support chromium on
  ubuntu20.04-x64`). 1.62.1's Chromium is already installed in the directory `PLAYWRIGHT_BROWSERS_PATH`
  names; never pass `--with-deps` and never install browsers elsewhere.
- Docker `28.1.1`, Compose `v2.35.1`. Already pulled: `quay.io/keycloak/keycloak:26.7.4` (newest stable
  on 2026-09-30) and `mongo:7` (`db version v7.0.43`).
- Ports 18400–18419 and 18480 are free; other services listen on this machine (3128 among them) and
  must not be touched.
- The host has no Java and no MongoDB shell: use `docker compose exec mongodb mongosh` for queries.
- The HTTPS proxy comes from environment variables: **never unset or print them.**
- Node runs `.ts` files directly for the API and the mock (type stripping): write erasable TypeScript
  only — no enums, namespaces or parameter properties — and keep `tsc --noEmit` as the compile check.
  The web client is built by Rsbuild.

## How to build this repository

- **The spec decides, never the code.** Expectations come from spec.md, the contracts and the
  quickstart. If the code disagrees, the code is wrong, unless the run proves the spec wrong — then it
  is a contract change, recorded with its reason before anything else changes.
- **Measure before depending** (constitution IV): G0 records the real token shapes; later goals use the
  recorded shapes, not documentation.
- **Controls before greens** (constitution V): every guard's row quotes its control red and its test
  green. A control runs in a test that says it is a control.
- **Time**: tests advance the injected clock and say so; the running system keeps the real intervals.
- **Two runs agree**: a count or a pass is quoted from two consecutive runs.

## Definition of done for each goal

1. **Read first.** Read the current state before changing a file.
2. **It runs.** `pnpm test`, `pnpm e2e` (from G5), `pnpm lint` and `pnpm typecheck` pass as the rows
   require; paste the output.
3. **Every row has a verdict** from the table below; nothing is left unexplained.
4. **PROGRESS.md first, report second.**
5. **Leave nothing behind.** Temporary files go to the OS temp directory; stop every process you
   started; the Compose stack may stay up between goals of this run and is removed in G6.

### Verdicts

| Verdict | Meaning | Required |
|---|---|---|
| PASS | you observed what the row describes | quote the observation (command output with the exit code, an HTTP exchange, a database document) |
| FAIL | the observation contradicts the row | `expected "<X>" / actual "<Y>"`; if you cannot write that, it is not a FAIL |
| BLOCKED | you could not verify it | say what is missing |
| DEFERRED | it depends on an open decision | name the decision |

"Works as expected", "no issues" and "looks fine" count as unverified. When in doubt, BLOCKED — never
round an uncertainty up to PASS.

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

## Red lines — stop and report if you are about to cross one

1. Do not create, switch or modify branches.
2. Do not commit or push; the human commits between goals.
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
