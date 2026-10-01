/**
 * The existing password sign-in of Acme Tasks — the behaviour a tenant that is not integrated keeps
 * unchanged (FR-031). G0 seeds `local` and proves this path; G1 puts `POST /auth/password` in front of
 * it and must not change what happens here.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { Clock } from '../clock.ts'
import { DAY_MS } from '../clock.ts'
import type { Collections, SessionDoc } from '../db.ts'

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEY_LENGTH = 32
const SESSION_LIFETIME_MS = 7 * DAY_MS

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** The opaque session id the browser receives; never a JWT (FR-003). */
export function newSessionId(): string {
  return randomBytes(32).toString('base64url')
}

export type PasswordSignInResult =
  | { ok: true; sessionId: string; userId: string; tenantId: string }
  | {
      ok: false
      reason: 'unknown_tenant' | 'not_integrated_only' | 'tenant_deleted' | 'invalid_credentials'
    }

/**
 * Sign in with a password. Only a tenant that is not integrated has password users: for an integrated
 * tenant the platform owns them, so this path refuses even with the right password.
 */
export async function signInWithPassword(
  collections: Collections,
  clock: Clock,
  input: { tenant: string; email: string; password: string },
): Promise<PasswordSignInResult> {
  const tenant = await collections.tenants.findOne({ _id: input.tenant })
  if (!tenant) return { ok: false, reason: 'unknown_tenant' }
  if (tenant.state === 'deleted') return { ok: false, reason: 'tenant_deleted' }
  if (tenant.integrated) return { ok: false, reason: 'not_integrated_only' }

  const user = await collections.users.findOne({ tenantId: input.tenant, email: input.email })
  if (!user?.passwordHash) return { ok: false, reason: 'invalid_credentials' }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    return { ok: false, reason: 'invalid_credentials' }
  }

  const now = clock.now()
  const session: SessionDoc = {
    _id: newSessionId(),
    tenantId: tenant._id,
    userId: String(user._id),
    kind: 'password',
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
  }
  await collections.sessions.insertOne(session)
  return { ok: true, sessionId: session._id, userId: session.userId, tenantId: session.tenantId }
}
