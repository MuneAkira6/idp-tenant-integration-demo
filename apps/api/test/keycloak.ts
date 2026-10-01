/**
 * Test helpers for driving the real Keycloak of the Compose stack without a browser: a cookie jar,
 * the login form, and the environments the tests load their configuration from.
 *
 * The secrets come from the env file `scripts/stack.sh` writes outside the repository; nothing here
 * hard-codes one.
 */

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const KEYCLOAK_BASE = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:18480'
export const API_PUBLIC_URL = 'http://localhost:18400'
export const WEB_BASE_URL = 'http://localhost:18401'

/** A port inside the run's range that nothing listens on: an IdP that cannot be reached (AC-4). */
export const CLOSED_PORT = 18419

export function stackEnv(): Record<string, string> {
  const path = process.env.ACME_IDP_ENV_FILE ?? join(tmpdir(), 'acme-idp-demo.env')
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const at = line.indexOf('=')
    if (at < 0) continue
    out[line.slice(0, at)] = line.slice(at + 1)
  }
  return out
}

export function issuerOf(realm: string, base: string = KEYCLOAK_BASE): string {
  return `${base}/realms/${realm}`
}

/** A fresh 32-byte AES key per test file, so no key is ever written down anywhere. */
export function newEncryptionKey(): string {
  return randomBytes(32).toString('base64')
}

export type TestEnvOptions = {
  /** tenants to configure; default both tenant realms */
  tenants?: string[]
  /** point an issuer at a closed port, to make the IdP unreachable */
  issuerOverride?: Record<string, string>
  encryptionKey?: string
}

/** The environment of a deployment where the integration IS configured (AC-1 to AC-6). */
export function integratedEnv(options: TestEnvOptions = {}): NodeJS.ProcessEnv {
  const secrets = stackEnv()
  const tenants = options.tenants ?? ['tenant-a', 'tenant-b']
  const secretName = (tenant: string) =>
    tenant === 'tenant-a' ? 'ACME_TASKS_SECRET_TENANT_A' : 'ACME_TASKS_SECRET_TENANT_B'
  return {
    PLATFORM_ISSUERS: tenants
      .map((tenant) => `${tenant}=${options.issuerOverride?.[tenant] ?? issuerOf(tenant)}`)
      .join(','),
    PLATFORM_CLIENTS: tenants
      .map((tenant) => `${tenant}=acme-tasks:${secrets[secretName(tenant)]}`)
      .join(','),
    PLATFORM_AUDIENCE: 'acme-tasks-api',
    TOKEN_ENC_KEY: options.encryptionKey ?? newEncryptionKey(),
    API_PUBLIC_URL: API_PUBLIC_URL,
    WEB_BASE_URL: WEB_BASE_URL,
  }
}

/** The environment of quickstart Q15: nothing configured at all (AC-7). */
export function unconfiguredEnv(): NodeJS.ProcessEnv {
  return { API_PUBLIC_URL: API_PUBLIC_URL, WEB_BASE_URL: WEB_BASE_URL }
}

// --------------------------------------------------------- a fake browser ----

export type AuthorizeResult = {
  /** true when the IdP answered the authorisation request without showing a login form */
  silent: boolean
  /** the redirect back to the API, or null when the IdP showed a form and none was submitted */
  callbackUrl: string | null
}

export type FakeBrowser = {
  cookieHeader(): string
  /** Follow an authorisation URL, submitting the login form if one appears. */
  authorize(authorizationUrl: string): Promise<AuthorizeResult>
  /** Follow an authorisation URL but never submit a form: does the IdP sign us in by itself? */
  probeSilent(authorizationUrl: string): Promise<AuthorizeResult>
}

