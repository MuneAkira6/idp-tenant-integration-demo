/**
 * The Acme Tasks API (port 18400): the existing application, plus one more way in.
 *
 * Every way in ends in the same place — a row in `sessions` and an opaque cookie (constitution VI,
 * FR-002). Downstream of `authenticate()` there is no way to ask how the user signed in: the
 * principal carries the tenant, the user and the roles, and nothing else (checklist L3).
 */

import {
  API_ERRORS,
  type ApplicationRole,
  FLOW_COOKIE,
  INTEGRATED_VISIBILITY,
  NOT_INTEGRATED_VISIBILITY,
  OPERATION_ROUTES,
  type Operation,
  SESSION_COOKIE,
  type SessionInfo,
  WEBHOOK_ROUTE,
  WEBHOOK_ROUTE_TAG,
} from '@acme/contracts'
import cookie from '@fastify/cookie'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { ObjectId } from 'mongodb'
import {
  authenticateBearer,
  type BearerDeps,
  type JwksRegistry,
  newJwksRegistry,
} from './auth/bearer.ts'
import { signInWithPassword } from './auth/password.ts'
import { checkPermission } from './auth/permissions.ts'
import {
  completeLogin,
  decodeFlow,
  endPlatformSession,
  FLOW_LIFETIME_MS,
  startLogin,
} from './auth/platform.ts'
import {
  createPlatformSession,
  deleteSession,
  type Principal,
  platformTokenOf,
  readSession,
} from './auth/session.ts'
import { tenantFromIssuer } from './auth/tenant.ts'
import type { Clock } from './clock.ts'
import { type Config, platformSignInAvailable } from './config.ts'
import type { Collections, UserDoc } from './db.ts'
import { pullDevices } from './devices/pull.ts'
import { deriveApplicationRoles, storeDerivedRoles, unmappedRoleWarning } from './roles.ts'
import { type Scheduler, startScheduler } from './scheduler.ts'
import { findOrCreatePlatformUser } from './users.ts'
import { createInbox, type Inbox } from './webhooks/inbox.ts'
import { type ReceiveControls, receiveEvent } from './webhooks/receive.ts'
import { registerSubscriptions } from './webhooks/subscribe.ts'

export type ApiDeps = {
  config: Config
  collections: Collections
  clock: Clock
  /** where FR-013's warning goes; the tests capture it */
  warn?: (message: string) => void
  jwks?: JwksRegistry
  /** Only the controls of quickstart §4 set these; the running system never does. */
  testControls?: BearerDeps['testControls'] &
    ReceiveControls & {
      /** AC-40's control: take the one permission check away and see a `member` read the devices. */
      disablePermissionCheck?: boolean
    }
  /** AC-19 replaces this with a deliberately slow one; production uses the inbox's own. */
  processor?: Parameters<typeof createInbox>[0]['processor']
}

/** What `buildApi` returns beside the Fastify instance, for the parts a test has to reach. */
export type Api = FastifyInstance & {
  inbox: Inbox
  /** the recurring work of FR-032, present once `startUp()` has run */
  scheduler: Scheduler | null
  /** the URLs of the routes tagged as webhooks, collected from the route table (FR-018) */
  webhookRoutes: readonly string[]
  /** the start-up work of contracts/api.md: subscriptions, then the inbox sweep */
  startUp(): Promise<{ subscriptions: Awaited<ReturnType<typeof registerSubscriptions>> }>
}

type Authenticated = { ok: true; principal: Principal } | { ok: false; sent: true }

const sessionCookieOptions = { httpOnly: true, sameSite: 'lax', path: '/' } as const

