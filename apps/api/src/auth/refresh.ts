/**
 * What a failed refresh does to the application session (FR-004, T017).
 *
 * The whole point of this module is that the two failures are **different branches with different
 * outcomes**. A platform that answers "no" has told us about the user, so the session ends. A
 * platform that cannot be reached has told us nothing, so the session survives and a retry is
 * scheduled. Treating them alike ends one of the two cases wrongly — which is what the control of
 * AC-4 shows, by passing a `classify` that always says `refused`.
 */

import type { Clock } from '../clock.ts'
import type { Config } from '../config.ts'
import type { Collections, SessionDoc } from '../db.ts'
import { encryptToken } from './crypto.ts'
import {
  classifyRefreshFailure,
  type RefreshFailureKind,
  refreshPlatformTokens,
} from './platform.ts'
import { deleteSession, platformTokenOf } from './session.ts'

export type RefreshResult =
  | { outcome: 'refreshed' }
  | { outcome: 'ended'; reason: 'refused' | 'no_platform_session' }
  | { outcome: 'kept'; retryAt: Date }

export type RefreshDeps = {
  config: Config
  collections: Collections
  clock: Clock
  /** Injectable for the control only; production always uses `classifyRefreshFailure`. */
  classify?: (error: unknown) => RefreshFailureKind
}

export async function refreshSession(
  deps: RefreshDeps,
  session: SessionDoc,
): Promise<RefreshResult> {
  const { config, collections, clock } = deps
  const key = config.tokenEncryptionKey
  const tenant = config.platformTenants.get(session.tenantId)
  const refreshToken =
    session.platform && key ? platformTokenOf(session, key, 'refreshTokenEnc') : null

  if (!key || !tenant || !refreshToken) {
    await deleteSession(collections, session._id)
    return { outcome: 'ended', reason: 'no_platform_session' }
  }

  const now = clock.now()
  const result = await refreshPlatformTokens(
    tenant,
    refreshToken,
    now,
    deps.classify ?? classifyRefreshFailure,
  )

  if (result.kind === 'refreshed') {
    await collections.sessions.updateOne(
      { _id: session._id },
      {
        $set: {
          'platform.accessTokenEnc': encryptToken(key, result.tokens.accessToken),
          'platform.refreshTokenEnc': encryptToken(key, result.tokens.refreshToken),
          'platform.accessExpiresAt': result.tokens.accessExpiresAt,
        },
        $unset: { refreshRetryAt: '' },
      },
    )
    return { outcome: 'refreshed' }
  }

  if (result.kind === 'refused') {
    // The platform explicitly said no: end the application session too (FR-004).
    await deleteSession(collections, session._id)
    return { outcome: 'ended', reason: 'refused' }
  }

  // Unreachable: keep the session and try again later. Nothing about the user has changed.
  const retryAt = new Date(now.getTime() + config.intervals.lookupRetryMs)
  await collections.sessions.updateOne({ _id: session._id }, { $set: { refreshRetryAt: retryAt } })
  return { outcome: 'kept', retryAt }
}
