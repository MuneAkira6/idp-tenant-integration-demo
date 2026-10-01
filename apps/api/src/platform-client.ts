/**
 * The application calling the platform with its own client credentials (research R-9, FR-020).
 *
 * One place tells the two failure kinds apart, because FR-021 rests on the distinction and L9 is
 * about it: `refused` means the platform answered and its answer was no; `unreachable` means it did
 * not answer at all, or answered 5xx, and so has said nothing.
 */

import type { Config } from './config.ts'

export type PlatformFailure = 'refused' | 'unreachable'

export type PlatformResponse<T> =
  | { kind: 'ok'; value: T }
  | { kind: PlatformFailure; status: number; detail: string }

/** The client-credentials token of the `platform` realm's `acme-tasks-sync` client (facts F15). */
export async function platformToken(config: Config): Promise<string | null> {
  const { syncIssuer, syncClientId, syncClientSecret } = config.platform
  if (!syncIssuer || !syncClientId || !syncClientSecret) return null
  try {
    const response = await fetch(`${syncIssuer}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: syncClientId,
        client_secret: syncClientSecret,
      }),
    })
    if (!response.ok) return null
    return ((await response.json()) as { access_token: string }).access_token
  } catch {
    return null
  }
}

/**
 * One request to the platform, classified.
 *
 * A 4xx is an answer: the platform said no. A 5xx or a transport error is not an answer, so it is
 * the same case as the platform being down.
 */
export async function callPlatform<T>(
  config: Config,
  path: string,
  token: string | null,
): Promise<PlatformResponse<T>> {
  if (!token) {
    return {
      kind: 'unreachable',
      status: 0,
      detail: 'no client-credentials token could be obtained',
    }
  }
  let response: Response
  try {
    response = await fetch(`${config.platform.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    })
  } catch (error) {
    return { kind: 'unreachable', status: 0, detail: (error as Error).message }
  }
  if (response.status >= 400 && response.status < 500) {
    return { kind: 'refused', status: response.status, detail: await response.text() }
  }
  if (!response.ok) {
    return { kind: 'unreachable', status: response.status, detail: await response.text() }
  }
  return { kind: 'ok', value: (await response.json()) as T }
}
