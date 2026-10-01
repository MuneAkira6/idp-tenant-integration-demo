/**
 * The frozen contracts against the spec folder they were frozen from (T006, constitution VII).
 */

import { describe, expect, it } from 'vitest'
import {
  APPLICATION_ROLES,
  audiences,
  DELIVERY_RETENTION_DAYS,
  INTEGRATED_VISIBILITY,
  isPermitted,
  LOOP_GUARD_WINDOW_SECONDS,
  LOWEST_APPLICATION_ROLE,
  NOT_INTEGRATED_VISIBILITY,
  OPERATION_ROUTES,
  OPERATIONS,
  PERMISSION_TABLE,
  PLATFORM_API_AUDIENCE,
  PLATFORM_TOKEN_ALGORITHM,
  ROLE_MAPPING,
  SIGNATURE_PREFIX,
  sameRoles,
  signaturePayload,
  sortRoles,
  TIMESTAMP_WINDOW_SECONDS,
  webhookSecretEnvName,
} from '../src/index.ts'

describe('the permission table (data-model.md, Permissions; SC-009)', () => {
  it('names the four operations of the table, with their routes', () => {
    expect([...OPERATIONS]).toEqual(['tasks.read', 'tasks.create', 'devices.read', 'users.list'])
    expect(OPERATION_ROUTES['devices.read']).toEqual({ method: 'GET', path: '/api/devices' })
    expect(OPERATION_ROUTES['users.list']).toEqual({ method: 'GET', path: '/api/users' })
  })

  it('answers the 12 combinations of SC-009 exactly as data-model.md states them', () => {
    const expected: Record<string, Record<string, boolean>> = {
      member: {
        'tasks.read': true,
        'tasks.create': true,
        'devices.read': false,
        'users.list': false,
      },
      manager: {
        'tasks.read': true,
        'tasks.create': true,
        'devices.read': true,
        'users.list': false,
      },
      admin: { 'tasks.read': true, 'tasks.create': true, 'devices.read': true, 'users.list': true },
    }
    const observed: Record<string, Record<string, boolean>> = {}
    for (const role of APPLICATION_ROLES) {
      observed[role] = {}
      for (const operation of OPERATIONS) {
        ;(observed[role] as Record<string, boolean>)[operation] = isPermitted([role], operation)
      }
    }
    expect(observed).toEqual(expected)
  })

  it('a principal with several roles gets the union of their permissions', () => {
    expect(isPermitted(['member', 'admin'], 'users.list')).toBe(true)
    expect(isPermitted(['member'], 'users.list')).toBe(false)
    expect(isPermitted([], 'tasks.read')).toBe(false)
  })

  it('every operation is reachable by admin, and only tasks by member', () => {
    expect(OPERATIONS.filter((o) => PERMISSION_TABLE[o].includes('admin'))).toHaveLength(4)
    expect(OPERATIONS.filter((o) => PERMISSION_TABLE[o].includes('member'))).toEqual([
      'tasks.read',
      'tasks.create',
    ])
  })
})

describe('the role mapping table (FR-011 to FR-013)', () => {
  it('has member as the lowest application role', () => {
    expect([...APPLICATION_ROLES]).toEqual(['member', 'manager', 'admin'])
    expect(LOWEST_APPLICATION_ROLE).toBe('member')
    expect(APPLICATION_ROLES[0]).toBe(LOWEST_APPLICATION_ROLE)
  })

  it('maps the client roles the realms of infra/keycloak/realms/ define (F13)', () => {
    expect(ROLE_MAPPING['acme-tasks']).toEqual({
      'tasks-admin': 'admin',
      'tasks-manager': 'manager',
      'tasks-user': 'member',
    })
    expect(ROLE_MAPPING['acme-reports']).toEqual({
      'reports-admin': 'admin',
      'reports-viewer': 'member',
    })
  })

  it('leaves `legacy-viewer` unmapped, which is the role FR-013 is tested with', () => {
    expect(ROLE_MAPPING['acme-reports']['legacy-viewer']).toBeUndefined()
  })

  it('sorts and compares roles by value, so an unchanged set is not written (FR-012)', () => {
    expect(sortRoles(['admin', 'member'])).toEqual(['member', 'admin'])
    expect(sameRoles(['admin', 'member'], ['member', 'admin'])).toBe(true)
    expect(sameRoles(['admin'], ['admin', 'member'])).toBe(false)
  })
})

describe('the measured token shapes (facts F13 to F16)', () => {
  it('reads `aud` in both measured forms: a string and an array', () => {
    expect(audiences({ aud: 'acme-tasks-api' })).toEqual(['acme-tasks-api'])
    expect(audiences({ aud: ['acme-tasks-api', 'acme-reports'] })).toEqual([
      'acme-tasks-api',
      'acme-reports',
    ])
    expect(audiences({})).toEqual([])
  })

  it('names the algorithm and the audience the realms were measured to issue', () => {
    expect(PLATFORM_TOKEN_ALGORITHM).toBe('RS256')
    expect(PLATFORM_API_AUDIENCE).toBe('acme-tasks-api')
  })
})

describe('the event contract (research R-6, R-7)', () => {
  it('signs the timestamp and the raw body joined by a dot, and prefixes the signature', () => {
    expect(signaturePayload('1790000000', '{"a":1}')).toBe('1790000000.{"a":1}')
    expect(SIGNATURE_PREFIX).toBe('sha256=')
  })

  it('names one environment variable per event type (FR-014, FR-029)', () => {
    expect(webhookSecretEnvName('tenant.created')).toBe('WEBHOOK_SECRET_TENANT_CREATED')
    expect(webhookSecretEnvName('tenant.deleted')).toBe('WEBHOOK_SECRET_TENANT_DELETED')
  })

  it('keeps the windows the spec states: 300 s and 30 days', () => {
    expect(TIMESTAMP_WINDOW_SECONDS).toBe(300)
    expect(DELIVERY_RETENTION_DAYS).toBe(30)
  })
})

describe('the visibility registry (contracts/web.md, FR-026)', () => {
  it('hides nothing for a tenant that is not integrated and lands on /home', () => {
    expect(NOT_INTEGRATED_VISIBILITY).toEqual({
      hiddenPages: [],
      hiddenTabs: [],
      hiddenSections: [],
      landing: '/home',
    })
  })

  it('hides the three functions the platform owns and lands on /board', () => {
    expect(INTEGRATED_VISIBILITY.hiddenPages).toEqual([
      'settings/password',
      'users/invite',
      'settings/delete-tenant',
    ])
    expect(INTEGRATED_VISIBILITY.hiddenTabs).toEqual(['settings/security'])
    expect(INTEGRATED_VISIBILITY.hiddenSections).toEqual(['users/pending-invitations'])
    expect(INTEGRATED_VISIBILITY.landing).toBe('/board')
  })

  it('keeps the loop guard window of SC-007 at 60 s', () => {
    expect(LOOP_GUARD_WINDOW_SECONDS).toBe(60)
  })
})
