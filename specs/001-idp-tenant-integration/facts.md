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

### F11: Keycloak 26.7.4 imports `${env.NAME}` in a realm file literally; it substitutes nothing

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the implementation run, G0 (T004), on the host that runs it
- Commands (the realm import declared `"secret": "${env.ACME_TASKS_SECRET_TENANT_A}"` for the client
  `acme-tasks` and `"credentials": [{"type":"password","value":"${env.KEYCLOAK_SEED_PASSWORD}"}]` for
  alice; the env file held generated values for both names). Three token requests: with the generated
  values, with the placeholder as the client secret, and with the placeholder as both:

```
curl -sS --noproxy '*' -o /tmp/tok-a.json -w 'http_code=%{http_code}\n' \
  -d grant_type=password -d client_id=acme-tasks \
  --data-urlencode "client_secret=$ACME_TASKS_SECRET_TENANT_A" \
  -d username=alice --data-urlencode "password=$KEYCLOAK_SEED_PASSWORD" -d scope=openid \
  http://localhost:18480/realms/tenant-a/protocol/openid-connect/token

curl -sS --noproxy '*' ... --data-urlencode 'client_secret=${env.ACME_TASKS_SECRET_TENANT_A}' \
  -d username=alice --data-urlencode "password=$KEYCLOAK_SEED_PASSWORD" ...

curl -sS --noproxy '*' ... --data-urlencode 'client_secret=${env.ACME_TASKS_SECRET_TENANT_A}' \
  -d username=alice --data-urlencode 'password=${env.KEYCLOAK_SEED_PASSWORD}' ...
```

- Output:

```
http_code=401
{"error":"unauthorized_client","error_description":"Invalid client or Invalid client credentials"}

http_code=400
{"error":"invalid_grant","error_description":"Invalid user credentials"}

http_code=200
access_token expires_in refresh_expires_in refresh_token token_type id_token not-before-policy session_state scope
```

- What follows: the second call authenticated the client, so the stored client secret is the literal
  string `${env.ACME_TASKS_SECRET_TENANT_A}`; the third shows the same for the seeded password. A realm
  import cannot carry a secret from the environment. Since no secret may be written into this repository
  (goal-brief.md, red line 5) and the root `.gitignore` is a given file that does not list `.env`, the
  realm files under `infra/keycloak/realms/` declare no `secret` and no `credentials`, and
  `scripts/provision.ts` sets both through the admin API after the import, from the env file that
  `scripts/stack.sh` writes into the OS temp directory.
- Decisions that depend on it: T002 and T004 (`compose.yaml`, the realm imports, `scripts/stack.sh`);
  R-15 (secrets only through the environment).

### F12: Without an audience mapper a tenant realm's access token carries no `aud` at all

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the implementation run, G0 (T005), on the host that runs it
- Commands (the realms as first imported, with no protocol mapper on `acme-tasks`; `decode.mjs` prints
  the JOSE header and the claims research R-2 names, and replaces `sub` with `<uuid>`):

```
curl -sS --noproxy '*' -d grant_type=password -d client_id=acme-tasks \
  --data-urlencode "client_secret=$ACME_TASKS_SECRET_TENANT_A" -d username=alice \
  --data-urlencode "password=$KEYCLOAK_SEED_PASSWORD" -d scope=openid \
  http://localhost:18480/realms/tenant-a/protocol/openid-connect/token | node decode.mjs
```

- Output (tenant-a; tenant-b printed the same shape with its own issuer and `preferred_username`):

```
header: {"alg":"RS256","kid":"AGgS-wAPuAEYdYPFLwsByNmQaPkCuL6M119sPFk0g10","typ":"JWT"}
payload (selected): {
  "iss": "http://localhost:18480/realms/tenant-a",
  "azp": "acme-tasks",
  "resource_access": {
    "acme-tasks": {
      "roles": [
        "tasks-user"
      ]
    }
  },
  "exp": 1790753046,
  "sub": "<uuid>",
  "preferred_username": "alice"
}
```

- What follows: `aud` is not merely different from `acme-tasks-api`, it is absent — the realms define no
  default roles, so not even Keycloak's usual `account` audience appears. A verifier written from the
  documentation, expecting `aud` to exist, would have been written against a token that has no such
  claim. Research R-2 named this case: an audience mapper (`oidc-audience-mapper`, included custom
  audience `acme-tasks-api`) was added to `acme-tasks` and `acme-tasks-shortlived` in both tenant realms,
  and to `acme-tasks-sync` in `platform` (audience `platform-api`), and the shapes were measured again
  (F13, F14, F15).
- Decisions that depend on it: R-2; the realm imports of T004; the audience check of FR-008.

