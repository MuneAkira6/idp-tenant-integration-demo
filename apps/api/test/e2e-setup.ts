/**
 * Seed the throwaway database the browser run uses: the `local` tenant with its password users, and
 * the integrated tenants named by `PLATFORM_ISSUERS`. It runs before the servers start.
 */

import { MongoClient } from 'mongodb'
import { systemClock } from '../src/clock.ts'
import { loadConfig } from '../src/config.ts'
import { collectionsOf, ensureIndexes } from '../src/db.ts'
import { seedConfiguredPlatformTenants, seedLocalTenant } from '../src/seed.ts'

export default async function setup(): Promise<void> {
  const config = loadConfig({
    MONGO_URL: process.env.MONGO_URL ?? 'mongodb://127.0.0.1:18417',
    MONGO_DB: 'acme_tasks_test_e2e',
    PLATFORM_ISSUERS: process.env.PLATFORM_ISSUERS ?? '',
  })
  const client = new MongoClient(config.mongo.url, { serverSelectionTimeoutMS: 10_000 })
  await client.connect()
  const db = client.db(config.mongo.database)
  await db.dropDatabase()
  await ensureIndexes(db)
  const collections = collectionsOf(db)
  await seedLocalTenant(collections, process.env.LOCAL_SEED_PASSWORD as string, systemClock().now())
  await seedConfiguredPlatformTenants(collections, config.platformTenants.values())
  await client.close()
}
