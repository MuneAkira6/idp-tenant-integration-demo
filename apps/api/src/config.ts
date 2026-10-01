/**
 * Configuration, with the fail-closed defaults of data-model.md ("Configuration defaults").
 *
 * Constitution VI: every integration path is off until it is configured. Nothing here throws when a
 * setting is missing — it reports the path as unavailable, and the path refuses. The one exception is
 * an ill-formed value: a `TOKEN_ENC_KEY` that is not 32 bytes is a misconfiguration, not an absence,
 * and is reported so that the path stays closed rather than encrypting with a short key.
 */

import { DELIVERY_RETENTION_DAYS, webhookSecretEnvName } from '@acme/contracts'
import { DAY_MS, HOUR_MS } from './clock.ts'

export type PlatformTenantConfig = {
  tenantId: string
  issuer: string
  clientId?: string
  clientSecret?: string
}

export type Config = {
  api: { port: number; publicUrl: string }
  /** Where a completed sign-in lands; the pages themselves are the web client's (G5, T050). */
  web: { baseUrl: string }
  mongo: { url: string; database: string }

  /** tenantId -> issuer. Empty when PLATFORM_ISSUERS is unset: every platform token is refused. */
  platformTenants: Map<string, PlatformTenantConfig>
  /** issuer -> tenantId, the direction FR-005 needs. */
  tenantByIssuer: Map<string, string>
  /** The audience every platform token must carry (FR-008); empty means "not configured". */
  platformAudience: string
  /** 32 bytes for AES-256-GCM, or null when TOKEN_ENC_KEY is unset (FR-003, fails closed). */
  tokenEncryptionKey: Buffer | null
  /** Why the token key is unusable, when it is set but wrong. */
  tokenEncryptionKeyError: string | null

  /**
   * `WEBHOOK_SECRET_<EVENT>` -> the secret, keyed by the environment variable's own name. Keyed that
   * way because a secret may be configured for an event type the application does not handle: such a
   * delivery is accepted and stored as `ignored` (contracts/api.md), which a map keyed by the known
   * types could not express. A type with no entry here is refused (FR-029).
   */
  webhookSecrets: Map<string, string>

  devicePull: { enabled: boolean; pageSize: number }

  platform: {
    baseUrl: string
    syncIssuer: string
    syncClientId: string
    syncClientSecret: string
  }

  /** The real intervals of FR-032. Tests advance the clock instead of waiting. */
  intervals: { sweepMs: number; lookupRetryMs: number; devicePullMs: number; expiryMs: number }
}

function text(env: NodeJS.ProcessEnv, name: string, fallback = ''): string {
  const value = env[name]
  return value === undefined || value === '' ? fallback : value
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const parsed = Number.parseInt(text(env, name), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** Default off: only the exact string `true` switches a flag on (FR-025, FR-030). */
function flag(env: NodeJS.ProcessEnv, name: string): boolean {
  return text(env, name).toLowerCase() === 'true'
}

/** `PLATFORM_ISSUERS=tenant-a=http://...,tenant-b=http://...` — empty by default. */
function parsePairs(value: string): Array<[string, string]> {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const at = entry.indexOf('=')
      if (at < 0) return null
      const key = entry.slice(0, at).trim()
      const rest = entry.slice(at + 1).trim()
      return key && rest ? ([key, rest] as [string, string]) : null
    })
    .filter((pair): pair is [string, string] => pair !== null)
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const platformTenants = new Map<string, PlatformTenantConfig>()
  for (const [tenantId, issuer] of parsePairs(text(env, 'PLATFORM_ISSUERS'))) {
    platformTenants.set(tenantId, { tenantId, issuer: issuer.replace(/\/$/, '') })
  }
  // `PLATFORM_CLIENTS=tenant-a=acme-tasks:<secret>` — a tenant without a client cannot start a sign-in.
  for (const [tenantId, credentials] of parsePairs(text(env, 'PLATFORM_CLIENTS'))) {
    const existing = platformTenants.get(tenantId)
    if (!existing) continue
    const at = credentials.indexOf(':')
    if (at < 0) continue
    existing.clientId = credentials.slice(0, at)
    existing.clientSecret = credentials.slice(at + 1)
  }

  const tenantByIssuer = new Map<string, string>()
  for (const tenant of platformTenants.values()) tenantByIssuer.set(tenant.issuer, tenant.tenantId)

  let tokenEncryptionKey: Buffer | null = null
  let tokenEncryptionKeyError: string | null = null
  const rawKey = text(env, 'TOKEN_ENC_KEY')
  if (rawKey === '') {
    tokenEncryptionKeyError = 'TOKEN_ENC_KEY is not set'
  } else {
    const decoded = Buffer.from(rawKey, 'base64')
    if (decoded.length === 32) tokenEncryptionKey = decoded
    else tokenEncryptionKeyError = `TOKEN_ENC_KEY must decode to 32 bytes, got ${decoded.length}`
  }

  const webhookSecrets = new Map<string, string>()
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith('WEBHOOK_SECRET_') && value) webhookSecrets.set(name, value)
  }

  return {
    api: {
      port: integer(env, 'API_PORT', 18400),
      publicUrl: text(env, 'API_PUBLIC_URL', `http://localhost:${integer(env, 'API_PORT', 18400)}`),
    },
    web: {
      baseUrl: text(env, 'WEB_BASE_URL', `http://localhost:${integer(env, 'WEB_PORT', 18401)}`),
    },
    mongo: {
      url: text(env, 'MONGO_URL', 'mongodb://127.0.0.1:18417'),
      database: text(env, 'MONGO_DB', 'acme_tasks'),
    },
    platformTenants,
    tenantByIssuer,
    platformAudience: text(env, 'PLATFORM_AUDIENCE'),
    tokenEncryptionKey,
    tokenEncryptionKeyError,
    webhookSecrets,
    devicePull: {
      enabled: flag(env, 'DEVICE_PULL_ENABLED'),
      pageSize: integer(env, 'DEVICE_PULL_PAGE_SIZE', 200),
    },
    platform: {
      baseUrl: text(env, 'PLATFORM_API_BASE_URL', 'http://localhost:18402'),
      syncIssuer: text(env, 'PLATFORM_SYNC_ISSUER'),
      syncClientId: text(env, 'PLATFORM_SYNC_CLIENT_ID'),
      syncClientSecret: text(env, 'PLATFORM_SYNC_CLIENT_SECRET'),
    },
    intervals: {
      sweepMs: HOUR_MS,
      lookupRetryMs: HOUR_MS,
      devicePullMs: HOUR_MS,
      expiryMs: DELIVERY_RETENTION_DAYS * DAY_MS,
    },
  }
}

/** Platform sign-in needs an issuer, a client and a usable encryption key (FR-029, FR-003). */
export function platformSignInAvailable(config: Config, tenantId: string): boolean {
  const tenant = config.platformTenants.get(tenantId)
  return Boolean(
    tenant?.issuer && tenant.clientId && tenant.clientSecret && config.tokenEncryptionKey,
  )
}

/** With no issuer configured, every platform token is refused (FR-029). */
export function bearerAvailable(config: Config): boolean {
  return config.platformTenants.size > 0 && config.platformAudience !== ''
}

/** With no secret for the event type, every event of it is refused (FR-029). */
export function webhookSecretFor(config: Config, eventType: string): string | null {
  return config.webhookSecrets.get(webhookSecretEnvName(eventType)) ?? null
}

/** The device pull is off unless DEVICE_PULL_ENABLED is exactly `true` (FR-025, FR-030). */
export function devicePullAvailable(config: Config): boolean {
  return config.devicePull.enabled
}
