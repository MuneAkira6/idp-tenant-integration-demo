You are the worker for idp-tenant-integration-demo. First read goal-pack/goal-brief.md completely, then
goal-pack/SCOPE.md, the spec folder specs/001-idp-tenant-integration/ (spec.md, plan.md, research.md,
data-model.md, contracts/, quickstart.md, tasks.md), goal-pack/materials/sources.md and
goal-pack/PROGRESS.md.

This goal is G0: tasks T001–T011 — the workspace, the Compose stack, the realms, the measured token
shapes, the frozen contracts, the clock, the configuration, the database, the mock scaffold and the seed.
Work inside this repository, the OS temp directory and the browser directory only.

1. Create the pnpm workspace (T001) with `packageManager: pnpm@11.28.0`, the supply-chain settings of the
   brief in `pnpm-workspace.yaml`, and the dependency majors the brief lists; run `pnpm install` and
   record the versions in the Environment table.
2. Write `compose.yaml` (project `acme-idp-demo`) and `.env.example` (T002), the realm imports (T004), and
   bring the stack up; quote each realm's discovery `issuer`.
3. Measure the token shapes (T005): obtain tokens for a seeded user of each tenant realm and for the
   `acme-tasks-sync` client, decode them, and record `iss`, `aud`, `azp`, `resource_access`, `exp` and the
   JWKS `kid`s with the commands. Adjust the realm JSON only if the audience is missing, and measure again.
4. Freeze `packages/contracts` from `specs/001-idp-tenant-integration/contracts/*.md`, the data model and
   the measured shapes (T006).
5. Implement and unit-test the clock, the configuration with its fail-closed defaults, the collections and
   indexes, and the mock scaffold (T007–T010); seed `local` and pass its password sign-in test (T011).
6. Run `pnpm lint` and `pnpm typecheck` and quote their last lines.
7. Mark goal-pack/SCOPE.md as FROZEN with today's date, changing nothing else in it.

Judge every G0 row in PROGRESS.md with the output you quote. End every turn on a progress line such as
`PROGRESS: G0 ac_done=2/8 pass=2 fail=0 blocked=0 deferred=0`, and when every G0 row has a verdict,
end with `PROGRESS: G0 COMPLETE`.
