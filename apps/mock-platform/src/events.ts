/**
 * The platform sending a signed event (T036, contracts/platform.md, research R-6).
 *
 * The signature is built here from the frozen helpers of `packages/contracts` — `signaturePayload`
 * and `SIGNATURE_PREFIX` — and nowhere is the API's own code imported. The two sides agreeing is the
 * point of freezing the contract, and a test that ran them against a shared implementation would not
 * show it.
 */

import { createHmac, randomUUID } from 'node:crypto'
import type { ControlLogEntry } from '@acme/contracts'
import {
  EVENT_HEADERS,
  SIGNATURE_PREFIX,
  signaturePayload,
  webhookSecretEnvName,
} from '@acme/contracts'
import type { MockState } from './state.ts'

export type DeliverOptions = {
  eventType: string
  body: unknown
  deliveryId?: string
  /** Unix seconds; a test sends an old one to exercise FR-015. */
  timestamp?: number
  /** Sign with this instead of the configured secret, to exercise FR-014. */
  signWith?: string
}

export type SentDelivery = {
  deliveryId: string
  eventType: string
  rawBody: string
  timestamp: number
  signature: string
  signedWithTheRealSecret: boolean
}

export type DeliveryAttempt = { callbackUrl: string; status: number }

export function signatureFor(secret: string, timestamp: number, rawBody: string): string {
  const hmac = createHmac('sha256', secret)
  hmac.update(signaturePayload(String(timestamp), rawBody), 'binary')
  return `${SIGNATURE_PREFIX}${hmac.digest('hex')}`
}

/** Build a delivery without sending it, so a re-delivery can repeat exactly the same bytes. */
export function prepare(
  secrets: Record<string, string | undefined>,
  options: DeliverOptions,
  now: Date,
): SentDelivery {
  const configured = secrets[webhookSecretEnvName(options.eventType)]
  const secret = options.signWith ?? configured ?? ''
  const rawBody = JSON.stringify(options.body ?? null)
  const timestamp = options.timestamp ?? Math.floor(now.getTime() / 1000)
  return {
    deliveryId: options.deliveryId ?? randomUUID(),
    eventType: options.eventType,
    rawBody,
    timestamp,
    signature: signatureFor(secret, timestamp, rawBody),
    signedWithTheRealSecret: options.signWith === undefined && configured !== undefined,
  }
}

export async function send(
  state: MockState,
  delivery: SentDelivery,
  now: Date,
): Promise<DeliveryAttempt[]> {
  const subscription = state.subscriptions.get(delivery.eventType)
  const targets = subscription ? [subscription.callbackUrl] : []
  const attempts: DeliveryAttempt[] = []

  for (const callbackUrl of targets) {
    let status = 0
    try {
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [EVENT_HEADERS.delivery]: delivery.deliveryId,
          [EVENT_HEADERS.event]: delivery.eventType,
          [EVENT_HEADERS.timestamp]: String(delivery.timestamp),
          [EVENT_HEADERS.signature]: delivery.signature,
        },
        body: delivery.rawBody,
      })
      status = response.status
    } catch {
      status = 0
    }
    attempts.push({ callbackUrl, status })
    const entry: ControlLogEntry = {
      at: now.toISOString(),
      deliveryId: delivery.deliveryId,
      eventType: delivery.eventType,
      callbackUrl,
      status,
      signed: delivery.signedWithTheRealSecret,
      timestamp: delivery.timestamp,
    }
    state.log.push(entry)
  }
  return attempts
}
