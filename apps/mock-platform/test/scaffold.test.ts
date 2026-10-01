/**
 * The mock platform's G0 scaffold: the subscription API and the test controls (T010,
 * contracts/platform.md).
 */

import { CONTROL_ROUTES } from '@acme/contracts'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { buildMockPlatform } from '../src/server.ts'

const { app, state } = buildMockPlatform()

afterAll(async () => {
  await app.close()
})

beforeEach(async () => {
  await app.inject({ method: 'POST', url: CONTROL_ROUTES.reset })
})

describe('the subscription API', () => {
  it('upserts a subscription per event type and lists them', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/subscriptions/tenant.created',
      payload: { callbackUrl: 'http://localhost:18400/webhooks/platform' },
    })
    expect(put.statusCode).toBe(200)
    expect(put.json()).toMatchObject({
      eventType: 'tenant.created',
      callbackUrl: 'http://localhost:18400/webhooks/platform',
    })

    await app.inject({
      method: 'PUT',
      url: '/subscriptions/tenant.deleted',
      payload: { callbackUrl: 'http://localhost:18400/webhooks/platform' },
    })
    const list = await app.inject({ method: 'GET', url: '/subscriptions' })
    expect(list.json().subscriptions.map((s: { eventType: string }) => s.eventType)).toEqual([
      'tenant.created',
      'tenant.deleted',
    ])
  })

  it('upserting the same event type twice leaves one subscription', async () => {
    for (const url of [
      'http://localhost:18400/webhooks/platform',
      'http://localhost:18499/other',
    ]) {
      await app.inject({
        method: 'PUT',
        url: '/subscriptions/tenant.created',
        payload: { callbackUrl: url },
      })
    }
    const list = await app.inject({ method: 'GET', url: '/subscriptions' })
    expect(list.json().subscriptions).toHaveLength(1)
    expect(list.json().subscriptions[0].callbackUrl).toBe('http://localhost:18499/other')
  })

  it('refuses an unknown event type and a missing callback URL', async () => {
    const unknown = await app.inject({
      method: 'PUT',
      url: '/subscriptions/tenant.exploded',
      payload: { callbackUrl: 'http://localhost:18400/webhooks/platform' },
    })
    expect(unknown.statusCode).toBe(400)
    const missing = await app.inject({
      method: 'PUT',
      url: '/subscriptions/tenant.created',
      payload: {},
    })
    expect(missing.statusCode).toBe(400)
  })
})

describe('the test controls', () => {
  it('sets the tenant API mode, for the two lookup failures of FR-021', async () => {
    for (const mode of ['refuse', 'unreachable', 'normal']) {
      const response = await app.inject({
        method: 'POST',
        url: CONTROL_ROUTES.tenantApi,
        payload: { mode },
      })
      expect(response.statusCode).toBe(200)
      expect(state.tenantApiMode).toBe(mode)
    }
  })

  it('sets the device API mode and which page fails (SC-006)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: CONTROL_ROUTES.deviceApi,
      payload: { mode: 'fail-on-page', page: 2 },
    })
    expect(response.statusCode).toBe(200)
    expect(state.deviceApiMode).toBe('fail-on-page')
    expect(state.deviceApiFailPage).toBe(2)
  })

  it('refuses a mode the contract does not name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: CONTROL_ROUTES.tenantApi,
      payload: { mode: 'explode' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('reports an empty log and resets every mode and subscription', async () => {
    await app.inject({
      method: 'POST',
      url: CONTROL_ROUTES.deviceApi,
      payload: { mode: 'fail-on-page' },
    })
    await app.inject({
      method: 'PUT',
      url: '/subscriptions/tenant.created',
      payload: { callbackUrl: 'http://localhost:18400/webhooks/platform' },
    })
    await app.inject({ method: 'POST', url: CONTROL_ROUTES.reset })
    expect(state.deviceApiMode).toBe('normal')
    expect(state.subscriptions.size).toBe(0)
    const log = await app.inject({ method: 'GET', url: CONTROL_ROUTES.log })
    expect(log.json()).toEqual({ entries: [] })
  })

  it('refuses a delivery with no event type', async () => {
    const response = await app.inject({ method: 'POST', url: CONTROL_ROUTES.deliver, payload: {} })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'bad_request', message: 'eventType is required' })
  })

  it('refuses to re-deliver something it never sent', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `${CONTROL_ROUTES.redeliver}/never-sent`,
    })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'not_found', message: 'no such delivery' })
  })

  it('delivers to nobody when no subscription of that type exists, and says so', async () => {
    const response = await app.inject({
      method: 'POST',
      url: CONTROL_ROUTES.deliver,
      payload: { eventType: 'tenant.created', body: { tenantId: 'tenant-c' } },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().delivered).toEqual([])
    expect(response.json().deliveryId).toMatch(/^[0-9a-f-]{36}$/)
    // Nothing was sent, so nothing is in the log.
    const log = await app.inject({ method: 'GET', url: CONTROL_ROUTES.log })
    expect(log.json()).toEqual({ entries: [] })
  })
})
