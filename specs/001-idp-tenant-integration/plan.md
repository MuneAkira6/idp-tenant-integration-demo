# Implementation Plan: Sign-in and tenant integration with the group platform

**Branch**: `001-idp-tenant-integration` (the spec folder) | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-idp-tenant-integration/spec.md`

## Summary

Acme Tasks gains a second way in — the group platform's IdP — without a second session: the
authorisation code flow with PKCE ends in the application's own server-side session, a platform Bearer
token on the existing API becomes an in-memory principal, and roles are re-derived at every sign-in.
Platform events arrive as HMAC-signed webhooks that are stored under their delivery id before being
acknowledged and processed asynchronously; tenants follow the platform with claims and tombstones, and
devices are pulled hourly because the platform sends no device events. One registry decides what an
integrated tenant sees. Permissions are decided on the server for each operation, from one table of
three tiers; a caller with a platform token gets the roles its token maps to, in memory. Everything is
off until configured, and the tenant that is not integrated keeps its password sign-in unchanged. Locally, Keycloak plays the platform's IdP (one realm per tenant) and a
small mock service plays the platform's event, tenant and device APIs.

## Technical Context

**Language/Version**: TypeScript on Node 24 (type stripping; `tsc --noEmit` as the compile check)

**Primary Dependencies**: Fastify 5 (API and mock platform), `openid-client` (authorisation code + PKCE,
discovery, refresh), `jose` (JWKS and JWT verification), the MongoDB Node driver, React with Rsbuild and
React Router (web), Node's `crypto` (AES-256-GCM for tokens at rest, HMAC-SHA256 and
`timingSafeEqual` for webhooks)

**Storage**: MongoDB 7 (`mongo:7`, measured `v7.0.43`) — partial unique indexes and TTL indexes are part
of the design

**Testing**: Vitest (unit, and integration against the Compose stack), Playwright 1.62.1 for the browser
flows (1.63 refuses the Ubuntu 20.04 host that runs the implementation; see research R-10)

**Target Platform**: a Linux host with Docker Compose for Keycloak and MongoDB; the three Node services
run from the workspace

**Project Type**: web application — an API, a web client and a mock of the platform, in one pnpm
workspace, plus shared contracts

**Performance Goals**: sign-in to landing page within 10 s on the local stack (SC-001); webhook
acknowledgement independent of processing time

**Constraints**: default off (constitution VI); tokens at rest encrypted; secrets only through the
environment; ports 18400–18419 and 18480 only; synthetic data; nothing depends on the internet at
run time once images and packages are present

**Scale/Scope**: two integrated tenants and one tenant that is not integrated; a few users and a few
hundred devices per tenant (enough for more than one page of 200)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Form: the plan gates of spec-driven-dev-playbook (`templates/plan-gates.md`): one gate per principle,
each a question answered yes or no, judged with the part of the plan that answers it. The gates are
named CG-I to CG-VII so that they cannot be confused with the goals G0–G6 of the run.

Plan: `specs/001-idp-tenant-integration/plan.md` / judged on: 2026-09-30, and again on the same day
after the alignment with the playbook (research R-17)

| Gate | Principle | Question | Verdict | Evidence |
|---|---|---|---|---|
| CG-I | I | Is the plan free of any step that has an agent create, switch or commit a branch? | Passed | Project Structure: the spec folder is named explicitly; the goal pack forbids branches and commits, and the run's permissions deny `git commit` and `git push`. The commits after the unattended run are the exception recorded in the constitution. |
| CG-II | II | Does every behaviour of the plan trace to an FR, an SC or a clarification of spec.md? | Passed | Summary; research R-1–R-18 each serve named requirements; every contract route names its FRs; the ticket reaches the spec only through its disposition table. |
| CG-III | III | Has a human decided every question that changes scope, security or what the user sees? | Passed | spec.md, Clarifications: C1–C7 decided on 2026-09-30; none open. |
| CG-IV | IV | Is every fact the plan relies on measured, with its command and its output? | Passed | Technical Context and facts.md, F3–F10; the token shapes are measured in G0 before G1 depends on them (research R-2). |
| CG-V | V | Does every guard of the plan have a control that shows it red? | Passed | quickstart.md §4: first-contact uniqueness, the signature check, the timestamp window, the refresh classification, the loop guard, the permission check and the roles of the token path. |
| CG-VI | VI | Does every entry end in the one session or an in-memory principal, with the tenant that is not integrated unchanged? | Passed | Summary; data-model.md, Configuration defaults; checked in G0 and G6. |
| CG-VII | VII | Are the shared contracts named and shaped before the parts that use them? | Passed | Project Structure: `contracts/` is frozen in G0 as `packages/contracts` and rewritten as AS-BUILT in G6. |

Gates not passed, and what was done: none.

Re-check after Phase 1: all seven still passed; no complexity to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-idp-tenant-integration/
├── launch-brief.md      # written before the SDD session
├── spec.md              # with the Clarifications, the permissions and the ticket's disposition
├── plan.md              # this file
├── research.md          # Phase 0: the decisions, each in the ledger form
├── facts.md             # the measured facts, each with its command and output
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1: the app's API, the platform's API and events, the web client
├── checklists/          # the spec quality checklist
├── tasks.md             # /speckit-tasks, with the manual and logical verification checklists
├── analyze.md           # /speckit-analyze report
└── HANDOFF.md           # written by the run in G6
```

### Source Code (repository root)

```text
compose.yaml                     # Keycloak 26.7.4 and MongoDB 7 only
infra/keycloak/realms/           # realm JSON imports: platform, tenant-a, tenant-b
apps/api/                        # Fastify: auth, Bearer, roles, permissions, webhooks, tenant sync, device pull, schedulers
apps/mock-platform/              # Fastify: event sender, tenant API, device API, subscriptions
apps/web/                        # React + Rsbuild: the auth gate, the visibility registry, pages
packages/contracts/              # frozen shared types: API, events, platform API, visibility
tests/e2e/                       # Playwright: sign-in, gate, landing, loop guard
goal-pack/                       # generated from this spec for the unattended implementation run
```

**Structure Decision**: one pnpm workspace with three apps and one shared contracts package, because the
mock platform and the API must agree on event and API shapes (constitution VII), and one Compose file
for the two infrastructure services only, so the Node services start fast and are driven directly by
the tests.

## Complexity Tracking

No constitution violations to justify.
