/**
 * The one permission check (T068, FR-033, research R-18).
 *
 * It runs once per request, after authentication and before the handler, and it is the only place
 * that consults the permission table. Every `/api/*` route is registered through `apiRoute()` in
 * `apps/api/src/server.ts`, which reads the route's method and path from `OPERATION_ROUTES` and
 * attaches this check as a `preHandler` — so a route cannot exist without declaring its operation,
 * and the check cannot be forgotten inside a handler.
 */

import { API_ERRORS, isPermitted, type Operation } from '@acme/contracts'
import type { Principal } from './session.ts'

export type PermissionDecision =
  | { ok: true }
  | { ok: false; status: number; error: string; message: string }

export function checkPermission(principal: Principal, operation: Operation): PermissionDecision {
  if (isPermitted(principal.roles, operation)) return { ok: true }
  return {
    ok: false,
    status: 403,
    error: API_ERRORS.forbidden,
    message: `${operation} needs a role this principal does not have`,
  }
}
