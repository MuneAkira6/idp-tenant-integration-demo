/**
 * Playwright 1.62.1 — the pin of fact F6; 1.63.0 refuses this host. The browsers live in the
 * directory `PLAYWRIGHT_BROWSERS_PATH` names and are never installed anywhere else, and
 * `--with-deps` is never used.
 *
 * The API is started here with the integration configured and its own throwaway database
 * (`acme_tasks_test_e2e`, dropped by the teardown), so a browser run never touches the `acme_tasks`
 * database that holds the `local` baseline.
 */

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

function stackEnv(): Record<string, string> {
  const path = process.env.ACME_IDP_ENV_FILE ?? join(tmpdir(), 'acme-idp-demo.env')
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const at = line.indexOf('=')
    if (at > 0) out[line.slice(0, at)] = line.slice(at + 1)
  }
  return out
}

const secrets = stackEnv()
const keycloak = secrets.KEYCLOAK_BASE_URL ?? 'http://localhost:18480'

// The environment the seeding step of `globalSetup` reads; the API gets its own copy below.
process.env.PLATFORM_ISSUERS = `tenant-a=${keycloak}/realms/tenant-a,tenant-b=${keycloak}/realms/tenant-b`
process.env.LOCAL_SEED_PASSWORD = secrets.LOCAL_SEED_PASSWORD ?? ''
process.env.MONGO_URL = secrets.MONGO_URL ?? 'mongodb://127.0.0.1:18417'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  globalSetup: './apps/api/test/e2e-setup.ts',
  globalTeardown: './apps/api/test/e2e-teardown.ts',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:18401',
    trace: 'off',
  },
  projects: [{ name: 'chromium' }],
  webServer: [
    {
      command: 'node apps/api/src/server.ts',
      url: 'http://localhost:18400/auth/session',
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        API_PORT: '18400',
        API_PUBLIC_URL: 'http://localhost:18400',
        WEB_BASE_URL: 'http://localhost:18401',
        MONGO_URL: secrets.MONGO_URL ?? 'mongodb://127.0.0.1:18417',
        MONGO_DB: 'acme_tasks_test_e2e',
        PLATFORM_ISSUERS: `tenant-a=${keycloak}/realms/tenant-a,tenant-b=${keycloak}/realms/tenant-b`,
        PLATFORM_CLIENTS: `tenant-a=acme-tasks:${secrets.ACME_TASKS_SECRET_TENANT_A},tenant-b=acme-tasks:${secrets.ACME_TASKS_SECRET_TENANT_B}`,
        PLATFORM_AUDIENCE: 'acme-tasks-api',
        TOKEN_ENC_KEY: randomBytes(32).toString('base64'),
        KEYCLOAK_SEED_PASSWORD: secrets.KEYCLOAK_SEED_PASSWORD ?? '',
        LOCAL_SEED_PASSWORD: secrets.LOCAL_SEED_PASSWORD ?? '',
      },
    },
    {
      // The web client, with `/auth/*` and `/api/*` proxied to the API (apps/web/rsbuild.config.ts).
      command: 'pnpm --filter @acme/web dev',
      url: 'http://localhost:18401/',
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { WEB_PORT: '18401', API_BASE_URL: 'http://localhost:18400' },
    },
  ],
})
