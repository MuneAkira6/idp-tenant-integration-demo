/**
 * Building a signed delivery in a test, with the mock platform's own signing function — the one that
 * imports only from `packages/contracts`.
 */

import { EVENT_HEADERS } from '@acme/contracts'
import { signatureFor } from '../../mock-platform/src/events.ts'

export const WEBHOOK_SECRETS = {
  WEBHOOK_SECRET_TENANT_CREATED: 'created-secret-of-this-test-run',
  WEBHOOK_SECRET_TENANT_DELETED: 'deleted-secret-of-this-test-run',
}

const SECRET_OF: Record<string, string> = {
  'tenant.created': WEBHOOK_SECRETS.WEBHOOK_SECRET_TENANT_CREATED,
  'tenant.deleted': WEBHOOK_SECRETS.WEBHOOK_SECRET_TENANT_DELETED,
}

export type SignedDelivery = { headers: Record<string, string>; payload: string }

export function signedDelivery(input: {
  deliveryId: string
  eventType: 'tenant.created' | 'tenant.deleted'
  body: unknown
  at?: Date
}): SignedDelivery {
  const payload = JSON.stringify(input.body)
  const timestamp = Math.floor((input.at ?? new Date()).getTime() / 1000)
  return {
    headers: {
      'content-type': 'application/json',
      [EVENT_HEADERS.delivery]: input.deliveryId,
      [EVENT_HEADERS.event]: input.eventType,
      [EVENT_HEADERS.timestamp]: String(timestamp),
      [EVENT_HEADERS.signature]: signatureFor(
        SECRET_OF[input.eventType] as string,
        timestamp,
        payload,
      ),
    },
    payload,
  }
}
