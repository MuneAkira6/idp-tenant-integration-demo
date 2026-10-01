/**
 * Users of an integrated tenant, keyed by the platform's `sub` (data-model.md, `users`).
 *
 * First contact creates the user exactly once: the partial unique index of research R-8 decides, and a
 * duplicate key means another request won the race, so the winner is read back (FR-010). The
 * eight-way concurrency test and its control — the same test with the index dropped — are T023 in G2.
 */

import type { ApplicationRole } from '@acme/contracts'
import { MongoServerError } from 'mongodb'
import type { Collections, UserDoc } from './db.ts'

export type FirstContactInput = {
  tenantId: string
  platformSubject: string
  email: string
  name: string
  /**
   * What to store on creation. The sign-in path passes the roles it derived (FR-011); the Bearer
   * path passes the lowest role, because FR-034 forbids writing the roles it derived from a token.
   */
  roles: ApplicationRole[]
}

export type FirstContactResult = { user: UserDoc; created: boolean }

/** The duplicate-key error MongoDB raises when the partial unique index rejects a second insert. */
const DUPLICATE_KEY = 11000

export async function findOrCreatePlatformUser(
  collections: Collections,
  input: FirstContactInput,
  now: Date,
): Promise<FirstContactResult> {
  const key = { tenantId: input.tenantId, platformSubject: input.platformSubject }

  const existing = await collections.users.findOne(key)
  if (existing) return { user: existing, created: false }

  const document: UserDoc = {
    ...key,
    email: input.email,
    name: input.name,
    roles: input.roles,
    rolesWrittenAt: now,
  }

  try {
    const inserted = await collections.users.insertOne(document)
    return { user: { ...document, _id: inserted.insertedId }, created: true }
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== DUPLICATE_KEY) throw error
    // Another request created the same user between the read and the insert: read the winner back.
    const winner = await collections.users.findOne(key)
    if (!winner) throw error
    return { user: winner, created: false }
  }
}
