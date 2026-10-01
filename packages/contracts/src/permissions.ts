/**
 * The permission table: which application role may perform which operation.
 *
 * FROZEN in G0 on 2026-09-30 (constitution VII); rewritten as AS-BUILT in G6.
 * Source: data-model.md ("Permissions"), spec.md Permissions (RBAC), FR-033, research R-18.
 *
 * This table exists exactly once in the repository (checklist L6). Every `/api/*` route declares its
 * operation, and one check after authentication compares the operation with the principal's roles
 * before the handler runs (checklist L7). The web client holds no copy of it (contracts/web.md).
 */

import type { ApplicationRole } from './roles.ts'

/** The operations of the permission table, in the order of data-model.md. */
export const OPERATIONS = ['tasks.read', 'tasks.create', 'devices.read', 'users.list'] as const

export type Operation = (typeof OPERATIONS)[number]

/** operation -> the roles that may perform it. A principal's permissions are the union over its roles. */
export const PERMISSION_TABLE: Record<Operation, readonly ApplicationRole[]> = {
  'tasks.read': ['member', 'manager', 'admin'],
  'tasks.create': ['member', 'manager', 'admin'],
  'devices.read': ['manager', 'admin'],
  'users.list': ['admin'],
}

/** The route each operation belongs to (contracts/api.md), so the route table can be read back. */
export const OPERATION_ROUTES: Record<Operation, { method: 'GET' | 'POST'; path: string }> = {
  'tasks.read': { method: 'GET', path: '/api/tasks' },
  'tasks.create': { method: 'POST', path: '/api/tasks' },
  'devices.read': { method: 'GET', path: '/api/devices' },
  'users.list': { method: 'GET', path: '/api/users' },
}

/** The one decision: may a principal with these roles perform this operation? (FR-033) */
export function isPermitted(roles: readonly ApplicationRole[], operation: Operation): boolean {
  const allowed = PERMISSION_TABLE[operation]
  return roles.some((role) => allowed.includes(role))
}
