# idp-tenant-integration-demo — scope of the implementation run

**Contract status: DRAFT.** Frozen in G0 (content unchanged, date added); rewritten as AS-BUILT in G6.

**The requirement is the spec folder, not this file** (constitution II):
[spec.md](../specs/001-idp-tenant-integration/spec.md) with its Clarifications, its Permissions section
and its disposition table,
[data-model.md](../specs/001-idp-tenant-integration/data-model.md),
[contracts/](../specs/001-idp-tenant-integration/contracts/api.md) (api, platform, web),
[quickstart.md](../specs/001-idp-tenant-integration/quickstart.md) (the scenarios Q1–Q18 and the
controls) and [tasks.md](../specs/001-idp-tenant-integration/tasks.md) (T001–T070, with the
verification checklists M1–M12 and L1–L12). The measured facts are in
[facts.md](../specs/001-idp-tenant-integration/facts.md). This file adds only the rules of the run: what
exists already, what is given, and how the goals map to the tasks. How this pack was made from the spec
folder is recorded in [from-spec.md](from-spec.md).

## Goals and tasks

| Goal | Tasks | User stories |
|---|---|---|
| G0 | T001–T011: workspace, Compose stack, realms, token shapes measured, contracts frozen, clock, config, database, mock scaffold, seed | — |
| G1 | T012–T020, T057, T058, T064 | US1, US8 |
| G2 | T021–T029, T059, T065–T069 | US2, US3, US9 |
| G3 | T030–T036, T060, T061 | US4 |
| G4 | T037–T047, T062, T063 | US5, US6 |
| G5 | T048–T052, T070 | US7, and the web part of US9 |
| G6 | T053–T056 | closing |

## Given — do not change

`.specify/` (spec-kit's files and the constitution), `.claude/skills/` (spec-kit's skills: the SDD phase
is finished; do not run them), everything under `specs/001-idp-tenant-integration/` except the three
below, `LICENSE`, `.gitignore`, `.gitattributes` and `goal-pack/materials/`.

The three exceptions inside the spec folder:

- `facts.md`: the run appends its measurements as new entries from F11 on, in the form of the entries
  above them. When a measurement overturns an entry, the run adds a "Superseded" box under it. It never
  edits the text of an existing entry.
- `contracts/*.md`: rewritten as AS-BUILT in G6.
- `HANDOFF.md`: written in G6.

A change to the spec during the run is a contract change: record it in PROGRESS.md with its reason
first, and only for a mistake the run has proved.

## The stack of the run

- Compose project name **`acme-idp-demo`**; services `keycloak` (`quay.io/keycloak/keycloak:26.7.4`,
  port 18480) and `mongodb` (`mongo:7`, port 18417); realms imported from `infra/keycloak/realms/`.
- Node services from the workspace: API 18400, web 18401, mock platform 18402.
- Playwright 1.62.1, browsers in the directory `PLAYWRIGHT_BROWSERS_PATH` names.
- The Keycloak administrator and every secret come from the environment with dummy values in
  `.env.example`; the test setup generates fresh secrets per run.

## Evidence

Every row quotes command output, database documents or HTTP exchanges, with the exit code where the row
is about one. A guard's row quotes its control red and its test green (constitution V). A row of G6
quotes two consecutive runs. Before its first verdict, each goal writes its build under test under its
heading, and each goal's tables end with its tally (goal-brief.md, Definition of done).

## Out of scope

Anything the spec does not ask for; production hardening beyond the spec; other IdPs; a real platform;
the two criteria of the ticket that the disposition table excludes.
