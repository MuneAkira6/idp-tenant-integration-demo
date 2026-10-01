/**
 * Set the realms' client secrets and the seeded users' passwords from the environment.
 *
 * Keycloak 26.7.4 does not substitute `${env.NAME}` in a realm import: it stores the placeholder
 * verbatim (facts.md, F11). The realm files under infra/keycloak/realms/ therefore carry no secret and
 * no credential, and this step pushes both in through the admin API, from the env file that
 * scripts/stack.sh generates outside the repository (goal-brief.md, red line 5).
 *
 * Run: node scripts/provision.ts   (scripts/stack.sh up runs it after `docker compose up --wait`)
 */

const BASE = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:18480'

/** clientId → the environment variable holding its secret, per realm. */
const CLIENT_SECRETS: Record<string, Record<string, string>> = {
  platform: { 'acme-tasks-sync': 'ACME_TASKS_SYNC_SECRET' },
  'tenant-a': {
    'acme-tasks': 'ACME_TASKS_SECRET_TENANT_A',
    'acme-reports': 'ACME_REPORTS_SECRET_TENANT_A',
    'acme-tasks-shortlived': 'ACME_TASKS_SHORTLIVED_SECRET_TENANT_A',
  },
  'tenant-b': {
    'acme-tasks': 'ACME_TASKS_SECRET_TENANT_B',
    'acme-reports': 'ACME_REPORTS_SECRET_TENANT_B',
    'acme-tasks-shortlived': 'ACME_TASKS_SHORTLIVED_SECRET_TENANT_B',
  },
}

const SEEDED_USERS: Record<string, string[]> = {
  'tenant-a': ['alice', 'mia', 'adam', 'carol', 'dave', 'erin'],
  'tenant-b': ['bob', 'bianca'],
}

function required(name: string): string {
  const value = process.env[name]
  if (!value)
    throw new Error(`${name} is not set; run scripts/stack.sh up, which writes the env file`)
  return value
}

async function adminToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: required('KC_BOOTSTRAP_ADMIN_USERNAME'),
    password: required('KC_BOOTSTRAP_ADMIN_PASSWORD'),
  })
  const res = await fetch(`${BASE}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`admin token: ${res.status} ${await res.text()}`)
  return ((await res.json()) as { access_token: string }).access_token
}

async function admin(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE}/admin/realms${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`)
  return res
}

async function main(): Promise<void> {
  const token = await adminToken()
  const seedPassword = required('KEYCLOAK_SEED_PASSWORD')
  let clients = 0
  let users = 0

  for (const [realm, entries] of Object.entries(CLIENT_SECRETS)) {
    for (const [clientId, envName] of Object.entries(entries)) {
      const found = (await (
        await admin(token, `/${realm}/clients?clientId=${encodeURIComponent(clientId)}`)
      ).json()) as Array<Record<string, unknown>>
      const client = found[0]
      if (!client) throw new Error(`client ${clientId} not found in realm ${realm}`)
      await admin(token, `/${realm}/clients/${client.id as string}`, {
        method: 'PUT',
        body: JSON.stringify({ ...client, secret: required(envName) }),
      })
      clients += 1
    }
  }

  for (const [realm, usernames] of Object.entries(SEEDED_USERS)) {
    for (const username of usernames) {
      const found = (await (
        await admin(token, `/${realm}/users?exact=true&username=${encodeURIComponent(username)}`)
      ).json()) as Array<{ id: string }>
      const user = found[0]
      if (!user) throw new Error(`user ${username} not found in realm ${realm}`)
      await admin(token, `/${realm}/users/${user.id}/reset-password`, {
        method: 'PUT',
        body: JSON.stringify({ type: 'password', value: seedPassword, temporary: false }),
      })
      users += 1
    }
  }

  console.log(
    `provisioned ${clients} client secrets and ${users} user passwords from the environment`,
  )
}

await main()
