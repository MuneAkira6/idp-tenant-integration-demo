# Launch brief — 001 sign-in and tenant integration with the group platform

Written on 2026-09-30, before the SDD session starts, for the agent that runs it. It says what is already
settled, what bounds the spec, which questions go to a human, how the work proceeds and how it is
verified. The agent reads it first and does not re-investigate the settled facts.

## 1. Settled facts (with their source; do not re-investigate)

| # | Fact | Source |
|---|---|---|
| F1 | The design this demo reproduces: authorisation code + PKCE (S256) sign-in ending in the app's own session; platform Bearer tokens accepted on the existing API with an in-memory principal only; roles re-derived at every sign-in (union → mapping table → replace, written only when changed, unmapped → lowest role with a warning); signed webhooks stored first and processed asynchronously; tenant sync with claims and tombstones; hourly device pulls; one visibility registry; everything default off | the author's case study 01 (public): https://github.com/MuneAkira6/engineering-case-studies/blob/main/01-platform-integration.md |
| F2 | The stand-ins: Keycloak for the platform's IdP (one realm per tenant, so the issuer names the tenant; client roles in `resource_access`; service accounts for client credentials; realms imported from JSON), a mock platform for events, the tenant API and the device API, MongoDB 7 for the app's data | the approved design of this repository (Gate 2) |
| F3 | On the host that runs the implementation (2026-09-30): Docker `28.1.1`, Compose `v2.35.1`, the account in the `docker` group | `docker version --format '{{.Server.Version}}'`, `docker compose version`, `id -nG` |
| F4 | `quay.io/keycloak/keycloak:26.7.4` is the newest stable tag and pulls in 38 s (477 MB); `mongo:7` is `db version v7.0.43` and pulls in 60 s (865 MB) | quay.io tag API; `docker pull -q`; `docker run --rm mongo:7 mongod --version` |
| F5 | Listening TCP ports on the host: 22 53 139 445 631 3128 3350 3389 — everything else, including 18400–18499, is free; 3128 belongs to another service and is not touched | `ss -ltnH` |
| F6 | Playwright 1.63.0 refuses this Ubuntu 20.04 host (`Playwright does not support chromium on ubuntu20.04-x64`); 1.62.1 installs Chromium (headless shell 151.0.7922.34) and opens a page in about 2 s | `playwright install chromium`; a scripted headless launch |
| F7 | Node `v24.19.0`; pnpm `11.28.0` through `packageManager`; `pnpm install` of a comparable workspace takes a few seconds and needs no build scripts | `node --version`; `pnpm --version`; `pnpm install` |

## 2. Constraints that shape the spec

- Demo scale: two integrated tenants and one tenant that is not integrated; a handful of users and
  devices each. Synthetic data only; the product is Acme Tasks.
- Default off (constitution VI): the tenant that is not integrated must behave exactly as before, with
  its own password sign-in, and every integration path is refused until it is configured.
- Everything runs locally with Docker Compose; the host has no Java and no MongoDB shell outside the
  container.
- The spec describes what and why, not how: no framework, library or endpoint names in spec.md.

## 3. Questions for a human, one at a time (the agent does not answer them)

1. How the application's own session is kept after a platform sign-in.
2. What happens to a platform role that has no mapping in the application.
3. What deleting a tenant on the platform does to that tenant's data in the application.
4. How hourly timers and 30-day expiries are verified without waiting for them.
5. Which parts of the application an integrated tenant no longer sees, and where its users land.

Each goes with a recommendation and its reason; the answer is recorded under Clarifications in spec.md
before planning.

## 4. Steps

constitution → specify → clarify (the questions above) → plan (research, data model, contracts,
quickstart) → tasks → analyze → a goal pack generated from the spec's acceptance criteria → the
implementation, run unattended by goal-bus-kit.

## 5. Verification rules

- Every acceptance criterion is judged PASS / FAIL / BLOCKED / DEFERRED with quoted evidence.
- A guard counts only after its test has been seen red without it (the uniqueness of first contact,
  the signature check, the loop guard).
- A verdict counts when two consecutive runs agree.
- The build under test is pinned: the verdicts name the commit and the image tags they ran against.

## 6. Constitution articles in force

All seven. The ones this feature leans on hardest: IV (measure the IdP and the platform, do not trust a
description), V (controls before greens), VI (default off, one session downstream) and VII (freeze the
contracts before the apps are built).

## 7. Finishing checklist

- [ ] spec.md has no open clarification markers and records the five answers
- [ ] plan.md passes the seven constitution gates
- [ ] contracts frozen, each with its name and shape
- [ ] tasks.md carries the manual and logical verification checklists
- [ ] analyze reports no unresolved finding
- [ ] the goal pack's verdict table has one row per acceptance criterion of spec.md
