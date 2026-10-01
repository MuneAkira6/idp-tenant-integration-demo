/** Drop the throwaway database the browser run used, so the stack is left as it was found. */

import { MongoClient } from 'mongodb'

export default async function teardown(): Promise<void> {
  const url = process.env.MONGO_URL ?? 'mongodb://127.0.0.1:18417'
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 10_000 })
  await client.connect()
  await client.db('acme_tasks_test_e2e').dropDatabase()
  await client.close()
}
