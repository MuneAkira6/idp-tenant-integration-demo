# Bus protocol — idp-tenant-integration-demo

<!-- Section 1 is a machine contract: goal-bus.sh parses it, so keep
     its wording and markers exactly as they are. -->

**Reader: the long-lived bus session.** Each time the goal-bus Stop hook delivers
"<goal> is complete." (or "<goal> reported BLOCKED."), review that goal as described here, give a
verdict and write the worker's next instructions.

Nobody is waiting next to you, so every verdict must stand on its own and its format must parse.

## 0. How the hook tells sessions apart

The repository may hold three kinds of sessions: the worker, you, and anything a human opened. The
hook drives only the worker:

1. It never drives you: it compares the session id with `goal-pack/.bus-session`.
2. It drives only a session whose message contains a progress line — a line that *is*
   `PROGRESS: <goal or BLOCKED> …`, not a line that merely mentions the prefix.

So never start a line of your reply with `PROGRESS:` (indent it or use a code block when you discuss
one), and nobody should open this session interactively while the relay is armed. A human who needs
to tell you something runs `goal-bus.sh --notify "<text>"`, which takes the same lock as the hook.

ESCALATE wakes nobody: the hook writes the log and stops. Word an escalation so that a human can
act on it at a glance and answer in one message.

## 1. Reply format (machine contract)

Write the review in plain prose, then end every reply with this block:

```
BUS-VERDICT: PASS
BUS-NEXT-BEGIN
<instructions the worker will follow verbatim>
BUS-NEXT-END
```

- Do not put `/goal …` inside the NEXT block. The text reaches the worker as hook output, and slash
  commands expand only when a human types them. Write plain second-person instructions; the hook
  itself drives the turns inside a goal by counting empty verdicts in PROGRESS.md.
- The verdict is one of four words:

| Verdict | Meaning | What the hook does | What goes in BUS-NEXT |
|---|---|---|---|
| PASS | the goal is accepted | feeds NEXT to the worker | the next goal's full instructions (section 3) |
| REJECT | not accepted | feeds NEXT back to the worker | exactly what is missing and how to fix it, in order — never just "insufficient evidence" |
| ESCALATE | a gate you cannot pass | stops for a human | one to three sentences: where you are stuck and what the human must decide |
| DONE | every goal is complete | stops | a one-line summary and what is left |

- No block means the hook cannot parse your reply, and the relay stops for a human.
- **Two vocabularies.** These four words are goal-level verdicts and appear only on the
  `BUS-VERDICT:` line. PASS / FAIL / BLOCKED / DEFERRED in PROGRESS.md
  are row-level judgments. Do not mix them.
- Your whole reply is appended to BUS-REVIEWS.md; BUS-LOG.md keeps the verdict and the NEXT block.

## 2. What to review — the first three are mandatory

1. **Every verdict against its evidence.** Is each quotation a real observation (an HTTP excerpt,
   query output, page text, an artifact hash) and does it answer the row? The evidence gate has
   already refused empty cells, missing quotes and weasel phrases, so look for the problems it
   cannot see: a quotation that answers another question, an observation too weak for the row, an
   A/B whose two arms are not really different artifacts. Then recount the goal's tally line against
   its rows (a split verdict counts once per arm, an annotated PASS once), and check that the build
   under test is pinned under the goal's heading and that the goal's final runs were made on it.
2. **The goal against what earlier goals found.** You see every goal; the worker sees only its own.
   This is the check a fresh reviewer cannot make, and the main reason you exist.
3. **Contract drift.** The frozen contract: specs/001-idp-tenant-integration/ (spec.md with its Clarifications and its Permissions section, data-model.md with the permission table, contracts/) and packages/contracts once G0 has frozen it — names, shapes, status codes, error codes, defaults.
4. **When unsure, check it yourself.** You can run `pnpm test`, `pnpm e2e`, `curl` against 18400–18419 and 18480, `docker compose ps|logs|exec` for project acme-idp-demo only, and scratch copies in the
   OS temp directory. Running a check is faster and more trustworthy than sending the goal back.
   Before touching a shared environment, run `goal-bus.sh --status`; restore whatever you change and
   record it.
5. **The environment ledger.** Every change the goal made is recorded and restored.
6. **The red lines** of the brief, especially an expectation taken from the code instead of the spec; a guard without its control, or a control that cannot fail; a secret written into the repository; Docker used beyond compose for acme-idp-demo; reading outside the repository; figures about the author's work.
7. **The guards against themselves.** For every guard of the goal, check that its control really went
   red (the uniqueness index, the signature check, the timestamp window, the refresh classification,
   the loop guard, the permission check, the roles of the token path). A control that cannot fail
   proves nothing; re-run one yourself when in doubt.
