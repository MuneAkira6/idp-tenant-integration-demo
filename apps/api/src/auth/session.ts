/**
 * The application's own session — the single exit of every way in (constitution VI, FR-002, FR-003).
 *
 * Whether the user came through the platform or through the password form, what is left afterwards is
 * one document in `sessions` and one opaque cookie. The platform's tokens are in that document as
 * ciphertext (research R-5); nothing downstream reads `kind`, and no response carries a platform
 * token.
 */

import { randomBytes } from 'node:crypto'
import type { ApplicationRole } from '@acme/contracts'
import { type Clock, DAY_MS } from '../clock.ts'
import type { Collections, SessionDoc } from '../db.ts'
import { decryptToken, encryptToken } from './crypto.ts'

export const SESSION_LIFETIME_MS = 7 * DAY_MS

/** 32 random bytes, base64url: an identifier, not a container. The browser learns nothing from it. */
export function newSessionId(): string {
  return randomBytes(32).toString('base64url')
}

export type PlatformTokens = {
  issuer: string
  sid?: string
  accessToken: string
  refreshToken: string
  accessExpiresAt: Date
}

export async function createPlatformSession(
  collections: Collections,
  clock: Clock,
  encryptionKey: Buffer,
  input: { tenantId: string; userId: string; tokens: PlatformTokens },
): Promise<SessionDoc> {
  const now = clock.now()
  const session: SessionDoc = {
    _id: newSessionId(),
    tenantId: input.tenantId,
    userId: input.userId,
    kind: 'platform',
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
    platform: {
      issuer: input.tokens.issuer,
      ...(input.tokens.sid ? { sid: input.tokens.sid } : {}),
      accessTokenEnc: encryptToken(encryptionKey, input.tokens.accessToken),
      refreshTokenEnc: encryptToken(encryptionKey, input.tokens.refreshToken),
      accessExpiresAt: input.tokens.accessExpiresAt,
    },
  }
  await collections.sessions.insertOne(session)
  return session
}

/** What a route may know about the caller. There is deliberately no way to reach `kind` from here. */
export type Principal = {
  tenantId: string
  userId: string
  roles: ApplicationRole[]
  /** for stage 2 of the loop guard, which the web client reads from `GET /auth/session` (FR-028) */
  sessionCreatedAt: Date
}

export async function readSession(
  collections: Collections,
  clock: Clock,
  sessionId: string | undefined,
): Promise<SessionDoc | null> {
  if (!sessionId) return null
  const session = await collections.sessions.findOne({ _id: sessionId })
  if (!session) return null
  // The TTL index removes expired sessions, but MongoDB sweeps only once a minute: check as well.
  if (session.expiresAt.getTime() <= clock.now().getTime()) return null
  return session
}

export async function deleteSession(collections: Collections, sessionId: string): Promise<void> {
  await collections.sessions.deleteOne({ _id: sessionId })
}

/** Read a stored platform token back. Only the refresh path and logout call this. */
export function platformTokenOf(
  session: SessionDoc,
  encryptionKey: Buffer,
  which: 'accessTokenEnc' | 'refreshTokenEnc',
): string | null {
  const stored = session.platform?.[which]
  return stored ? decryptToken(encryptionKey, stored) : null
}
