/**
 * The pages contracts/web.md names. They are deliberately plain: this goal is about what is shown and
 * what is hidden, not about the task manager itself.
 *
 * None of them decides a permission. `/devices` and `/users` call their API route and show whatever
 * the server answered; a 403 becomes one sentence (FR-033, contracts/web.md).
 */

import type { DevicesResponse, TasksResponse, UsersResponse } from '@acme/contracts'
import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { type ApiResult, fetchDevices, fetchTasks, fetchUsers } from '../api.ts'
import { useSession } from '../auth/gate.tsx'
import { isSectionHidden, isTabHidden } from '../visibility.ts'

/** The sentence contracts/web.md asks for, shown for the server's 403 and nothing else. */
export const FORBIDDEN_MESSAGE = 'You do not have permission to see this page'

function useApi<T>(load: () => Promise<ApiResult<T>>): ApiResult<T> | null {
  const [result, setResult] = useState<ApiResult<T> | null>(null)
  useEffect(() => {
    let cancelled = false
    void load().then((value) => {
      if (!cancelled) setResult(value)
    })
    return () => {
      cancelled = true
    }
  }, [load])
  return result
}

function Answer<T>({
  result,
  render,
}: {
  result: ApiResult<T> | null
  render: (value: T) => ReactNode
}) {
  if (!result) return <p data-testid="loading">Loading…</p>
  if (result.status === 'forbidden') return <p data-testid="forbidden">{FORBIDDEN_MESSAGE}</p>
  if (result.status !== 'ok') return <p data-testid="error">Something went wrong.</p>
  return <>{render(result.value)}</>
}

export function HomePage(): ReactNode {
  const session = useSession()
  return (
    <section data-testid="page-home">
      <h1>Home</h1>
      <p>
        Signed in to <span data-testid="tenant">{session.tenantId}</span>
      </p>
    </section>
  )
}

export function BoardPage(): ReactNode {
  const session = useSession()
  const tasks = useApi<TasksResponse>(fetchTasks)
  return (
    <section data-testid="page-board">
      <h1>Task board</h1>
      <p>
        Signed in to <span data-testid="tenant">{session.tenantId}</span>
      </p>
      <Answer
        result={tasks}
        render={(value) => (
          <ul data-testid="tasks">
            {value.tasks.map((task) => (
              <li key={task.taskId}>{task.title}</li>
            ))}
          </ul>
        )}
      />
    </section>
  )
}

export function DevicesPage(): ReactNode {
  const devices = useApi<DevicesResponse>(fetchDevices)
  return (
    <section data-testid="page-devices">
      <h1>Devices</h1>
      <Answer
        result={devices}
        render={(value) => (
          <ul data-testid="devices">
            {value.devices.map((device) => (
              <li key={device.deviceId}>{device.name}</li>
            ))}
          </ul>
        )}
      />
    </section>
  )
}

export function UsersPage(): ReactNode {
  const session = useSession()
  const users = useApi<UsersResponse>(fetchUsers)
  return (
    <section data-testid="page-users">
      <h1>Users</h1>
      <Answer
        result={users}
        render={(value) => (
          <ul data-testid="users">
            {value.users.map((user) => (
              <li key={user.userId}>
                {user.email} — {user.roles.join(', ')}
              </li>
            ))}
          </ul>
        )}
      />
      {isSectionHidden(session, 'users/pending-invitations') ? null : (
        <section data-testid="section-pending-invitations">
          <h2>Pending invitations</h2>
          <p>No invitations are waiting.</p>
        </section>
      )}
    </section>
  )
}

export function SettingsPage(): ReactNode {
  const session = useSession()
  return (
    <section data-testid="page-settings">
      <h1>Settings</h1>
      <nav>
        <Link to="/settings">General</Link>
        {isTabHidden(session, 'settings/security') ? null : (
          <Link data-testid="tab-security" to="/settings?tab=security">
            Security
          </Link>
        )}
      </nav>
    </section>
  )
}

export function PasswordSettingsPage(): ReactNode {
  return (
    <section data-testid="page-settings-password">
      <h1>Password</h1>
      <form>
        <label htmlFor="new-password">New password</label>
        <input id="new-password" type="password" />
        <button type="submit">Change password</button>
      </form>
    </section>
  )
}

export function InviteUserPage(): ReactNode {
  return (
    <section data-testid="page-users-invite">
      <h1>Invite a user</h1>
      <form>
        <label htmlFor="invite-email">E-mail address</label>
        <input id="invite-email" type="email" />
        <button type="submit">Send invitation</button>
      </form>
    </section>
  )
}

export function DeleteTenantPage(): ReactNode {
  return (
    <section data-testid="page-settings-delete-tenant">
      <h1>Delete this tenant</h1>
      <button type="button">Delete the tenant</button>
    </section>
  )
}

/** What a hidden page answers: not reachable, and nothing of the page itself rendered (FR-026). */
export function HiddenPage(): ReactNode {
  return (
    <section data-testid="page-hidden">
      <h1>Not available</h1>
      <p>This tenant's group platform manages this function.</p>
    </section>
  )
}
