<!--
Sync Impact Report
- Version: 1.0.0 → 1.1.0 (MINOR: a new section, Exceptions; each principle's closing line now says what
  breaks without it; the Constraints line on Compose corrected to what runs in it)
- Principles: none added, removed or redefined
- Templates: plan.md's constitution check re-judged on 2026-09-30; no spec-kit template changed
-->

# Acme Tasks Integration Demo Constitution

Form: the seven-principle constitution of spec-driven-dev-playbook (`templates/constitution.example.md`).
Each principle says what breaks without it and maps to one gate of the plan; an exception is recorded
below, never agreed orally.

## Core Principles

### I. Agents Never Touch Branches

AI agents MUST NOT create, switch, rename or delete branches, and MUST NOT commit or push. The spec
folder is chosen by its explicit name, never derived by an agent creating a branch. Humans commit at
goal boundaries and check every commit message against the change it describes.

What breaks without it: a branch is a human decision about what ships together; an agent that moves
branches can strand work where no review will find it.

### II. The Spec Folder Is the Requirement

`specs/001-idp-tenant-integration/` is the single source of truth for what is built. A ticket, a chat
message or a code comment is input to the spec, never a requirement by itself. When they disagree, the
spec wins until the spec is changed on purpose, with the change recorded.

What breaks without it: an agent takes whichever text is easiest to read as the truth, and two sources
that disagree are both built, half each.

### III. Humans Decide the Open Questions

Every question that changes scope, security or what the user sees is handed to a human, one item at a
time, with a recommendation and its reason. Agents MUST NOT fill such a gap with a "reasonable
default". The answers are recorded in the spec's Clarifications section before planning starts.

What breaks without it: an undecided point that an agent fills quietly becomes a requirement nobody
chose, and everything planned after it rests on it.

### IV. Measure Before Asserting

Every statement about an external system (the IdP, the platform APIs, container images, the host) is
recorded with its date, the command that measured it and the output. A fact is measured again before
something depends on it. "Not declared in a document" does not mean "absent", and "the data exists"
does not mean "our credentials can reach it": both are measured.

What breaks without it: documents and memory drift, and an implementation built on a fact nobody
measured fails late, where the cause is hardest to see.

### V. Verdicts Rest on Evidence

Acceptance is judged per row with PASS, FAIL, BLOCKED or DEFERRED. PASS quotes what was observed; FAIL
is written as "expected X / actual Y"; a precondition the environment cannot produce is BLOCKED, never
PASS; DEFERRED names the decision it waits for. A test counts only after it has been seen to fail
without the thing it guards (a control), and a verdict counts when two consecutive runs agree.

What breaks without it: a green test that cannot turn red measures nothing, and a table of such greens
reports progress that is not there.

### VI. Default Off, One Session Downstream (NON-NEGOTIABLE)

Every integration path is off until it is configured: no issuer configured means every external token
is refused; no signing secret means every webhook is refused; the device pull and the tenant-level
integration flag default to off. Tenants that are not integrated behave exactly as before. However
many entry points there are, each one ends in the application's own session or principal; nothing
downstream learns about the platform.

What breaks without it: the integration can no longer be switched on per tenant without touching the
tenants it does not concern, and expiry, refresh and logout split into as many places as there are
entry points.

### VII. Contracts Freeze Before Parallel Work

The shared contracts (`packages/contracts`) are frozen by name and shape before the parts that depend
on them are built, and rewritten as AS-BUILT when they are done. After freezing, any change is recorded
with its reason; a rename or a reshape needs a human decision.

What breaks without it: the parts built against the contract break silently when the interface in the
middle moves.

## Constraints

- Synthetic data only. No real organisation, product, person or credential appears anywhere; the demo
  product is Acme Tasks, a fictional multi-tenant task-management SaaS.
- The stack: Node 24, TypeScript, pnpm (through corepack) with the supply-chain settings
  (`minimumReleaseAge`, `strictDepBuilds`, `allowBuilds`), Fastify, React with Rsbuild, MongoDB 7,
  Keycloak as the stand-in IdP, Vitest and Playwright. Keycloak and MongoDB run locally with Docker
  Compose; the Node services run from the workspace.
- Secrets reach the services through the environment (the stand-in for a secret store), never through
  files in the repository.

## Development Workflow

- SDD first (constitution → specify → clarify → plan → tasks → analyze), then the implementation is
  run by goal-bus-kit from a goal pack generated from this spec's acceptance criteria.
- Every goal ends with a verdict table; the plan passes one gate per principle above.
- Timers and expiries are verified at the values that are configured; a shortened value used only in a
  test is stated as such in the test.

## Exceptions

| Principle | Recorded | Exception | Reason | Ends when |
|---|---|---|---|---|
| I | 2026-09-30 | During the unattended implementation run nobody commits at goal boundaries. The human commits after the run, one commit per goal where the files allow it, and checks every message against its change. Agents still never commit. | The run goes on overnight with nobody at the keyboard; stopping it at every boundary to commit would defeat running it unattended. | A run is attended: its commits happen at each boundary again. |

## Governance

This constitution overrides every other practice in this repository. An amendment states what changed
and why, bumps the version (MAJOR for a removed or redefined principle, MINOR for an added principle or
section, PATCH for wording), and is reviewed by a human before it applies. An exception to a principle
is recorded under Exceptions with its date, its reason and the condition that ends it; an exception that
is not recorded there is a violation. Plans and goal reviews check compliance against each principle by
number.

**Version**: 1.1.0 | **Ratified**: 2026-09-30 | **Last Amended**: 2026-09-30
