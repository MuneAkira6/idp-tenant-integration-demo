/**
 * The platform stand-in (apps/mock-platform, port 18402) — the G0 scaffold: the subscription API and
 * the test controls of contracts/platform.md (T010).
 *
 * Still to come, each in its own task: event delivery, re-delivery and signing (T036, G3), the tenant
 * API with its modes (T042, G4) and the device API with its pagination and failure mode (T047, G4).
 * The control routes those need already exist here, so the shapes are frozen with the rest.
 */

import {
  CONTROL_ROUTES,
  DEVICE_API_MODES,
  DEVICE_PAGE_SIZE,
  type DeviceApiMode,
  EVENT_TYPES,
  PORTS,
  TENANT_API_MODES,
  type TenantApiMode,
} from '@acme/contracts'
import Fastify, { type FastifyInstance } from 'fastify'
import { newPlatformAuth } from './auth.ts'
import { devicePage } from './devices.ts'
import { type DeliverOptions, prepare, send } from './events.ts'
import { type MockState, newState, resetState } from './state.ts'
import { PLATFORM_TENANTS } from './tenants.ts'

export type MockPlatform = { app: FastifyInstance; state: MockState }

export function buildMockPlatform(
  secrets: Record<string, string | undefined> = process.env,
  options: { platformIssuer?: string | null } = {},
): MockPlatform {
  const state = newState()
  const auth = newPlatformAuth(options.platformIssuer ?? secrets.PLATFORM_SYNC_ISSUER ?? null)
  const app = Fastify({ logger: false })

  app.put<{ Params: { eventType: string }; Body: { callbackUrl?: string } }>(
    '/subscriptions/:eventType',
    async (request, reply) => {
      const { eventType } = request.params
      const callbackUrl = request.body?.callbackUrl
      if (!EVENT_TYPES.includes(eventType as (typeof EVENT_TYPES)[number])) {
        return reply
          .code(400)
          .send({ error: 'bad_request', message: `unknown event type ${eventType}` })
      }
      if (!callbackUrl) {
        return reply.code(400).send({ error: 'bad_request', message: 'callbackUrl is required' })
      }
      const subscription = {
        eventType: eventType as (typeof EVENT_TYPES)[number],
        callbackUrl,
        registeredAt: new Date().toISOString(),
      }
      state.subscriptions.set(eventType, subscription)
      return reply.code(200).send(subscription)
    },
  )

  app.get('/subscriptions', async () => ({
    subscriptions: [...state.subscriptions.values()],
  }))

  app.post<{ Body: { mode?: TenantApiMode } }>(CONTROL_ROUTES.tenantApi, async (request, reply) => {
    const mode = request.body?.mode
    if (!mode || !TENANT_API_MODES.includes(mode)) {
      return reply.code(400).send({
        error: 'bad_request',
        message: `mode must be one of ${TENANT_API_MODES.join(', ')}`,
      })
    }
    state.tenantApiMode = mode
    return reply.send({ mode })
  })

  app.post<{ Body: { mode?: DeviceApiMode; page?: number } }>(
    CONTROL_ROUTES.deviceApi,
    async (request, reply) => {
      const mode = request.body?.mode
      if (!mode || !DEVICE_API_MODES.includes(mode)) {
        return reply.code(400).send({
          error: 'bad_request',
          message: `mode must be one of ${DEVICE_API_MODES.join(', ')}`,
        })
      }
      state.deviceApiMode = mode
      if (typeof request.body?.page === 'number') state.deviceApiFailPage = request.body.page
      return reply.send({ mode, page: state.deviceApiFailPage })
    },
  )

  // -------------------------------------------------------- tenant API ----

  app.get<{ Params: { tenantId: string } }>('/tenants/:tenantId', async (request, reply) => {
    const allowed = await auth.verify(request.headers.authorization)
    if (!allowed.ok) {
      return reply
        .code(allowed.status)
        .send({ error: 'unauthorized', message: 'a platform token is required' })
    }
    if (state.tenantApiMode === 'unreachable') {
      // Not an answer: the connection is dropped, so the caller sees a transport failure (FR-021).
      request.raw.destroy()
      return reply
    }
    if (state.tenantApiMode === 'refuse') {
      return reply
        .code(403)
        .send({ error: 'forbidden', message: 'the platform refuses this lookup' })
    }
    const tenant = PLATFORM_TENANTS[request.params.tenantId]
    if (!tenant) return reply.code(404).send({ error: 'not_found', message: 'no such tenant' })
    return reply.send(tenant)
  })

  // -------------------------------------------------------- device API ----

  app.get<{ Params: { tenantId: string }; Querystring: { page?: string; pageSize?: string } }>(
    '/tenants/:tenantId/devices',
    async (request, reply) => {
      const allowed = await auth.verify(request.headers.authorization)
      if (!allowed.ok) {
        return reply
          .code(allowed.status)
          .send({ error: 'unauthorized', message: 'a platform token is required' })
      }
      const page = Number.parseInt(request.query.page ?? '1', 10) || 1
      const pageSize =
        Number.parseInt(request.query.pageSize ?? String(DEVICE_PAGE_SIZE), 10) || DEVICE_PAGE_SIZE
      if (state.deviceApiMode === 'fail-on-page' && page === state.deviceApiFailPage) {
        return reply.code(500).send({ error: 'server_error', message: `page ${page} failed` })
      }
      return reply.send(devicePage(request.params.tenantId, page, pageSize))
    },
  )

  app.get(CONTROL_ROUTES.log, async () => ({ entries: state.log }))

  app.post(CONTROL_ROUTES.reset, async () => {
    resetState(state)
    return { reset: true }
  })

  app.post<{ Body: DeliverOptions }>(CONTROL_ROUTES.deliver, async (request, reply) => {
    const options = request.body
    if (!options?.eventType) {
      return reply.code(400).send({ error: 'bad_request', message: 'eventType is required' })
    }
    const delivery = prepare(secrets, options, new Date())
    state.sent.set(delivery.deliveryId, delivery)
    const delivered = await send(state, delivery, new Date())
    return reply.send({ deliveryId: delivery.deliveryId, delivered })
  })

  app.post<{ Params: { deliveryId: string } }>(
    `${CONTROL_ROUTES.redeliver}/:deliveryId`,
    async (request, reply) => {
      const delivery = state.sent.get(request.params.deliveryId)
      if (!delivery) {
        return reply.code(404).send({ error: 'not_found', message: 'no such delivery' })
      }
      // The same id and the same bytes, exactly as a platform re-delivery would be.
      const delivered = await send(state, delivery, new Date())
      return reply.send({ deliveryId: delivery.deliveryId, delivered })
    },
  )

  return { app, state }
}

if (process.argv[1]?.endsWith('server.ts')) {
  const { app } = buildMockPlatform()
  const port = Number(process.env.MOCK_PLATFORM_PORT ?? PORTS.mockPlatform)
  await app.listen({ port, host: '127.0.0.1' })
  console.log(`mock platform listening on http://127.0.0.1:${port}`)
}
