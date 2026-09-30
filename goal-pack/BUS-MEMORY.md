# Bus memory — idp-tenant-integration-demo

**This is a complement, not a summary.** Anything in PROGRESS.md, BUS-LOG.md, the goal brief or the spec
folder does not belong here. When a later measurement corrects an entry, come back and rewrite it.
Marks: 🆕 new · ✅ verified · 🔴 warning · ~~struck~~ no longer true.

## Environment facts across goals

- 🆕 The measured facts of this host are entries F3–F10 of `specs/001-idp-tenant-integration/facts.md`,
  each with its command and output; cite them by id. The run appends its own from F11 on.
- 🆕 An HTTPS proxy is configured through environment variables. Nobody unsets or prints them.
- 🆕 The run uses its own Claude configuration directory: no user-level skills, memory or MCP servers.
  The project's `.claude/skills/speckit-*` exist but belong to the finished SDD phase.

## Doubts to re-check

## The worker's habits

## Proven along the way — later goals may cite

## What the bus verified itself

## Rulings the bus made

## Watch closely

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
