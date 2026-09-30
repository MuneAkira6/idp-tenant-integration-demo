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
integrated tenant sees. Everything is off until configured, and the tenant that is not integrated keeps
its password sign-in unchanged. Locally, Keycloak plays the platform's IdP (one realm per tenant) and a
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

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* One gate per principle.

| # | Principle | Gate question | This plan | Result |
|---|---|---|---|---|
| I | Agents never touch branches | Does any step need an agent to create, switch or commit a branch? | No. The goal pack forbids it and the run's permissions deny `git commit`/`push`; humans commit at goal boundaries | PASS |
| II | The spec folder is the requirement | Is every behaviour in the plan traceable to an FR or SC of spec.md? | Yes; research records only how, and every contract names the FRs it serves | PASS |
| III | Humans decide the open questions | Are all scope, security and UX questions decided by a human? | Yes; five decided on 2026-09-30 (spec.md, Clarifications); none left open | PASS |
| IV | Measure before asserting | Is every fact about Keycloak, the platform stand-in, images and the host measured, with its command? | The host facts are in the launch brief; Keycloak's claim shapes and token contents are measured in G0 and recorded before G1 depends on them (research R-2) | PASS |
| V | Verdicts rest on evidence | Does each guard have a control that shows it red? | Yes: uniqueness of first contact, the signature check, the timestamp window, the loop guard and the refresh classification each get a control (quickstart §4) | PASS |
| VI | Default off, one session downstream | Does any path create a second kind of session, or change the tenant that is not integrated? | No; every entry ends in the server-side session or an in-memory principal; the configuration defaults are listed in data-model.md and checked in G0 and G6 | PASS |
| VII | Contracts freeze before parallel work | Are the shared contracts named and shaped before the parts that use them? | Yes; `contracts/` below is frozen in G0 as `packages/contracts` and rewritten as AS-BUILT in G6 | PASS |

Re-check after Phase 1: all seven still PASS; no complexity to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-idp-tenant-integration/
├── launch-brief.md      # written before the SDD session
├── spec.md              # with the Clarifications of 2026-09-30
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1: the app's API, the platform's API and events, the web client
├── checklists/          # the spec quality checklist
├── tasks.md             # /speckit-tasks
└── analyze.md           # /speckit-analyze report
```

### Source Code (repository root)

```text
compose.yaml                     # Keycloak 26.7.4 and MongoDB 7 only
infra/keycloak/realms/           # realm JSON imports: platform, tenant-a, tenant-b
apps/api/                        # Fastify: auth, Bearer, roles, webhooks, tenant sync, device pull, schedulers
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
