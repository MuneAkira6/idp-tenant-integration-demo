/**
 * The platform's tenant API (T042, contracts/platform.md).
 *
 * `GET /tenants/:tenantId` — 200 with the tenant, 403 when the platform refuses, 404 when it does not
 * know the tenant. `POST /__control/tenant-api` puts it into `refuse` or `unreachable`, which are the
 * two failure kinds FR-021 tells apart: a refusal is an answer, an unreachable platform is not.
 */

import type { PlatformTenant } from '@acme/contracts'

/** The tenants the platform knows about, for the lookups of FR-020. */
export const PLATFORM_TENANTS: Record<string, PlatformTenant> = {
  'tenant-a': {
    tenantId: 'tenant-a',
    name: 'Tenant A',
    issuer: 'http://localhost:18480/realms/tenant-a',
  },
  'tenant-b': {
    tenantId: 'tenant-b',
    name: 'Tenant B',
    issuer: 'http://localhost:18480/realms/tenant-b',
  },
  'tenant-c': {
    tenantId: 'tenant-c',
    name: 'Tenant C',
    issuer: 'http://localhost:18480/realms/tenant-c',
  },
}