### F13: The access token of a seeded user of `tenant-a`, with the audience mapper

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the implementation run, G0 (T005), on the host that runs it
- Commands (alice has one client role; carol has roles in two clients, which is the union FR-011 maps):

```
curl -sS --noproxy '*' -d grant_type=password -d client_id=acme-tasks \
  --data-urlencode "client_secret=$ACME_TASKS_SECRET_TENANT_A" -d username=alice \
  --data-urlencode "password=$KEYCLOAK_SEED_PASSWORD" -d scope=openid \
  http://localhost:18480/realms/tenant-a/protocol/openid-connect/token | node decode.mjs

# the same with -d username=carol
```

- Output:

```
header: {"alg":"RS256","kid":"rTo4HOV-RnHukBS3dMuKSoJmJvQIMI8Uvi7KMVezO4M","typ":"JWT"}
payload (selected): {
  "iss": "http://localhost:18480/realms/tenant-a",
  "aud": "acme-tasks-api",
  "azp": "acme-tasks",
  "resource_access": {
    "acme-tasks": {
      "roles": [
        "tasks-user"
      ]
    }
  },
  "exp": 1790753089,
  "sub": "<uuid>",
  "preferred_username": "alice"
}
header: {"alg":"RS256","kid":"rTo4HOV-RnHukBS3dMuKSoJmJvQIMI8Uvi7KMVezO4M","typ":"JWT"}
payload (selected): {
  "iss": "http://localhost:18480/realms/tenant-a",
  "aud": [
    "acme-tasks-api",
    "acme-reports"
  ],
  "azp": "acme-tasks",
  "resource_access": {
    "acme-tasks": {
      "roles": [
        "tasks-user"
      ]
    },
    "acme-reports": {
      "roles": [
        "reports-admin"
      ]
    }
  },
  "exp": 1790753089,
  "sub": "<uuid>",
  "preferred_username": "carol"
}
```

