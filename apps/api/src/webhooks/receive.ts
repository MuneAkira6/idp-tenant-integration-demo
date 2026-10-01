/**
 * The platform event entry point (T033; FR-014 to FR-016, FR-029; research R-6 and R-7).
 *
 * The order is the order of the guards, and each one is asked before anything it protects:
 *
 *   1. is a secret configured for this event type?      no -> 401 `not_configured`  (FR-029)
 *   2. does the signature match the **raw bytes**?      no -> 401 `bad_signature`   (FR-014)
 *   3. is the timestamp within 300 s of our clock?      no -> 401 `stale_timestamp` (FR-015)
 *   4. store under the delivery id, then answer 200                                 (FR-016)
 *   5. process afterwards, never before the answer                                  (FR-016, L8)
 *
 * The signature is verified before the timestamp on purpose: the timestamp is part of what is signed,
 * so until the signature matches there is no reason to believe the timestamp either.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  API_ERRORS,
  DELIVERY_RETENTION_DAYS,
  EVENT_HEADERS,
  SIGNATURE_PREFIX,
  signaturePayload,
  TIMESTAMP_WINDOW_SECONDS,
} from '@acme/contracts'
import { MongoServerError } from 'mongodb'
import { type Clock, DAY_MS } from '../clock.ts'
import { type Config, webhookSecretFor } from '../config.ts'
import type { Collections, DeliveryDoc } from '../db.ts'

const DUPLICATE_KEY = 11000

export type ReceiveControls = {
  /** AC-18's control: take the signature check away and see a forged event applied. */
  skipSignatureCheck?: boolean
  /** AC-18's control: make the timestamp window unlimited and see a stale event applied. */
  unlimitedTimestampWindow?: boolean
  /** AC-23's control: take the FR-029 guard away and see how far a delivery then gets. */
  skipNotConfiguredGuard?: boolean
}

export type ReceiveDeps = {
  config: Config
  collections: Collections
  clock: Clock
  testControls?: ReceiveControls
}

export type ReceiveResult =
  | {
      status: 200
      deliveryId: string
      stored: boolean
      body: { received: true; deliveryId: string }
    }
  | { status: 401; error: string; message: string }

export type RawDelivery = {
  headers: Record<string, string | string[] | undefined>
  rawBody: Buffer
}

const header = (headers: RawDelivery['headers'], name: string): string | undefined => {
  const value = headers[name]
  return Array.isArray(value) ? value[0] : value
}

/** `sha256=<hex>` over `${timestamp}.${raw body}`, compared in constant time (FR-014). */
export function signDelivery(secret: string, timestamp: string, rawBody: Buffer): string {
  const hmac = createHmac('sha256', secret)
  hmac.update(signaturePayload(timestamp, rawBody.toString('binary')), 'binary')
  return `${SIGNATURE_PREFIX}${hmac.digest('hex')}`
}

function signatureMatches(expected: string, presented: string | undefined): boolean {
  if (!presented) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(presented)
  // timingSafeEqual needs equal lengths; compare the lengths first, which leaks only the length.
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function receiveEvent(
  deps: ReceiveDeps,
  delivery: RawDelivery,
): Promise<ReceiveResult> {
  const { config, collections, clock } = deps
  const controls = deps.testControls
  const eventType = header(delivery.headers, EVENT_HEADERS.event)
  const secret = eventType ? webhookSecretFor(config, eventType) : null

  // 1. FR-029, first and before anything else.
  if (!controls?.skipNotConfiguredGuard && (!eventType || !secret)) {
    return {
      status: 401,
      error: API_ERRORS.notConfigured,
      message: `no signing secret is configured for event type ${eventType ?? '(none given)'}`,
    }
  }

  const timestamp = header(delivery.headers, EVENT_HEADERS.timestamp)
  const presented = header(delivery.headers, EVENT_HEADERS.signature)
  const deliveryId = header(delivery.headers, EVENT_HEADERS.delivery)

  // 2. FR-014, over the bytes as they arrived — never over a re-serialisation of the parsed body.
  if (!controls?.skipSignatureCheck) {
    const expected = secret && timestamp ? signDelivery(secret, timestamp, delivery.rawBody) : null
    if (!expected || !signatureMatches(expected, presented)) {
      return {
        status: 401,
        error: API_ERRORS.badSignature,
        message: 'the signature does not match the body that was sent',
      }
    }
  }

  // 3. FR-015.
  const sentAt = Number.parseInt(timestamp ?? '', 10)
  if (!controls?.unlimitedTimestampWindow) {
    const skew = Math.abs(clock.now().getTime() / 1000 - sentAt)
    if (!Number.isFinite(sentAt) || skew > TIMESTAMP_WINDOW_SECONDS) {
      return {
        status: 401,
        error: API_ERRORS.staleTimestamp,
        message: `the delivery's timestamp is ${Math.round(skew)} s from this clock, more than ${TIMESTAMP_WINDOW_SECONDS}`,
      }
    }
  }

  if (!deliveryId) {
    return { status: 401, error: API_ERRORS.badRequest, message: 'the delivery carries no id' }
  }

  // 4. Store under the delivery id, before answering. Its uniqueness is the idempotency (R-7).
  const receivedAt = clock.now()
  const document: DeliveryDoc = {
    _id: deliveryId,
    eventType: eventType as string,
    body: JSON.parse(delivery.rawBody.toString('utf8') || 'null') as unknown,
    receivedAt,
    expiresAt: new Date(receivedAt.getTime() + DELIVERY_RETENTION_DAYS * DAY_MS),
  }

  try {
    await collections.deliveries.insertOne(document)
    return { status: 200, deliveryId, stored: true, body: { received: true, deliveryId } }
  } catch (error) {
    if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) {
      // A repeated delivery id is acknowledged and has no second effect (FR-016).
      return { status: 200, deliveryId, stored: false, body: { received: true, deliveryId } }
    }
    throw error
  }
}
