# Fact table — 001 sign-in and tenant integration with the group platform

Form: the fact entry of spec-driven-dev-playbook (`templates/fact-entry.md`). One fact per entry, with
the date, the command, its output as printed, what follows from it and the decisions that depend on it.
A fact is measured again before a decision depends on it. When a measurement overturns an entry, the
entry stays as it was and a "Superseded" box is added under it.

F1 and F2 are documents, not measurements, and are listed in the [launch brief](launch-brief.md). The
entries below start at F3. The implementation run appends its own measurements from F11 on (G0 measures
the token shapes). Paths under the account's home directory are shown as `~`; nothing else in the outputs
is changed.

### F3: Docker 28.1.1 and Compose v2.35.1 are available to this account

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the SDD session, on the host that runs the implementation
- Commands:

```
docker version --format '{{.Server.Version}}'
docker compose version
id -nG | tr ' ' '\n' | grep -cx docker
```

- Output:

```
28.1.1
Docker Compose version v2.35.1
1
```

- What follows: the stack runs as `docker compose` under one project name, without sudo. Membership of
  the `docker` group is root-equivalent, which is why the goal brief allows Docker only through this
  repository's Compose project.
- Decisions that depend on it: R-15; the Docker red line of the goal brief.

### F4: The two images of the stack are present: Keycloak 26.7.4, the newest stable tag, and MongoDB 7.0.43

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the SDD session, on the host that runs the implementation
- Commands:

```
curl -s 'https://quay.io/api/v1/repository/keycloak/keycloak/tag/?limit=100&onlyActiveTags=true' | jq -r '.tags[].name' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 3
docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' quay.io/keycloak/keycloak:26.7.4
docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' mongo:7
docker run --rm mongo:7 mongod --version | head -n 1
```

- Output:

```
26.7.2
26.7.3
26.7.4
quay.io/keycloak/keycloak:26.7.4 477MB
mongo:7 865MB
db version v7.0.43
```

- What follows: the run pulls no image. `mongo:7` is a moving tag; the version it names today is 7.0.43,
  and the ledger records the digest the run used.
- Decisions that depend on it: R-1 (Keycloak as the IdP stand-in); plan.md, Storage.

### F5: Ports 18400–18419 and 18480 are free

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the SDD session, on the host that runs the implementation
- Commands:

```
ss -ltnH | awk '{print $4}' | sed 's/.*://' | sort -un | tr '\n' ' '
ss -ltnH | awk '{print $4}' | sed 's/.*://' | awk '($1>=18400 && $1<=18419) || $1==18480' | wc -l
```

- Output:

```
22 53 139 445 631 3128 3350 3389
0
```

- What follows: the run's ports (API 18400, web 18401, mock platform 18402, MongoDB 18417, Keycloak
  18480) are free. The listed ports belong to other services on this host and are not touched.
- Decisions that depend on it: R-15.

### F6: Playwright 1.63.0 cannot install Chromium on this host; 1.62.1 can, and opens a page

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the SDD session, on the host that runs the implementation, in a scratch workspace with
  `PLAYWRIGHT_BROWSERS_PATH` set to the run's own browser directory
- Commands, once with `@playwright/test` 1.63.0 and once with 1.62.1:

```
pnpm exec playwright --version
pnpm exec playwright install chromium
node open.mjs   # launches Chromium headless, sets a page, prints its title, its text and the browser version
```

- Output with 1.63.0:

```
Version 1.63.0
Failed to install browsers
Error: ERROR: Playwright does not support chromium on ubuntu20.04-x64
```

- Output with 1.62.1 (the probe cut the download line at 140 characters):

```
Version 1.62.1
Chrome Headless Shell 151.0.7922.34 (playwright chromium-headless-shell v1234) downloaded to ~/portfolio-runs/ms-playwright/c
title=probe text=ok browser=151.0.7922.34
```

