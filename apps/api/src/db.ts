/**
 * The MongoDB collections and indexes of data-model.md.
 *
 * The two indexes the design rests on are here: the partial unique index that makes concurrent first
 * contact converge on one user (research R-8, FR-010), and the TTL indexes that let MongoDB itself
 * forget sessions and delivery ids (FR-016).
 */

import type { ApplicationRole, DeliveryOutcome } from '@acme/contracts'
import { type Collection, type Db, MongoClient, type ObjectId } from 'mongodb'
import type { Config } from './config.ts'

export type TenantDoc = {
  _id: string
  name: string
  /** the tenant-level integration flag; default false (FR-030) */
  integrated: boolean
  issuer?: string
  state: 'active' | 'deleted'
  deletedAt?: Date
  purgeAfter?: Date
  platformChangedAt?: Date
  /** set when the clock passed `purgeAfter` and the tenant's data was removed (FR-022) */
  purgedAt?: Date
}

export type UserDoc = {
  _id?: ObjectId
  tenantId: string
  /** the platform's `sub`; only for users of integrated tenants */
  platformSubject?: string
  email: string
  name: string
  /** only for the tenant that is not integrated */
  passwordHash?: string
  roles: ApplicationRole[]
  rolesWrittenAt?: Date
}

export type SessionDoc = {
  _id: string
  tenantId: string
  userId: string
  /** how the session began; nothing downstream reads it (checklist L3) */
  kind: 'password' | 'platform'
  createdAt: Date
  expiresAt: Date
  platform?: {
    issuer: string
    sid?: string
    refreshTokenEnc: string
    accessTokenEnc: string
    accessExpiresAt: Date
  }
  refreshRetryAt?: Date
}

export type TaskDoc = {
  _id?: ObjectId
  tenantId: string
  userId: string
  title: string
  done: boolean
  createdAt: Date
}

export type DeliveryDoc = {
  _id: string
  eventType: string
  body: unknown
  receivedAt: Date
  processedAt?: Date
  outcome?: DeliveryOutcome
  expiresAt: Date
}

export type TenantLookupDoc = {
  _id?: ObjectId
  deliveryId: string
  platformTenantId: string
  status: 'pending' | 'resolved' | 'rejected' | 'expired'
  attempts: number
  nextAttemptAt?: Date
  expiresAt: Date
  lastError?: string
}

export type DeviceDoc = {
  _id: string
  tenantId: string
  platformDeviceId: string
  name: string
  model: string
  fetchedAt: Date
}

export type DeviceSyncStateDoc = {
  _id: string
  source: string
  lastAttemptAt: Date
  /** never changed by a failure (FR-024, checklist L10) */
  lastSuccessAt?: Date
  lastError?: string
}

export type SubscriptionDoc = {
  _id: string
  callbackUrl: string
  registeredAt: Date
}

export type Collections = {
  tenants: Collection<TenantDoc>
  users: Collection<UserDoc>
  sessions: Collection<SessionDoc>
  tasks: Collection<TaskDoc>
  deliveries: Collection<DeliveryDoc>
  tenantLookups: Collection<TenantLookupDoc>
  devices: Collection<DeviceDoc>
  deviceSyncStates: Collection<DeviceSyncStateDoc>
  subscriptions: Collection<SubscriptionDoc>
}

export type Store = Collections & { db: Db; client: MongoClient; close(): Promise<void> }

export function collectionsOf(db: Db): Collections {
  return {
    tenants: db.collection<TenantDoc>('tenants'),
    users: db.collection<UserDoc>('users'),
    sessions: db.collection<SessionDoc>('sessions'),
    tasks: db.collection<TaskDoc>('tasks'),
    deliveries: db.collection<DeliveryDoc>('deliveries'),
    tenantLookups: db.collection<TenantLookupDoc>('tenantLookups'),
    devices: db.collection<DeviceDoc>('devices'),
    deviceSyncStates: db.collection<DeviceSyncStateDoc>('deviceSyncStates'),
    subscriptions: db.collection<SubscriptionDoc>('subscriptions'),
  }
}

/** The name of the partial unique index of research R-8, so a control can drop it by name (T023). */
export const FIRST_CONTACT_INDEX = 'users_tenant_platformSubject_unique'

export async function ensureIndexes(db: Db): Promise<void> {
  const c = collectionsOf(db)

  // tenants: unique on issuer, sparse — a tenant that is not integrated has none (data-model.md).
  await c.tenants.createIndex(
    { issuer: 1 },
    { unique: true, sparse: true, name: 'tenants_issuer_unique' },
  )

  // users: the guard of FR-010. Partial, because only integrated tenants' users have a subject.
  await c.users.createIndex(
    { tenantId: 1, platformSubject: 1 },
    {
      unique: true,
      name: FIRST_CONTACT_INDEX,
      partialFilterExpression: { platformSubject: { $exists: true } },
    },
  )
  await c.users.createIndex(
    { tenantId: 1, email: 1 },
    { unique: true, name: 'users_tenant_email_unique' },
  )

  // sessions: MongoDB expires them, not the application.
  await c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'sessions_ttl' })

  await c.tasks.createIndex({ tenantId: 1, userId: 1 }, { name: 'tasks_tenant_user' })

  // deliveries: `_id` is the delivery id, so its uniqueness is the idempotency (research R-7).
  await c.deliveries.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: 'deliveries_ttl' },
  )
  await c.deliveries.createIndex({ processedAt: 1 }, { name: 'deliveries_processedAt' })

  await c.tenantLookups.createIndex({ status: 1, nextAttemptAt: 1 }, { name: 'tenantLookups_due' })
  await c.devices.createIndex({ tenantId: 1 }, { name: 'devices_tenant' })
}

export async function connect(config: Config): Promise<Store> {
  const client = new MongoClient(config.mongo.url)
  await client.connect()
  const db = client.db(config.mongo.database)
  await ensureIndexes(db)
  return {
    ...collectionsOf(db),
    db,
    client,
    close: () => client.close(),
  }
}
