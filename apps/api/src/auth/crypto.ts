/**
 * AES-256-GCM for the platform tokens kept on the server (FR-003, research R-5).
 *
 * The browser never sees a platform token: it holds an opaque session id, and the tokens live in the
 * session document as ciphertext. The key comes from `TOKEN_ENC_KEY` and nowhere else; without it the
 * sign-in path stays closed (data-model.md, Configuration defaults).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
/** The version tag, so a later key or algorithm change can be told apart from this one. */
const PREFIX = 'v1'

/** `v1.<iv>.<auth tag>.<ciphertext>`, each part base64url. Never a JWT, never the token itself. */
export function encryptToken(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [
    PREFIX,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

export function decryptToken(key: Buffer, encoded: string): string {
  const [prefix, ivB64, tagB64, dataB64] = encoded.split('.')
  if (prefix !== PREFIX || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('ciphertext is not in the v1 format')
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

/** True when a stored value is in this module's format — used by the test that proves FR-003. */
export function looksEncrypted(value: unknown): boolean {
  return typeof value === 'string' && /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/.test(value)
}

/** True when a string is a JWS/JWT: three dot-separated base64url parts starting with a JSON header. */
export function looksLikeJwt(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const parts = value.split('.')
  if (parts.length !== 3 || !parts[0]) return false
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as unknown
    return typeof header === 'object' && header !== null && 'alg' in header
  } catch {
    return false
  }
}