- What follows: the newest Playwright does not support this host's Ubuntu 20.04; 1.62.1 does, and its
  Chromium is already in the run's browser directory. CI on ubuntu-24.04 is not affected.
- Decisions that depend on it: R-10; the Playwright rule of the goal brief.

### F7: Node v24.19.0, and pnpm 11.28.0 through `packageManager`

- Measured on: 2026-09-30 / last re-measured: 2026-09-30 (Node)
- Measured by: the SDD session, on the host that runs the implementation
- Commands (the second in a scratch workspace whose `package.json` says `"packageManager": "pnpm@11.28.0"`):

```
node --version
pnpm --version
```

- Output:

```
v24.19.0
11.28.0
```

- What follows: the workspace pins pnpm through `packageManager`, and the host's corepack honours it.
- Decisions that depend on it: T001.

Superseded

- Superseded on: 2026-09-30
- New observation: corepack is not what selects 11.28.0. The host's `pnpm` is its own global install,
  version 11.22.0, and pnpm itself switches to the version `packageManager` names:

```
$ pnpm --version   # in the home directory, no packageManager
11.22.0
$ readlink /usr/local/bin/pnpm
../lib/node_modules/pnpm/bin/pnpm.mjs
$ pnpm --version   # in a scratch workspace with packageManager pnpm@11.28.0
11.28.0
```

- What follows now: the pin through `packageManager` holds without corepack, and corepack must not be
  enabled on this host: `corepack enable` rewrites the shared `/usr/local/bin/pnpm` (an earlier run on
  this host did so, then could not fetch pnpm through the proxy, and lost `pnpm` until it was repaired).
- How to read the entry above: kept as it was; its output is still true, its "what follows" is not.

### F8: Rsbuild 1 stops the install under the supply-chain settings, because of core-js's build script

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the SDD session, on the host that runs the implementation
- Commands, in a scratch workspace with `minimumReleaseAge: 4320`, `strictDepBuilds: true`,
  `allowBuilds: {}` and the dependency set with `@rsbuild/core` ^1 and `@rsbuild/plugin-react` ^1; the
  second after declaring `core-js: false` in `allowBuilds` so that the install finishes:

```
pnpm install
pnpm why core-js
```

- Output (the first lines of each):

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: core-js@3.47.0
core-js@3.47.0
└─┬ @rsbuild/core@1.7.6
  ├─┬ @rsbuild/plugin-react@1.4.6
```

- What follows: with Rsbuild 1 the install fails unless the supply-chain settings are widened for
  core-js, and the build script comes from Rsbuild 1 itself.
- Decisions that depend on it: R-16.

### F9: With Rsbuild 2, React Router 8 and the MongoDB driver 7, the whole dependency set installs with no build script

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the SDD session, on the host that runs the implementation
- Command, in a scratch workspace with the same settings and the majors of research R-16:

```
pnpm install
```

- Output (the timing line of the probe, the last line of pnpm and part of the resolved list):

```
pnpm install rc=0 in 8s
Done in 6.7s using pnpm v11.28.0
+ mongodb 7.6.0
+ react-router 8.4.0
+ @rsbuild/core 2.2.9
+ @rsbuild/plugin-react 2.1.0
```

- What follows: the chosen majors need no entry in `allowBuilds`, so it stays empty. The newest
  published versions were newer (`@rsbuild/core` 2.2.11, `mongodb` 7.7.0); `minimumReleaseAge` held them
  back, as intended.
- Decisions that depend on it: R-16; the dependency list of the goal brief.

### F10: The host has no Java and no MongoDB shell

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the SDD session, on the host that runs the implementation
- Command:

```
for c in java mongosh mongo; do printf '%s: %s\n' "$c" "$(command -v "$c" || echo 'not found')"; done
```

- Output:

```
java: not found
mongosh: not found
mongo: not found
```

- What follows: database queries run inside the container, with `docker compose exec mongodb mongosh`.
- Decisions that depend on it: the goal brief's rule for database evidence.