- What follows: the tenant is named by `iss`, exactly as FR-005 needs. **`aud` is a string when there is
  one audience and an array when there are several**: carol's token gained `acme-reports` because she
  holds a role in that client, so the verifier must accept both forms — this is the single most
  load-bearing shape in the measurement. `azp` is the client that asked, `acme-tasks`. `resource_access`
  is keyed by client id, and a user's roles across clients appear together, which is the union FR-011
  maps. `exp` is Unix seconds (300 s after issue, the realm's `accessTokenLifespan`).
- Decisions that depend on it: R-2, R-4 (the `jose` verifier's `iss`, `aud` and `exp` checks), R-18 and
  FR-011 (role derivation reads `resource_access`), and the frozen types of `packages/contracts`.

### F14: The access token of a seeded user of `tenant-b`

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the implementation run, G0 (T005), on the host that runs it
- Command:

```
curl -sS --noproxy '*' -d grant_type=password -d client_id=acme-tasks \
  --data-urlencode "client_secret=$ACME_TASKS_SECRET_TENANT_B" -d username=bob \
  --data-urlencode "password=$KEYCLOAK_SEED_PASSWORD" -d scope=openid \
  http://localhost:18480/realms/tenant-b/protocol/openid-connect/token | node decode.mjs
```

- Output:

```
header: {"alg":"RS256","kid":"7bfhVCoGJ0xMNcJrVHub3CgRNiDaOY59iLdzuYF2l8U","typ":"JWT"}
payload (selected): {
  "iss": "http://localhost:18480/realms/tenant-b",
  "aud": "acme-tasks-api",
  "azp": "acme-tasks",
  "resource_access": {
    "acme-tasks": {
      "roles": [
        "tasks-user"
      ]
    }
  },
  "exp": 1790753089,
  "sub": "<uuid>",
  "preferred_username": "bob"
}
```

- What follows: the second tenant realm produces the same shape under its own issuer and its own signing
  key, so one verifier serves both and the issuer alone separates the tenants (FR-005). The audience
  `acme-tasks-api` is the same string in both realms, so `PLATFORM_AUDIENCE` is one setting.
- Decisions that depend on it: R-2, R-4; FR-005, FR-008.

### F15: The client-credentials access token of `acme-tasks-sync` in the `platform` realm

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the implementation run, G0 (T005), on the host that runs it
- Command:

```
curl -sS --noproxy '*' -d grant_type=client_credentials -d client_id=acme-tasks-sync \
  --data-urlencode "client_secret=$ACME_TASKS_SYNC_SECRET" \
  http://localhost:18480/realms/platform/protocol/openid-connect/token | node decode.mjs
```

- Output:

```
header: {"alg":"RS256","kid":"j0q5WCYrA-SoZcex5Qj4gsdQc5eJ6Sgx2uMddIS7kus","typ":"JWT"}
payload (selected): {
  "iss": "http://localhost:18480/realms/platform",
  "aud": [
    "platform-api",
    "account"
  ],
  "azp": "acme-tasks-sync",
  "resource_access": {
    "account": {
      "roles": [
        "manage-account",
        "manage-account-links",
        "view-profile"
      ]
    }
  },
  "exp": 1790753089,
  "sub": "<uuid>",
  "preferred_username": "service-account-acme-tasks-sync"
}
```

- What follows: the lookup token the API sends to the mock platform (R-9) is issued by a different
  issuer from any tenant token, so a service token can never be mistaken for a user token. Its `aud`
  is an array containing `platform-api`, and `account` is there as well because a service-account user
  keeps Keycloak's default account roles — which is also why this realm's token has an `aud` at all
  while a tenant token had none before the mapper (F12). `resource_access` carries no application role:
  the mock authorises this caller by `azp`/`aud`, not by a role.
- Decisions that depend on it: R-9 and the tenant lookup of FR-020; the mock's Bearer check in
  contracts/platform.md.

### F16: Each realm publishes exactly one RS256 signing key, beside an RSA-OAEP encryption key

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the implementation run, G0 (T005), on the host that runs it
- Command:

```
for r in platform tenant-a tenant-b; do
  echo "=== $r ==="
  curl -sS --noproxy '*' "http://localhost:18480/realms/$r/protocol/openid-connect/certs" \
   | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);for(const k of j.keys)console.log(`kid=${k.kid} kty=${k.kty} alg=${k.alg} use=${k.use}`)})'
done
```

- Output:

```
=== platform ===
kid=ARAMz7uuM4n-gNuFOgObbKU4FrkUe-Jp29uagQi2_gU kty=RSA alg=RSA-OAEP use=enc
kid=j0q5WCYrA-SoZcex5Qj4gsdQc5eJ6Sgx2uMddIS7kus kty=RSA alg=RS256 use=sig
=== tenant-a ===
kid=HetA_vF9vu6_473mb8VjrgCWoUWMwGcrBKKm3GtbRcw kty=RSA alg=RSA-OAEP use=enc
kid=rTo4HOV-RnHukBS3dMuKSoJmJvQIMI8Uvi7KMVezO4M kty=RSA alg=RS256 use=sig
=== tenant-b ===
kid=7bfhVCoGJ0xMNcJrVHub3CgRNiDaOY59iLdzuYF2l8U kty=RSA alg=RS256 use=sig
kid=p6_XBS9hMl0YTvHyRcBbFWVDj3VKAa19IruJSa_nERY kty=RSA alg=RSA-OAEP use=enc
```

- What follows: the signing `kid`s are the ones the tokens of F13, F14 and F15 carry in their headers,
  and each realm has its own. The JWKS also lists an `enc` key, so a verifier must select by `use`/`alg`
  and not take the first key. The `kid`s are generated per realm creation, so they change whenever the
  stack is recreated with `down -v`: nothing may hard-code them, and R-4's "one refetch on an unknown
  `kid`" is the only way a rotated key is picked up.
- Decisions that depend on it: R-4 (`createRemoteJWKSet` per issuer, refetch on an unknown `kid`);
  AC-13.

### F17: Playwright 1.62.1 does not hand a server-redirected request to a route handler

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the implementation run, G1 (T064), on the host that runs it
- Commands: two probe specs run with `pnpm e2e`. The first navigates straight to the web origin, which
  nothing listens on; the second completes the real sign-in, whose last hop is a 302 from the API to
  that same origin. Both register the same handler before navigating:

```
await context.route('http://localhost:18401/**', (route) => {
  console.log('ROUTED', route.request().url())
  return route.fulfill({ status: 200, contentType: 'text/html', body: 'landing' })
})

# probe 1
await page.goto('http://localhost:18401/board')

# probe 2 — the sign-in of quickstart Q1, with every response and failure logged
await page.goto('http://localhost:18400/auth/login?tenant=tenant-a')
await page.fill('#username', 'alice'); await page.fill('#password', <from the env file>)
await page.click('#kc-login')
```

- Output (probe 2's log cut to the last three lines; the Keycloak stylesheet and font requests are
  omitted):

```
# probe 1
direct nav url= http://localhost:18401/board seen= ["http://localhost:18401/board"]
  ✓  1 [chromium] › tests/e2e/__probe.spec.ts:3:1 › route interception on a redirected top-level navigation (95ms)

# probe 2
RES 302 http://localhost:18480/realms/tenant-a/login-actions/authenticate?session_code=s3Ari21obgK
RES 302 http://localhost:18400/auth/callback?state=01nVR4SHqCXVqbVxVdV34kVldfqHYR9jEUzlnxwngbA&ses
FAILED http://localhost:18401/board net::ERR_CONNECTION_REFUSED
FINAL URL chrome-error://chromewebdata/
```

- What follows: the identical handler fires for a direct navigation (`ROUTED` printed, `seen` holds the
  URL) and does not fire for the same URL reached by a server redirect — no `ROUTED` line, and the
  browser hits the dead origin itself. Intercepting the whole chain with `context.route('**/*', …)` and
  `route.continue()` on the other origins was tried as well and changed nothing. So while the web
  client does not exist, a landing on a dead origin cannot be stubbed: T064 catches the landing with
  `page.waitForRequest('http://localhost:18401/board')` and asserts `isNavigationRequest()`, which
  observes that the browser was sent there, and leaves the rendered page to G5.
- Decisions that depend on it: T064's design (E2E of SC-001); re-examined in G5, when `apps/web` is
  listening on 18401 and the landing can simply be navigated to.

### F18: `resource_access` is in Keycloak's access token and not in its ID token

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the implementation run, G2 (T029), on the host that runs it
- Command (one token response for carol, who holds a role in two clients, with both of its tokens
  decoded side by side):

```
curl -sS --noproxy '*' -d grant_type=password -d client_id=acme-tasks \
  --data-urlencode "client_secret=$ACME_TASKS_SECRET_TENANT_A" -d username=carol \
  --data-urlencode "password=$KEYCLOAK_SEED_PASSWORD" -d scope=openid \
  http://localhost:18480/realms/tenant-a/protocol/openid-connect/token \
 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
const dec=t=>JSON.parse(Buffer.from(t.split(".")[1],"base64url").toString());
const a=dec(j.access_token), i=dec(j.id_token);
console.log("access_token.resource_access =", JSON.stringify(a.resource_access));
console.log("id_token.resource_access     =", JSON.stringify(i.resource_access));
console.log("id_token keys =", Object.keys(i).join(" "));})'
```

- Output:

```
access_token.resource_access = {"acme-tasks":{"roles":["tasks-user"]},"acme-reports":{"roles":["reports-admin"]}}
id_token.resource_access     = undefined
id_token keys = exp iat jti iss aud sub typ azp sid at_hash acr email_verified name preferred_username given_name family_name email
```

- What follows: the roles of FR-011 are in the **access** token; the ID token has no `resource_access`
  key at all. F13 measured the access token, so the recorded shape was right, but the sign-in path
  first read the ID token — the only token the authorisation code flow verifies — and derived an empty
  set of roles for every user, which the permission check then turned into 403 on every operation. The
  callback now derives from the access token's claims (`apps/api/src/auth/platform.ts`,
  `CallbackResult.accessClaims`), read rather than re-verified: it arrives in the same token-endpoint
  response as the ID token that was verified, over the back channel. The tenant still comes from the
  ID token's `iss` (FR-005). The alternative, a Keycloak protocol mapper that copies the client roles
  into the ID token, was not taken: it would change the realm imports to work around reading the token
  that already has the claim.
- Decisions that depend on it: T029 and FR-011 to FR-013 (role derivation at sign-in); AC-14, AC-15,
  AC-16; the permission rows AC-40 to AC-42, which fail for every role without it.

### F19: A token from a second client of the same realm carries `aud` naming that client, not our API

- Measured on: 2026-09-30 / last re-measured: 2026-09-30
- Measured by: the implementation run, G2 (T022), on the host that runs it
- Command:

```
curl -sS --noproxy '*' -d grant_type=password -d client_id=acme-reports \
  --data-urlencode "client_secret=$ACME_REPORTS_SECRET_TENANT_A" -d username=alice \
  --data-urlencode "password=$KEYCLOAK_SEED_PASSWORD" -d scope=openid \
  http://localhost:18480/realms/tenant-a/protocol/openid-connect/token | node decode.mjs
```

- Output:

```
{
 "iss": "http://localhost:18480/realms/tenant-a",
 "aud": "acme-tasks",
 "azp": "acme-reports"
}
```

- What follows: quickstart Q5's "wrong audience" case has a real token to use. `acme-reports` carries
  no audience mapper, so its token is addressed to `acme-tasks` — the *client id* of the other client,
  a plain string, and not `acme-tasks-api`. Same issuer, same realm, valid signature, unexpired: only
  the audience separates it from an acceptable token, which is what makes it the right negative case
  for FR-008. Together with F13's array form it confirms that the audience check must be containment
  over `audiences()` and never an equality test against a string.
- Decisions that depend on it: T022 and AC-10; the audience check of `apps/api/src/auth/bearer.ts`.
