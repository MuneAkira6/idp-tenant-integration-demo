# How this goal pack was made from the spec folder

Form: spec-driven-dev-playbook's `templates/goal-pack-from-spec.md`. The spec folder is
[specs/001-idp-tenant-integration/](../specs/001-idp-tenant-integration/spec.md); this file records
where each of its outputs went in this pack, and reconciles the counts.

## Mapping

| SDD output | Where it went in this pack | Note |
|---|---|---|
| spec.md, the disposition table: 13 criteria adopted or changed | the verdict rows, through the FRs and SCs each criterion points to | the 2 excluded criteria get no row; their reasons stay in spec.md |
| spec.md, the Permissions section: 3 roles | AC-40 (`member`), AC-41 (`manager`), AC-42 (`admin`) | one row per role |
| spec.md: US1–US9, FR-001–FR-035, SC-001–SC-009, Clarifications C1–C7 | the AC rows of G1–G6; AC-39 checks that every FR and SC has a row | each row names the FR, SC, scenario Q and task T it proves |
| plan.md and tasks.md: the phases and T001–T070 | the goals G0–G6 ([SCOPE.md](SCOPE.md), Goals and tasks) and the steps of [runbook.md](runbook.md) | in the order of the tasks' Dependencies, not reordered |
| the constitution, principles I–VII | [goal-brief.md](goal-brief.md), "The constitution, verbatim", and its red lines | copied, not summarised |
| tasks.md, the verification checklists M1–M12 and L1–L12 | the rules of judgment: each item names its row, and the row carries the item's id | manual and logical items keep their own ids |
| facts.md, F3–F10 | goal-brief.md, "Facts already verified", with the ids | ids unchanged; the run appends from F11 on |
| quickstart.md, Q1–Q18 and the controls | the evidence each row asks for | a guard's row quotes its control red and its test green |

## Counts reconciled

- Disposition table: 15 criteria; 13 adopted or changed, 2 excluded.
- Permissions section: 3 roles; 3 rows (AC-40 to AC-42).
- Verdict table: 83 rows. 53 are requirement rows (E1–E8 and AC-1 to AC-45); 30 are checks: the tests,
  lint and change set of every goal, the M and L items that are not already an AC row, and the closing
  of G6.
- Why the numbers differ: the template counts one row per adopted or changed criterion plus one per
  role, 13 + 3 = 16. This pack has 53 requirement rows because the spec split each criterion into
  several FRs and SCs before the pack was made, and the rows follow the spec, not the ticket
  (constitution II). No criterion is lost: the trace below lists, for each adopted or changed criterion,
  the rows that prove it, and every AC row appears in it at least once, except the closing rows AC-36 to
  AC-39. E1–E8 prove the stack, which no criterion names.

## Trace: each adopted or changed criterion to the rows that prove it

| # | Criterion of ACME-2040 (shortened; the verbatim text is in spec.md) | Disposition | Rows |
|---|---|---|---|
| 1 | sign in with the group account | Adopted | AC-1, AC-2, AC-5 |
| 2 | the web client keeps the platform's token | Changed | AC-3 |
| 3 | signed in as long as on the platform | Changed | AC-4 |
| 4 | other services call the API with a platform token | Adopted | AC-9 to AC-13 |
| 5 | role changes applied immediately | Changed | AC-14, AC-15, AC-43 |
| 6 | unknown platform roles ignored | Changed | AC-16 |
| 7 | permissions follow the roles | Changed | AC-40 to AC-42, AC-44, AC-45 |
| 8 | the platform's tenant events received | Adopted | AC-17 to AC-23, AC-25 |
| 9 | a deleted tenant's data deleted | Changed | AC-24, AC-26 |
| 10 | each tenant's devices shown | Adopted | AC-27 to AC-31 |
| 11 | the functions the platform owns not shown | Adopted | AC-32 to AC-35 |
| 13 | signing out everywhere | Changed | AC-6 |
| 15 | switched on per tenant, nothing changes before | Adopted | AC-7, AC-8 |

Criteria 12 and 14 are excluded and have no row.
