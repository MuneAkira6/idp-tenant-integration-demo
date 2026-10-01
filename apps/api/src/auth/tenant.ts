/**
 * The tenant of a signed-in user comes from the signed identity's issuer, and from nothing else
 * (FR-005, T016).
 *
 * The `Host` header is attacker-controlled; `iss` is inside a token the IdP signed. Nothing in this
 * module takes a request, so there is no way for a host name to reach the decision.
 */

import type { Config } from '../config.ts'

/** The tenant named by an issuer, or null when no configured tenant claims it. */
export function tenantFromIssuer(config: Config, issuer: string | undefined): string | null {
  if (!issuer) return null
  return config.tenantByIssuer.get(issuer.replace(/\/$/, '')) ?? null
}