const LOGIN_ACTION = /action="([^"]*login-actions\/authenticate[^"]*)"/

export function newBrowser(username: string, password: string): FakeBrowser {
  const jar = new Map<string, string>()

  const remember = (response: Response): void => {
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(';')[0] ?? ''
      const at = pair.indexOf('=')
      if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1))
    }
  }
  const cookieHeader = (): string => [...jar].map(([name, value]) => `${name}=${value}`).join('; ')

  const follow = async (url: string, submit: boolean): Promise<AuthorizeResult> => {
    const response = await fetch(url, { redirect: 'manual', headers: { cookie: cookieHeader() } })
    remember(response)
    const location = response.headers.get('location')
    // The IdP already had a session and sent the browser straight back: a silent sign-in.
    if (location) return { silent: true, callbackUrl: location }

    const html = await response.text()
    const action = LOGIN_ACTION.exec(html)?.[1]?.replaceAll('&amp;', '&')
    if (!action) throw new Error(`no login form and no redirect at ${url}`)
    if (!submit) return { silent: false, callbackUrl: null }

    const posted = await fetch(action, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader() },
      body: new URLSearchParams({ username, password, credentialId: '' }),
    })
    remember(posted)
    const back = posted.headers.get('location')
    if (!back) throw new Error(`sign-in as ${username} was not accepted (status ${posted.status})`)
    return { silent: false, callbackUrl: back }
  }

  return {
    cookieHeader,
    authorize: (url) => follow(url, true),
    probeSilent: (url) => follow(url, false),
  }
}

/** The path-and-query part of a callback URL, for `app.inject`. */
export function callbackPathOf(callbackUrl: string): string {
  const url = new URL(callbackUrl)
  return `${url.pathname}${url.search}`
}

/** Read one cookie's value out of a Fastify reply's `set-cookie` headers. */
export function cookieFromReply(headers: Record<string, unknown>, name: string): string | null {
  const raw = headers['set-cookie']
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [String(raw)]
  for (const entry of list) {
    const pair = entry.split(';')[0] ?? ''
    const at = pair.indexOf('=')
    if (at > 0 && pair.slice(0, at).trim() === name) return pair.slice(at + 1)
  }
  return null
}

/**
 * A real platform access token straight from Keycloak (the direct access grant the tenant realms
 * enable for the tests). Used where a test needs a token that the API must refuse or accept.
 */
export async function directGrantToken(options: {
  realm: string
  username: string
  clientId?: string
  secretName: string
}): Promise<string> {
  const secrets = stackEnv()
  const response = await fetch(`${issuerOf(options.realm)}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: options.clientId ?? 'acme-tasks',
      client_secret: secrets[options.secretName] as string,
      username: options.username,
      password: secrets.KEYCLOAK_SEED_PASSWORD as string,
      scope: 'openid',
    }),
  })
  if (!response.ok)
    throw new Error(`direct grant failed: ${response.status} ${await response.text()}`)
  return ((await response.json()) as { access_token: string }).access_token
}

// ------------------------------------------------------------ admin API ----
// Used only where a row requires the realm to change (a role removed, a signing key rotated in).
// Every such change is recorded in the Environment change ledger and restored in the same goal.

export async function adminToken(): Promise<string> {
  const secrets = stackEnv()
  const response = await fetch(`${KEYCLOAK_BASE}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: secrets.KC_BOOTSTRAP_ADMIN_USERNAME as string,
      password: secrets.KC_BOOTSTRAP_ADMIN_PASSWORD as string,
    }),
  })
  if (!response.ok) throw new Error(`admin token: ${response.status}`)
  return ((await response.json()) as { access_token: string }).access_token
}

