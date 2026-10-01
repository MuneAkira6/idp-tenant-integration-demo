/**
 * The mock platform's state: the subscriptions it was given, the modes a test put it in, and the log
 * of what it sent (contracts/platform.md). It is all in memory: the mock is started by the tests.
 */

import type { ControlLogEntry, DeviceApiMode, Subscription, TenantApiMode } from '@acme/contracts'
import type { SentDelivery } from './events.ts'

export type MockState = {
  subscriptions: Map<string, Subscription>
  tenantApiMode: TenantApiMode
  /** `fail-on-page` fails exactly this page of the device API (SC-006) */
  deviceApiMode: DeviceApiMode
  deviceApiFailPage: number
  log: ControlLogEntry[]
  /** every delivery as it was built, so `/__control/redeliver/:id` repeats the same bytes */
  sent: Map<string, SentDelivery>
}

export function newState(): MockState {
  return {
    subscriptions: new Map(),
    tenantApiMode: 'normal',
    deviceApiMode: 'normal',
    deviceApiFailPage: 2,
    log: [],
    sent: new Map(),
  }
}

export function resetState(state: MockState): void {
  state.subscriptions.clear()
  state.tenantApiMode = 'normal'
  state.deviceApiMode = 'normal'
  state.deviceApiFailPage = 2
  state.log.length = 0
  state.sent.clear()
}
