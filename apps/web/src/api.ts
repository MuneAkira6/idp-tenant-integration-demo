/**
 * Everything the web client knows about the server. It decides nothing: it asks, and shows what it
 * is told — including a 403, which contracts/web.md says is shown as a sentence and not turned into a
 * rule of its own.
 */

import type { DevicesResponse, SessionInfo, TasksResponse, UsersResponse } from '@acme/contracts'

export type ApiResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'forbidden' }
  | { status: 'unauthenticated' }
  | { status: 'error'; detail: string }

async function get<T>(path: string): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(path, { credentials: 'same-origin' })
  } catch (error) {
    return { status: 'error', detail: (error as Error).message }
  }
  if (response.status === 403) return { status: 'forbidden' }
  if (response.status === 401) return { status: 'unauthenticated' }
  if (!response.ok) return { status: 'error', detail: `${response.status}` }
  return { status: 'ok', value: (await response.json()) as T }
}

export const fetchSession = (): Promise<ApiResult<SessionInfo>> => get<SessionInfo>('/auth/session')
export const fetchTasks = (): Promise<ApiResult<TasksResponse>> => get<TasksResponse>('/api/tasks')
export const fetchDevices = (): Promise<ApiResult<DevicesResponse>> =>
  get<DevicesResponse>('/api/devices')
export const fetchUsers = (): Promise<ApiResult<UsersResponse>> => get<UsersResponse>('/api/users')

export async function signInWithPassword(input: {
  tenant: string
  email: string
  password: string
}): Promise<{ ok: boolean; message: string }> {
  const response = await fetch('/auth/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  })
  if (response.ok) return { ok: true, message: '' }
  const body = (await response.json()) as { message?: string }
  return { ok: false, message: body.message ?? 'sign-in failed' }
}

export async function signOut(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
}
