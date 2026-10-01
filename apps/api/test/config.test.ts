/**
 * Every setting of data-model.md ("Configuration defaults") has its default, and each default fails
 * closed (checklist L2, constitution VI).
 */

import { describe, expect, it } from 'vitest'
import { DAY_MS, HOUR_MS } from '../src/clock.ts'
import {
  bearerAvailable,
  devicePullAvailable,
  loadConfig,
  platformSignInAvailable,
  webhookSecretFor,
} from '../src/config.ts'

/** An environment with nothing configured at all — quickstart Q15. */
const EMPTY: NodeJS.ProcessEnv = {}

const CONFIGURED: NodeJS.ProcessEnv = {
  PLATFORM_ISSUERS:
    'tenant-a=http://localhost:18480/realms/tenant-a,tenant-b=http://localhost:18480/realms/tenant-b',
  PLATFORM_CLIENTS: 'tenant-a=acme-tasks:s3cr3t-a,tenant-b=acme-tasks:s3cr3t-b',
  PLATFORM_AUDIENCE: 'acme-tasks-api',
  TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
  WEBHOOK_SECRET_TENANT_CREATED: 'whsec-created',
  WEBHOOK_SECRET_TENANT_DELETED: 'whsec-deleted',
  DEVICE_PULL_ENABLED: 'true',
}

describe('configuration defaults (data-model.md, Configuration defaults)', () => {
  it('PLATFORM_ISSUERS defaults to empty: every platform token is refused and sign-in is unavailable', () => {
    const config = loadConfig(EMPTY)
    expect(config.platformTenants.size).toBe(0)
    expect(config.tenantByIssuer.size).toBe(0)
    expect(bearerAvailable(config)).toBe(false)
    expect(platformSignInAvailable(config, 'tenant-a')).toBe(false)
  })

  it('WEBHOOK_SECRET_<EVENT> defaults to empty: every event of that type is refused', () => {
    const config = loadConfig(EMPTY)
    expect(config.webhookSecrets.size).toBe(0)
    expect(webhookSecretFor(config, 'tenant.created')).toBeNull()
    expect(webhookSecretFor(config, 'tenant.deleted')).toBeNull()
  })

  it('DEVICE_PULL_ENABLED defaults to false: no device pull runs', () => {
    expect(devicePullAvailable(loadConfig(EMPTY))).toBe(false)
  })

  it('TOKEN_ENC_KEY defaults to none: the platform sign-in path stays closed, with the reason', () => {
    const config = loadConfig(EMPTY)
    expect(config.tokenEncryptionKey).toBeNull()
    expect(config.tokenEncryptionKeyError).toBe('TOKEN_ENC_KEY is not set')
  })

  it('anything but the exact string `true` leaves the device pull off', () => {
    for (const value of ['', 'false', 'TRUE ', '1', 'yes', 'on']) {
      expect(devicePullAvailable(loadConfig({ DEVICE_PULL_ENABLED: value }))).toBe(false)
    }
    expect(devicePullAvailable(loadConfig({ DEVICE_PULL_ENABLED: 'true' }))).toBe(true)
    expect(devicePullAvailable(loadConfig({ DEVICE_PULL_ENABLED: 'True' }))).toBe(true)
  })

  it('a TOKEN_ENC_KEY that is not 32 bytes is refused rather than used short', () => {
    const config = loadConfig({ TOKEN_ENC_KEY: Buffer.alloc(16, 1).toString('base64') })
    expect(config.tokenEncryptionKey).toBeNull()
    expect(config.tokenEncryptionKeyError).toBe('TOKEN_ENC_KEY must decode to 32 bytes, got 16')
  })

  it('an issuer without a client cannot start a sign-in, but its tokens are still verifiable', () => {
    const config = loadConfig({
      PLATFORM_ISSUERS: 'tenant-a=http://localhost:18480/realms/tenant-a',
      PLATFORM_AUDIENCE: 'acme-tasks-api',
      TOKEN_ENC_KEY: CONFIGURED.TOKEN_ENC_KEY as string,
    })
    expect(bearerAvailable(config)).toBe(true)
    expect(platformSignInAvailable(config, 'tenant-a')).toBe(false)
  })

  it('a configured environment opens exactly the paths it configures', () => {
    const config = loadConfig(CONFIGURED)
    expect([...config.platformTenants.keys()]).toEqual(['tenant-a', 'tenant-b'])
    expect(config.tenantByIssuer.get('http://localhost:18480/realms/tenant-a')).toBe('tenant-a')
    expect(config.platformTenants.get('tenant-a')?.clientId).toBe('acme-tasks')
    expect(bearerAvailable(config)).toBe(true)
    expect(platformSignInAvailable(config, 'tenant-a')).toBe(true)
    expect(platformSignInAvailable(config, 'local')).toBe(false)
    expect(webhookSecretFor(config, 'tenant.created')).toBe('whsec-created')
    expect(devicePullAvailable(config)).toBe(true)
  })

  it('a trailing slash on an issuer does not make it a different issuer', () => {
    const config = loadConfig({
      PLATFORM_ISSUERS: 'tenant-a=http://localhost:18480/realms/tenant-a/',
    })
    expect(config.platformTenants.get('tenant-a')?.issuer).toBe(
      'http://localhost:18480/realms/tenant-a',
    )
  })

  it('the scheduled intervals are the real ones (FR-032)', () => {
    const { intervals } = loadConfig(EMPTY)
    expect(intervals.sweepMs).toBe(HOUR_MS)
    expect(intervals.lookupRetryMs).toBe(HOUR_MS)
    expect(intervals.devicePullMs).toBe(HOUR_MS)
    expect(intervals.expiryMs).toBe(30 * DAY_MS)
  })
})
