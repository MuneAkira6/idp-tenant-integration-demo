# Runbook — idp-tenant-integration-demo

<!-- For the human operator. The worker never needs this file. This run goes to a Linux host with its
     own CLAUDE_CONFIG_DIR and GOALBUS_ENV_FILE, launched with setsid nohup (see goal-bus-kit's
     examples/toy-run/README.md). -->

## 0. Before arming

- [ ] You created the branch yourself (no mechanical guard exists for this) and `git status` is clean.
- [ ] Both selftests are green **on the machine that will run the hooks**:
      `bash .claude/hooks/goal-bus.sh --selftest && bash .claude/hooks/evidence-gate.sh --selftest`
- [ ] `.claude/settings.local.json` has the permissions and hooks from `settings.hooks.json`, and
      `bash .claude/hooks/goal-bus.sh --status` reports the hook timeout as ok.
- [ ] Nothing else uses the same environment: no other armed pack in any working tree or on any
      machine, and nobody testing by hand. Check again right before launch.
- [ ] Caps are calibrated: one run (7 goals, about 9 reviews, 71 rows) is below MAX_REVIEWS / MAX_TURNS.
- [ ] The usage budget for this run is available (check your plan's usage page).
- [ ] On a shared host: the run has its own `CLAUDE_CONFIG_DIR`, so the account's MCP servers, skills
      and memory stay out. If the CLI then authenticates with an environment token, set
      `GOALBUS_ENV_FILE` (see `bus.config.sh`) and prove it with one real call made from an
      environment that lacks the token.

## 1. Seed the bus

```bash
bash .claude/hooks/goal-bus.sh --seed      # starts a session that reads the pack, records its id
```

## 2. Arm and launch

```bash
touch goal-pack/.gate-armed goal-pack/.bus-armed
bash .claude/hooks/bin/start-worker.sh --file goal-pack/g0-instructions.md   # add --detach to background it
```

## 3. Watch

```bash
bash .claude/hooks/bin/watch.sh            # events only; it never reads transcripts for protocol text
bash .claude/hooks/goal-bus.sh --status    # where the run is, what was actually reviewed, cost
```

## 4. The goals

### G0 — the stack, the measured token shapes and the frozen contracts
- Instructions for the worker: `goal-pack/g0-instructions.md`
- After the bus's PASS, check yourself: the recorded token shapes are real (decode one yourself); the
  `local` baseline is in the ledger. · Commit: `Add the workspace, the Compose stack, the realms and the frozen contracts`

### G1 — sign-in, the session, and nothing changing until configured (look at it in person)
- Step for the bus to adapt into instructions: T012–T020, T057, T058, T064; the refresh control.
- Check yourself: sign in once in a browser; the session document holds ciphertext, not a JWT.
  · Commit: `Sign in through the platform into a server-side session, default off`

### G2 — Bearer tokens and roles
- Step for the bus to adapt into instructions: T021–T029, T059; the uniqueness control.
- Check yourself: the control's red and green are both quoted. · Commit: `Accept platform tokens on the existing API and derive roles`

### G3 — platform events (look at it in person)
- Step for the bus to adapt into instructions: T030–T036, T060, T061; the signature and window controls.
- Check yourself: a forged delivery is refused and a repeated one has one effect. · Commit: `Receive signed platform events: store first, acknowledge, process`

### G4 — tenants and devices
- Step for the bus to adapt into instructions: T037–T047, T062, T063.
- Check yourself: the reverse-order convergence and the two lookup failures. · Commit: `Sync tenants with tombstones and pull devices`

### G5 — what integrated tenants see (look at it in person)
- Step for the bus to adapt into instructions: T048–T052; the loop-guard control.
- Check yourself: the two tenants side by side in a browser. · Commit: `Add the web client with one gate, one registry and the loop guard`

### G6 — closing
- Step for the bus to adapt into instructions: T053–T056; two green runs; AS-BUILT; README; HANDOFF.
- Check yourself: the leak scan (human only), the README top to bottom, and that the stack is down.
  · Commit: `Rewrite the contracts as built and add the README and handover`

## 5. When the relay stops

| Situation | What you see | What to do |
|---|---|---|
| Usage limit | BUS-LOG: "stopped by a usage or rate limit" | wait for the reset, then `start-worker.sh --resume <worker-id> "continue"`; never retry in a loop |
| ESCALATE | a systemMessage and a BUS-LOG entry | write the ruling into BUS-MEMORY.md, then `goal-bus.sh --notify "<ruling>"`, then resume the worker with `--next` |
| Planned pause | `.bus-paused` exists | when ready: `start-worker.sh --resume <worker-id> --file goal-pack/.bus-next` |
| Lost or unparsed verdict | BUS-LOG "UNPARSED" or a failed wake-up | `goal-bus.sh --recover`, then hand the NEXT block to the worker; do not pay for the review twice |
| Crash or stale lock | `--status` shows the lock held | make sure nothing is half-written, `goal-bus.sh --reset`, resume |
| Turn cap or reject cap | a systemMessage | read BUS-LOG; split the goal or change the approach rather than raising the cap |
| The worker ended silently | `watch.sh` prints `[ended]` or `[stall?]` | read the end of `goal-pack/.worker-log`; resume with a corrective instruction |

Never retype the command that wakes the bus: `--notify` is the one way to talk to it.

## 6. Rubber-stamp audit (the one hole no mechanism closes)

Read `BUS-REVIEWS.md` after the first PASS, after every high-risk goal and before the final commit.
Treat a verdict as suspect when two or more of these hold:

1. no first-person verification (I read, I ran, I queried);
2. every fact traces back to the worker's own report;
3. a PASS without any caveat, risk, debt or new question;
4. a REJECT without ordered steps, a completion criterion, a turn budget or a way out;
5. the same instructions as last time, nothing adapted to what was found;
6. the worker's counts or lists accepted without a recount;
7. BLOCKED versus DEFERRED never questioned;
8. no context figure or environment state, so the verdict cannot be tied to a moment.

## 7. After the run

- Commit at goal boundaries and check every commit message against the change it describes.
- Disarm: `rm goal-pack/.bus-armed goal-pack/.gate-armed`
- Keep BUS-LOG.md, BUS-REVIEWS.md, BUS-MEMORY.md, BUS-HANDOFF.md and PROGRESS.md in the repository;
  they are the evidence that makes the run auditable later.