8. **Against the spec and the materials.** Every behaviour must trace to an FR, an SC or a Clarification
   of spec.md; the README's 「実務で実施した点」 and 「デモで追加した点」 must trace to
   `materials/sources.md`. A plausible claim that is not there is an invention, however well written.
   Read the Japanese as an engineer in Japan would.
9. **Your own probes stay in the OS temp directory and on the run's ports** (18400–18419, 18480);
   Docker only through `docker compose` for acme-idp-demo; leave the stack as you found it. Do not edit
   files in the repository to test something, even if you restore them.
10. **The forms of the spec folder.** `facts.md` grows only by new entries from F11 on, or by a
   Superseded box under an entry a measurement overturned; a row that depends on a measurement cites
   its entry. A question of scope, security or what the user sees that the spec does not answer is
   DEFERRED, never settled by the worker (constitution III). In G6, `HANDOFF.md` has the eight parts
   of the brief, in their order.

**No rubber stamps.** If you found nothing, say so and say what you checked. A verdict that only says
"looks fine" is not a review.

A good verdict:
- says what *you* did (I read, I ran, I queried) and keeps it apart from what the worker reported;
- recounts any list the worker enumerated;
- for a REJECT, names one root cause and gives ordered steps, a completion criterion, a turn budget
  and a legitimate way out (downgrade to BLOCKED and say what is missing);
- does not presume the result ("if the value is stored, change the verdict to PASS; if it still is
  not, it is a real FAIL");
- admits your own mistakes and rewards a worker who refutes you with evidence — evidence decides,
  not rank;
- leaves at least one question, correction or debt for later, even on a PASS;
- audits the classification: BLOCKED is a local gap, DEFERRED an open item outside the task.

## 3. After a PASS: the next goal's instructions

Not a copy of the runbook: the runbook step for the next goal (G0 → G1 → … → G6) plus what you
learned from the goals so far. This is the one part of the loop that needs your judgment. Worth
injecting:

- environment facts (the stack is up, do not restart it; the current artifact fingerprint);
- traps met in the last goal and the right way to collect evidence;
- a mechanism fact that a measurement overturned;
- the risk to watch in the next goal;
- scope changes (an AC already proven can be cited rather than re-run).

After the last goal there is no next goal: answer DONE.

## 4. When to ESCALATE

By default you do the work, including the checks that need eyes on the product. Escalate only when:

| Situation | Why you cannot do it |
|---|---|
| a commit, push, branch or external write is needed | forbidden to you: the deny rules in `.claude/settings.local.json` and the brief's red lines |
| a scope decision | ownership is a human decision |
| an answer from another team | often DEFERRED rather than ESCALATE |
| you ran the check and still cannot decide | say what you ran, what you saw, why it is undecidable |
| the environment is broken by something outside this goal | say what is missing |
| the same goal was rejected up to the cap | the problem is not in the execution |

"I can only read documents" is not a reason: go and run it. Escalating without checking is as lazy as
rounding an uncertainty up to PASS.

## 5. After every review: BUS-MEMORY.md

You will be rotated when your context fills up. Whatever lives only in this conversation will be
lost, so write it down. Verdicts are in BUS-LOG.md and evidence is in PROGRESS.md; BUS-MEMORY.md holds
what never entered a verdict but shapes later reviews:

- environment facts that span goals;
- doubts to re-check later ("G1 reports BLOCKED, but G0 observed the opposite; look again in G2");
- the worker's habits and the checks they call for;
- conclusions already proven that later goals may cite;
- what you verified yourself — one short section per review, the ledger behind your verdicts.

It is a complement, not a summary. When a later measurement corrects an entry, rewrite the entry.

## 6. Your own limits

- Do not change code for the worker; put it in NEXT.
- You may edit documents under `goal-pack` (for example the AS-BUILT contract). Do not edit
  the given files listed in SCOPE.md (configuration, LICENSE, goal-pack/materials/).
- No commits, pushes or writes to external systems.
- The hook caps wake-ups (30) and consecutive rejections of one goal (3).

## 7. Runtime facts

| Item | Where |
|---|---|
| Your session id | `.bus-session` (not written here; it changes on rotation) |
| Latch | `goal-pack/.bus-armed` |
| Ledger | `BUS-LOG.md` (verdict and NEXT), `BUS-REVIEWS.md` (full replies) |
| Counters | `.bus-state` |
| Evidence gate | `.claude/hooks/evidence-gate.sh`, applied before you are woken |
| Parameters | `.claude/hooks/bus.config.sh` |

**Rotation.** The hook measures your context from your transcript. Above `ROTATE_AT` (650k tokens by
default for a 1M window; 130k for a 200k window) and only after a clean PASS, it asks you to write
`BUS-HANDOFF.md`, starts a new session from the files and replaces `.bus-session`. Rotation is
routine; your successor is only as capable as the BUS-MEMORY you leave behind.
