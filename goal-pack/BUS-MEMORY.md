# Bus memory — idp-tenant-integration-demo

**This is a complement, not a summary.** Anything in PROGRESS.md, BUS-LOG.md, the goal brief or the spec
folder does not belong here. When a later measurement corrects an entry, come back and rewrite it.
Marks: 🆕 new · ✅ verified · 🔴 warning · ~~struck~~ no longer true.

## Environment facts across goals

- 🆕 Measured on this host while the pack was written (2026-09-30): Node `v24.19.0`; pnpm `11.28.0`;
  the dependency set with Rsbuild 2 installs in 8 s with no build script (Rsbuild 1 fails on core-js).
- 🆕 Playwright pinned at 1.62.1 (1.63.0 refuses Ubuntu 20.04); Chromium already in
  `PLAYWRIGHT_BROWSERS_PATH`.
- 🆕 Docker 28.1.1, Compose v2.35.1; Keycloak 26.7.4 and mongo:7 (v7.0.43) already pulled; ports
  18400–18419 and 18480 free; no Java and no MongoDB shell on the host.
- 🆕 An HTTPS proxy is configured through environment variables. Nobody unsets or prints them.
- 🆕 The run uses its own Claude configuration directory: no user-level skills, memory or MCP servers.
  The project's `.claude/skills/speckit-*` exist but belong to the finished SDD phase.

## Doubts to re-check

## The worker's habits

## Proven along the way — later goals may cite

## What the bus verified itself

## Rulings the bus made

## Watch closely

- 🔴 The recorded token shapes of G0 are the truth for G1 and G2; a verifier written from documentation
  instead is a defect even if its tests pass.
- 🔴 Every guard needs its control red: first-contact uniqueness, signature, timestamp window, refresh
  classification, loop guard.
- 🔴 Default off: the `local` tenant must give the same results as its G0 baseline in every goal.
- 🔴 Docker only through compose for acme-idp-demo; nothing mounted from outside the repository.
- 🔴 The injected clock is for tests only; the production wiring keeps the real intervals (AC-31).
- 🔴 The README separates practice from demo exactly as `materials/sources.md` does.
