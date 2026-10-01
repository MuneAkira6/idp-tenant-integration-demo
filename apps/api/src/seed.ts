/**
 * Seed the tenant that is not integrated: `local`, its password users and their tasks (T011).
 *
 * This is the baseline for "nothing changes until it is configured" (FR-031, checklist M4): the same
 * data and the same password sign-in must behave identically after every later goal.
 *
 * Passwords come from the environment (`LOCAL_SEED_PASSWORD`); no password is written into this
 * repository. Run: node apps/api/src/seed.ts
 */

import type { ApplicationRole } from '@acme/contracts'
import { hashPassword } from './auth/password.ts'
import { systemClock } from './clock.ts'
import { loadConfig } from './config.ts'
import { type Collections, connect, type Store } from './db.ts'

export const LOCAL_TENANT_ID = 'local'

export const LOCAL_USERS: Array<{ email: string; name: string; roles: ApplicationRole[] }> = [
  { email: 'lena@local.example', name: 'Lena Lindqvist', roles: ['member'] },
  { email: 'luis@local.example', name: 'Luis Lopes', roles: ['manager'] },
  { email: 'lotte@local.example', name: 'Lotte Larsen', roles: ['admin'] },
]

const LOCAL_TASKS: Record<string, string[]> = {
  'lena@local.example': ['Write the weekly report', 'Review the backlog'],
  'luis@local.example': ['Plan the sprint'],
  'lotte@local.example': ['Approve the budget'],
}

export type SeedResult = { tenants: number; users: number; tasks: number }

/**
 * Idempotent: re-seeding leaves the same documents, so the baseline can be rebuilt between runs.
 * `integrated` is written as `false` explicitly — the default of FR-030, not an absent field.
 */
export async function seedLocalTenant(
  collections: Collections,
  password: string,
  now: Date,
): Promise<SeedResult> {
  await collections.tenants.updateOne(
    { _id: LOCAL_TENANT_ID },
    { $set: { name: 'Local Co', integrated: false, state: 'active' } },
    { upsert: true },
  )

  let users = 0
  let tasks = 0
  for (const seeded of LOCAL_USERS) {
    const passwordHash = await hashPassword(password)
    await collections.users.updateOne(
      { tenantId: LOCAL_TENANT_ID, email: seeded.email },
      {
        $set: { name: seeded.name, roles: seeded.roles, passwordHash },
        $setOnInsert: { rolesWrittenAt: now },
      },
      { upsert: true },
    )
    users += 1

    const user = await collections.users.findOne({ tenantId: LOCAL_TENANT_ID, email: seeded.email })
    const userId = String(user?._id)
    for (const title of LOCAL_TASKS[seeded.email] ?? []) {
      await collections.tasks.updateOne(
        { tenantId: LOCAL_TENANT_ID, userId, title },
        { $set: { done: false }, $setOnInsert: { createdAt: now } },
        { upsert: true },
      )
      tasks += 1
    }
  }

  return { tenants: 1, users, tasks }
}

/**
 * Tenants named by PLATFORM_ISSUERS are integrated. With nothing configured this does nothing at all,
 * which is the default of constitution VI.
 */
export async function seedConfiguredPlatformTenants(
  collections: Collections,
  platformTenants: Iterable<{ tenantId: string; issuer: string }>,
): Promise<number> {
  let count = 0
  for (const tenant of platformTenants) {
    await collections.tenants.updateOne(
      { _id: tenant.tenantId },
      {
        $set: { integrated: true, issuer: tenant.issuer },
        $setOnInsert: { name: tenant.tenantId, state: 'active' },
      },
      { upsert: true },
    )
    count += 1
  }
  return count
}

async function main(): Promise<void> {
  const password = process.env.LOCAL_SEED_PASSWORD
  if (!password) throw new Error('LOCAL_SEED_PASSWORD is not set; scripts/stack.sh up writes it')
  const config = loadConfig()
  const store: Store = await connect(config)
  try {
    const result = await seedLocalTenant(store, password, systemClock().now())
    const integrated = await seedConfiguredPlatformTenants(store, config.platformTenants.values())
    console.log(
      `seeded tenant local: ${result.users} users, ${result.tasks} tasks; ` +
        `${integrated} integrated tenant(s) from PLATFORM_ISSUERS`,
    )
  } finally {
    await store.close()
  }
}

if (process.argv[1]?.endsWith('seed.ts')) await main()
