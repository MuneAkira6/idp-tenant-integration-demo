/**
 * Event subscriptions, registered at start-up from the API's own route table (T035, FR-018,
 * research R-13).
 *
 * The callback URL is not written down anywhere: it is the URL of whichever route carries the
 * webhook tag, collected by Fastify's `onRoute` hook. A hand-maintained list would drift from the
 * routes, which is the failure R-13 names — and it is the same mistake checklist L7 avoids for
 * `/api/*`.
 */

import { EVENT_TYPES } from '@acme/contracts'
import type { Config } from '../config.ts'

export type SubscriptionResult = { eventType: string; callbackUrl: string; status: number }

export async function registerSubscriptions(
  config: Config,
  webhookRoutes: readonly string[],
): Promise<SubscriptionResult[]> {
  const route = webhookRoutes[0]
  if (!route) return []
  const callbackUrl = `${config.api.publicUrl}${route}`

  const results: SubscriptionResult[] = []
  for (const eventType of EVENT_TYPES) {
    try {
      const response = await fetch(
        `${config.platform.baseUrl}/subscriptions/${encodeURIComponent(eventType)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ callbackUrl }),
        },
      )
      results.push({ eventType, callbackUrl, status: response.status })
    } catch {
      // The platform being unreachable at start-up is not a reason not to start (constitution VI).
      results.push({ eventType, callbackUrl, status: 0 })
    }
  }
  return results
}