export function buildApi(deps: ApiDeps): Api {
  const { config, collections, clock } = deps
  const warn = deps.warn ?? ((message: string) => console.warn(message))
  const jwks = deps.jwks ?? newJwksRegistry()
  const app = Fastify({ logger: false }) as unknown as Api
  app.register(cookie)

  /**
   * The bytes as they arrived, kept for every JSON request. The webhook signature is over the raw
   * body (FR-014, research R-6); verifying a re-serialisation of the parsed object would be
   * verifying different bytes.
   */
  const rawBodies = new WeakMap<FastifyRequest, Buffer>()
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const buffer = body as Buffer
    rawBodies.set(request as FastifyRequest, buffer)
    if (buffer.length === 0) return done(null, undefined)
    try {
      done(null, JSON.parse(buffer.toString('utf8')))
    } catch (error) {
      done(error as Error, undefined)
    }
  })

  /** The routes that carry the webhook tag, collected from the route table itself (FR-018). */
  const webhookRoutes: string[] = []
  app.addHook('onRoute', (route) => {
    const tags = (route.config as { tags?: string[] } | undefined)?.tags
    if (tags?.includes(WEBHOOK_ROUTE_TAG) && !webhookRoutes.includes(route.url)) {
      webhookRoutes.push(route.url)
    }
  })

  const inbox = createInbox({
    config,
    collections,
    clock,
    ...(deps.processor ? { processor: deps.processor } : {}),
    // FR-023: a tenant that has just been created has its devices pulled at once, not at the next
    // hour. With the pull switched off this returns `off` and nothing happens (FR-025).
    onTenantCreated: async (tenantId) => {
      await pullDevices({ config, collections, clock }, tenantId)
    },
  })

  /** The principal of the request being served, set by the authentication hook. */
  const principals = new WeakMap<FastifyRequest, Principal>()

  function fail(reply: FastifyReply, status: number, error: string, message: string): FastifyReply {
    return reply.code(status).send({ error, message })
  }

  /**
   * Authentication order of contracts/api.md: an application session decides when present, and only
   * without one is the Authorization header read (FR-007, checklist L5).
   */
  async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<Authenticated> {
    const session = await readSession(collections, clock, request.cookies[SESSION_COOKIE])
    if (session) {
      const user = await findUserById(session.tenantId, session.userId)
      if (!user) {
        await fail(
          reply,
          401,
          API_ERRORS.unauthenticated,
          'the session names a user that no longer exists',
        )
        return { ok: false, sent: true }
      }
      // FR-022: a tombstoned tenant's API calls are refused, whichever way in was used. The Bearer
      // path makes the same check, before it creates anything.
      const tenant = await collections.tenants.findOne({ _id: session.tenantId })
      if (!tenant || tenant.state === 'deleted') {
        await fail(reply, 403, API_ERRORS.tenantDeleted, `tenant ${session.tenantId} is deleted`)
        return { ok: false, sent: true }
      }
      return {
        ok: true,
        principal: {
          tenantId: session.tenantId,
          userId: session.userId,
          roles: user.roles,
          sessionCreatedAt: session.createdAt,
        },
      }
    }

    // Only now, with no session, is the Authorization header read at all (FR-007, checklist L5).
    const header = request.headers.authorization
    if (header?.startsWith('Bearer ')) {
      const result = await authenticateBearer(
        {
          config,
          collections,
          clock,
          jwks,
          warn,
          ...(deps.testControls ? { testControls: deps.testControls } : {}),
        },
        header.slice('Bearer '.length),
      )
      if (result.ok) return { ok: true, principal: result.principal }
      await fail(reply, result.status, result.error, result.message)
      return { ok: false, sent: true }
    }

    await fail(
      reply,
      401,
      API_ERRORS.unauthenticated,
      'no application session and no platform token',
    )
    return { ok: false, sent: true }
  }

  async function findUserById(tenantId: string, userId: string): Promise<UserDoc | null> {
    if (!ObjectId.isValid(userId)) return null
    return collections.users.findOne({ _id: new ObjectId(userId), tenantId })
  }

  // ------------------------------------------------------------ sign-in ----

  app.get<{ Querystring: { tenant?: string } }>('/auth/login', async (request, reply) => {
    const tenantId = request.query.tenant
    if (!tenantId) return fail(reply, 400, API_ERRORS.badRequest, 'tenant is required')

    // FR-029, before anything else: an unconfigured integration offers no platform sign-in.
    if (!platformSignInAvailable(config, tenantId)) {
      return fail(
        reply,
        404,
        API_ERRORS.notIntegrated,
        `no platform sign-in is configured for ${tenantId}`,
      )
    }
    const tenant = await collections.tenants.findOne({ _id: tenantId })
    if (!tenant?.integrated) {
      return fail(reply, 404, API_ERRORS.notIntegrated, `tenant ${tenantId} is not integrated`)
    }
    if (tenant.state === 'deleted') {
      return fail(reply, 403, API_ERRORS.tenantDeleted, `tenant ${tenantId} is deleted`)
    }

    const platformTenant = config.platformTenants.get(tenantId)
    if (!platformTenant) {
      return fail(
        reply,
        404,
        API_ERRORS.notIntegrated,
        `no platform sign-in is configured for ${tenantId}`,
      )
    }
    const { authorizationUrl, flowCookie } = await startLogin(config, platformTenant, clock.now())
    return reply
      .setCookie(FLOW_COOKIE, flowCookie, {
        ...sessionCookieOptions,
        maxAge: FLOW_LIFETIME_MS / 1000,
      })
      .redirect(authorizationUrl, 302)
  })

  app.get('/auth/callback', async (request, reply) => {
    if (!config.tokenEncryptionKey) {
      return fail(
        reply,
        404,
        API_ERRORS.notIntegrated,
        config.tokenEncryptionKeyError ?? 'not configured',
      )
    }
    const flow = decodeFlow(config.tokenEncryptionKey, request.cookies[FLOW_COOKIE])
    const state = (request.query as { state?: string }).state
    // The cookie is what binds this callback to the browser that started the flow (FR-001).
    if (!flow || !state || flow.state !== state) {
      return fail(
        reply,
        400,
        API_ERRORS.stateMismatch,
        'this callback does not belong to this browser',
      )
    }
    if (clock.now().getTime() - flow.startedAt > FLOW_LIFETIME_MS) {
      return fail(reply, 400, API_ERRORS.stateMismatch, 'this sign-in took too long; start again')
    }
    const platformTenant = config.platformTenants.get(flow.tenantId)
    if (!platformTenant) {
      return fail(
        reply,
        404,
        API_ERRORS.notIntegrated,
        `no platform sign-in is configured for ${flow.tenantId}`,
      )
    }

    let result: Awaited<ReturnType<typeof completeLogin>>
    try {
      result = await completeLogin(config, platformTenant, flow, request.url, clock.now())
    } catch {
      return reply.clearCookie(FLOW_COOKIE, sessionCookieOptions).code(400).send({
        error: API_ERRORS.stateMismatch,
        message: 'the authorisation code could not be exchanged',
      })
    }

    // FR-005: the tenant comes from the signed identity's issuer. `request.headers.host` is never read.
    const tenantId = tenantFromIssuer(config, result.claims.iss)
    if (!tenantId) {
      return fail(
        reply,
        401,
        API_ERRORS.invalidToken,
        `no tenant is configured for issuer ${result.claims.iss}`,
      )
    }
    const tenant = await collections.tenants.findOne({ _id: tenantId })
    if (!tenant || tenant.state === 'deleted') {
      return fail(reply, 403, API_ERRORS.tenantDeleted, `tenant ${tenantId} is deleted`)
    }

    // FR-011: the roles are derived at every sign-in, from the union across the clients we know,
    // through the one mapping table. FR-013: a role with no mapping gives the lowest and is named in
    // a warning. FR-012: the derived roles replace the stored ones, and nothing is written when they
    // are equal.
    // From the access token: the ID token carries no `resource_access` at all (facts F18).
    const derived = deriveApplicationRoles(result.accessClaims.resource_access)
    for (const ref of derived.unmapped) {
      warn(unmappedRoleWarning(tenantId, result.claims.sub, ref))
    }

    const { user } = await findOrCreatePlatformUser(
      collections,
      {
        tenantId,
        platformSubject: result.claims.sub,
        email: String(result.claims.email ?? `${result.claims.sub}@${tenantId}.example`),
        name: String(result.claims.name ?? result.claims.preferred_username ?? result.claims.sub),
        roles: derived.roles,
      },
      clock.now(),
    )
    await storeDerivedRoles(collections, user, derived.roles, clock.now())

    const session = await createPlatformSession(collections, clock, config.tokenEncryptionKey, {
      tenantId,
      userId: String(user._id),
      tokens: result.tokens,
    })

    const landing = tenant.integrated
      ? INTEGRATED_VISIBILITY.landing
      : NOT_INTEGRATED_VISIBILITY.landing
    return reply
      .clearCookie(FLOW_COOKIE, sessionCookieOptions)
      .setCookie(SESSION_COOKIE, session._id, sessionCookieOptions)
      .redirect(`${config.web.baseUrl}${landing}`, 302)
  })

  app.post<{ Body: { tenant?: string; email?: string; password?: string } }>(
    '/auth/password',
    async (request, reply) => {
      const { tenant, email, password } = request.body ?? {}
      if (!tenant || !email || !password) {
        return fail(reply, 400, API_ERRORS.badRequest, 'tenant, email and password are required')
      }
      const result = await signInWithPassword(collections, clock, { tenant, email, password })
      if (!result.ok) {
        // The internal reasons are mapped onto the frozen codes of packages/contracts.
        switch (result.reason) {
          case 'unknown_tenant':
            return fail(reply, 404, API_ERRORS.notFound, `no tenant ${tenant}`)
          case 'tenant_deleted':
            return fail(reply, 403, API_ERRORS.tenantDeleted, `tenant ${tenant} is deleted`)
          case 'not_integrated_only':
            return fail(
              reply,
              401,
              API_ERRORS.unauthenticated,
              `tenant ${tenant} signs in through the platform, not with a password`,
            )
          default:
            return fail(reply, 401, API_ERRORS.unauthenticated, 'invalid credentials')
        }
      }
      return reply
        .setCookie(SESSION_COOKIE, result.sessionId, sessionCookieOptions)
        .send({ signedIn: true, tenantId: result.tenantId, userId: result.userId })
    },
  )

  app.post('/auth/logout', async (request, reply) => {
    const session = await readSession(collections, clock, request.cookies[SESSION_COOKIE])
    let platformStatus: number | null = null
    if (session) {
      if (session.platform && config.tokenEncryptionKey) {
        const platformTenant = config.platformTenants.get(session.tenantId)
        const refreshToken = platformTokenOf(session, config.tokenEncryptionKey, 'refreshTokenEnc')
        if (platformTenant && refreshToken) {
          try {
            platformStatus = (await endPlatformSession(platformTenant, refreshToken)).status
          } catch {
            platformStatus = 0
          }
        }
      }
      await deleteSession(collections, session._id)
    }
    return reply
      .clearCookie(SESSION_COOKIE, sessionCookieOptions)
      .send({ signedOut: true, platformLogoutStatus: platformStatus })
  })

  app.get('/auth/session', async (request, reply) => {
    const session = await readSession(collections, clock, request.cookies[SESSION_COOKIE])
    if (!session) return reply.send({ signedIn: false } satisfies SessionInfo)
    const tenant = await collections.tenants.findOne({ _id: session.tenantId })
    const user = await findUserById(session.tenantId, session.userId)
    const integrated = Boolean(tenant?.integrated)
    const visibility = integrated ? INTEGRATED_VISIBILITY : NOT_INTEGRATED_VISIBILITY
    const info: SessionInfo = {
      signedIn: true,
      tenantId: session.tenantId,
      userId: session.userId,
      roles: (user?.roles ?? []) as ApplicationRole[],
      integrated,
      sessionCreatedAt: session.createdAt.toISOString(),
      landing: visibility.landing,
    }
    return reply.send(info)
  })

  // ------------------------------------------------- the existing API ------

  /**
   * The one place an `/api/*` route is registered (checklist L7, research R-18).
   *
   * The method and the path come from `OPERATION_ROUTES` in `packages/contracts`, so a route cannot
   * exist without declaring the operation it performs; and the two hooks below run, in this order,
   * **before** the handler — so no handler can be reached without authentication and the permission
   * check, and no handler contains a check of its own.
   */
  function apiRoute(
    operation: Operation,
    handler: (
      principal: Principal,
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<unknown>,
  ): void {
    const { method, path } = OPERATION_ROUTES[operation]
    app.route({
      method,
      url: path,
      preHandler: [
        async (request, reply) => {
          const auth = await authenticate(request, reply)
          if (auth.ok) principals.set(request, auth.principal)
        },
        async (request, reply) => {
          if (reply.sent) return
          const principal = principals.get(request)
          if (!principal) return
          if (deps.testControls?.disablePermissionCheck) return
          const decision = checkPermission(principal, operation)
          if (!decision.ok) await fail(reply, decision.status, decision.error, decision.message)
        },
      ],
      handler: async (request, reply) => {
        const principal = principals.get(request)
        if (!principal) return reply
        return handler(principal, request, reply)
      },
    })
  }

  apiRoute('tasks.read', async (principal, _request, reply) => {
    // FR-035: every query runs with the principal's own tenant.
    const tasks = await collections.tasks
      .find({ tenantId: principal.tenantId, userId: principal.userId })
      .toArray()
    return reply.send({
      tasks: tasks.map((task) => ({
        taskId: String(task._id),
        tenantId: task.tenantId,
        userId: task.userId,
        title: task.title,
        done: task.done,
        createdAt: task.createdAt.toISOString(),
      })),
    })
  })

  apiRoute('tasks.create', async (principal, request, reply) => {
    const title = (request.body as { title?: string } | undefined)?.title
    if (!title) return fail(reply, 400, API_ERRORS.badRequest, 'title is required')
    const createdAt = clock.now()
    const inserted = await collections.tasks.insertOne({
      tenantId: principal.tenantId,
      userId: principal.userId,
      title,
      done: false,
      createdAt,
    })
    return reply.code(201).send({
      taskId: String(inserted.insertedId),
      tenantId: principal.tenantId,
      userId: principal.userId,
      title,
      done: false,
      createdAt: createdAt.toISOString(),
    })
  })

  apiRoute('devices.read', async (principal, _request, reply) => {
    // The tenant's devices as the last pull left them. Filling them is the device pull of T046 (G4);
    // this route reads whatever is there, for its own tenant only (FR-035).
    const devices = await collections.devices.find({ tenantId: principal.tenantId }).toArray()
    const state = await collections.deviceSyncStates.findOne({ _id: principal.tenantId })
    return reply.send({
      devices: devices.map((device) => ({
        deviceId: device.platformDeviceId,
        name: device.name,
        model: device.model,
        fetchedAt: device.fetchedAt.toISOString(),
      })),
      syncState: state
        ? {
            source: state.source,
            lastAttemptAt: state.lastAttemptAt?.toISOString() ?? null,
            lastSuccessAt: state.lastSuccessAt?.toISOString() ?? null,
            lastError: state.lastError ?? null,
          }
        : null,
    })
  })

  apiRoute('users.list', async (principal, _request, reply) => {
    // FR-035: only the principal's own tenant, however many tenants have users.
    const users = await collections.users.find({ tenantId: principal.tenantId }).toArray()
    return reply.send({
      users: users.map((user) => ({
        userId: String(user._id),
        email: user.email,
        name: user.name,
        roles: user.roles,
      })),
    })
  })

  // ---------------------------------------------------------- webhooks ----

  app.post(WEBHOOK_ROUTE, { config: { tags: [WEBHOOK_ROUTE_TAG] } }, async (request, reply) => {
    const result = await receiveEvent(
      {
        config,
        collections,
        clock,
        ...(deps.testControls ? { testControls: deps.testControls } : {}),
      },
      { headers: request.headers, rawBody: rawBodies.get(request) ?? Buffer.alloc(0) },
    )
    if (result.status !== 200) return fail(reply, result.status, result.error, result.message)

    // Stored; now acknowledge, and only then process. `enqueue` does not wait (FR-016, L8).
    if (result.stored) inbox.enqueue(result.deliveryId)
    return reply.code(200).send(result.body)
  })

  // Whatever `startUp()` scheduled is stopped when the instance closes, so that a test or a shutdown
  // cannot leave a timer running against a database that is already gone.
  app.addHook('onClose', async () => {
    app.scheduler?.stop()
    inbox.stop()
  })

  app.inbox = inbox
  app.scheduler = null
  app.webhookRoutes = webhookRoutes
  app.startUp = async () => {
    await app.ready()
    const subscriptions = await registerSubscriptions(config, webhookRoutes)
    await inbox.start()
    // Everything recurring, at the real intervals, in one place (FR-032).
    app.scheduler = startScheduler({ config, collections, clock, inbox })
    return { subscriptions }
  }

  return app
}

/** Start the API as a process: `node apps/api/src/server.ts`. The tests build it with `buildApi`. */
async function main(): Promise<void> {
  const { systemClock } = await import('./clock.ts')
  const { loadConfig } = await import('./config.ts')
  const { connect } = await import('./db.ts')
  const { seedConfiguredPlatformTenants } = await import('./seed.ts')

  const config = loadConfig()
  const store = await connect(config)
  await seedConfiguredPlatformTenants(store, config.platformTenants.values())
  const app = buildApi({ config, collections: store, clock: systemClock() })
  await app.startUp()
  await app.listen({ port: config.api.port, host: '127.0.0.1' })
  console.log(`api listening on ${config.api.publicUrl}`)
}

if (process.argv[1]?.endsWith('server.ts')) await main()
