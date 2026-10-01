/**
 * Test helpers: a database of this test file's own, on the Compose stack (mongodb on 18417).
 * Nothing here touches the databases the running demo uses.
 */

import { type Db, MongoClient } from 'mongodb'
import { type Collections, collectionsOf, ensureIndexes } from '../src/db.ts'

export const TEST_MONGO_URL = process.env.MONGO_URL ?? 'mongodb://127.0.0.1:18417'

export type TestStore = Collections & {
  db: Db
  close(): Promise<void>
  dropDatabase(): Promise<void>
}

export async function openTestStore(name: string): Promise<TestStore> {
  // minPoolSize so that concurrent requests are genuinely concurrent: with a cold pool the
  // driver opens one connection and queues the rest, which would hide the race of FR-010.
  const client = new MongoClient(TEST_MONGO_URL, {
    serverSelectionTimeoutMS: 10_000,
    minPoolSize: 8,
  })
  await client.connect()
  const db = client.db(`acme_tasks_test_${name}`)
  await db.dropDatabase()
  await ensureIndexes(db)
  return {
    ...collectionsOf(db),
    db,
    dropDatabase: () => db.dropDatabase().then(() => undefined),
    close: async () => {
      await db.dropDatabase()
      await client.close()
    },
  }
}