async function admin(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${KEYCLOAK_BASE}/admin/realms${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok)
    throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`)
  return response
}

async function idOfUser(token: string, realm: string, username: string): Promise<string> {
  const found = (await (
    await admin(token, `/${realm}/users?exact=true&username=${encodeURIComponent(username)}`)
  ).json()) as Array<{ id: string }>
  const user = found[0]
  if (!user) throw new Error(`no user ${username} in ${realm}`)
  return user.id
}

async function idOfClient(token: string, realm: string, clientId: string): Promise<string> {
  const found = (await (
    await admin(token, `/${realm}/clients?clientId=${encodeURIComponent(clientId)}`)
  ).json()) as Array<{ id: string }>
  const client = found[0]
  if (!client) throw new Error(`no client ${clientId} in ${realm}`)
  return client.id
}

export type ClientRoleChange = { realm: string; username: string; clientId: string; role: string }

async function roleRepresentation(
  token: string,
  realm: string,
  clientUuid: string,
  role: string,
): Promise<unknown> {
  return (await (
    await admin(token, `/${realm}/clients/${clientUuid}/roles/${role}`)
  ).json()) as unknown
}

export async function removeClientRole(change: ClientRoleChange): Promise<void> {
  const token = await adminToken()
  const userId = await idOfUser(token, change.realm, change.username)
  const clientUuid = await idOfClient(token, change.realm, change.clientId)
  const role = await roleRepresentation(token, change.realm, clientUuid, change.role)
  await admin(token, `/${change.realm}/users/${userId}/role-mappings/clients/${clientUuid}`, {
    method: 'DELETE',
    body: JSON.stringify([role]),
  })
}

export async function addClientRole(change: ClientRoleChange): Promise<void> {
  const token = await adminToken()
  const userId = await idOfUser(token, change.realm, change.username)
  const clientUuid = await idOfClient(token, change.realm, change.clientId)
  const role = await roleRepresentation(token, change.realm, clientUuid, change.role)
  await admin(token, `/${change.realm}/users/${userId}/role-mappings/clients/${clientUuid}`, {
    method: 'POST',
    body: JSON.stringify([role]),
  })
}

export async function clientRolesOf(change: Omit<ClientRoleChange, 'role'>): Promise<string[]> {
  const token = await adminToken()
  const userId = await idOfUser(token, change.realm, change.username)
  const clientUuid = await idOfClient(token, change.realm, change.clientId)
  const roles = (await (
    await admin(token, `/${change.realm}/users/${userId}/role-mappings/clients/${clientUuid}`)
  ).json()) as Array<{ name: string }>
  return roles.map((role) => role.name).sort()
}

/** Add an RSA signing key with a higher priority, so new tokens use a `kid` nobody has seen. */
export async function rotateSigningKey(realm: string, name: string): Promise<string> {
  const token = await adminToken()
  const realmRepresentation = (await (await admin(token, `/${realm}`)).json()) as { id: string }
  const response = await admin(token, `/${realm}/components`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      providerId: 'rsa-generated',
      providerType: 'org.keycloak.keys.KeyProvider',
      parentId: realmRepresentation.id,
      config: {
        priority: ['200'],
        enabled: ['true'],
        active: ['true'],
        algorithm: ['RS256'],
        keySize: ['2048'],
      },
    }),
  })
  const location = response.headers.get('location')
  if (!location) throw new Error('Keycloak did not return the new component id')
  return location.slice(location.lastIndexOf('/') + 1)
}

export async function removeComponent(realm: string, componentId: string): Promise<void> {
  const token = await adminToken()
  await admin(token, `/${realm}/components/${componentId}`, { method: 'DELETE' })
}

/** The `kid`s the realm currently publishes for signing (`use: "sig"`). */
export async function signingKids(realm: string): Promise<string[]> {
  const response = await fetch(`${issuerOf(realm)}/protocol/openid-connect/certs`)
  const jwks = (await response.json()) as {
    keys: Array<{ kid: string; use?: string; alg?: string }>
  }
  return jwks.keys.filter((key) => key.use === 'sig').map((key) => key.kid)
}

// ------------------------------------------------- a sign-in, end to end ----

/** Complete a platform sign-in against the real Keycloak and return the session cookie. */
export async function signInThroughPlatform(
  app: {
    inject: (
      options: Record<string, unknown>,
    ) => Promise<{ statusCode: number; headers: unknown; body: string }>
  },
  options: { tenant: string; username: string; browser?: FakeBrowser },
): Promise<{ sessionId: string; status: number }> {
  const login = await app.inject({ method: 'GET', url: `/auth/login?tenant=${options.tenant}` })
  const flowCookie = cookieFromReply(login.headers as Record<string, unknown>, 'acme_auth_flow')
  if (!flowCookie) throw new Error(`no flow cookie: ${login.statusCode} ${login.body}`)
  const browser =
    options.browser ?? newBrowser(options.username, stackEnv().KEYCLOAK_SEED_PASSWORD as string)
  const { callbackUrl } = await browser.authorize(
    (login.headers as Record<string, string>).location as string,
  )
  if (!callbackUrl) throw new Error('the IdP did not send the browser back')
  const reply = await app.inject({
    method: 'GET',
    url: callbackPathOf(callbackUrl),
    cookies: { acme_auth_flow: flowCookie },
  })
  const sessionId = cookieFromReply(reply.headers as Record<string, unknown>, 'acme_session')
  if (!sessionId) throw new Error(`no session cookie: ${reply.statusCode} ${reply.body}`)
  return { sessionId, status: reply.statusCode }
}
