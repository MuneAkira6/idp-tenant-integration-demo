/**
 * The routes of contracts/web.md.
 *
 * A page the registry hides is not merely unlinked: its route renders `HiddenPage` instead, so
 * navigating straight to it shows nothing of the page (FR-026). The decision comes from
 * `visibility.ts`, which reads the frozen registry — there is no list of hidden pages here.
 */

import type { PageId } from '@acme/contracts'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { signOut } from './api.ts'
import { AuthGate, useSession } from './auth/gate.tsx'
import {
  BoardPage,
  DeleteTenantPage,
  DevicesPage,
  HiddenPage,
  HomePage,
  InviteUserPage,
  PasswordSettingsPage,
  SettingsPage,
  UsersPage,
} from './pages/pages.tsx'
import { LoopErrorPage, SignInPage } from './pages/signin.tsx'
import { isPageHidden, landingFor } from './visibility.ts'

/** A route that exists only for tenants the registry does not hide it from. */
function Hideable({ page, children }: { page: PageId; children: ReactNode }): ReactNode {
  const session = useSession()
  return isPageHidden(session, page) ? <HiddenPage /> : <>{children}</>
}

function Landing(): ReactNode {
  const session = useSession()
  return <Navigate to={landingFor(session)} replace />
}

/**
 * The header of a signed-in page: which tenant, how the user signed in, and the way out. The raw
 * values the tests read stay on data attributes; the visible text is for people.
 */
function Shell({ children }: { children: ReactNode }): ReactNode {
  const session = useSession()
  // A full navigation after sign-out, so that no part of the client keeps the old session.
  const leave = async (): Promise<void> => {
    await signOut()
    window.location.assign('/signin')
  }
  return (
    <main>
      <header data-testid="shell">
        <span>
          Tenant <strong data-testid="shell-tenant">{session.tenantId}</strong>
        </span>{' '}
        <span data-testid="shell-integrated" data-integrated={String(session.integrated)}>
          {session.integrated ? 'signed in with the group account' : 'signed in with a password'}
        </span>{' '}
        <button
          type="button"
          data-testid="sign-out"
          onClick={() => {
            void leave()
          }}
        >
          Sign out
        </button>
      </header>
      {children}
    </main>
  )
}

const guarded = (page: PageId, element: ReactNode): ReactNode => (
  <AuthGate>
    <Shell>
      <Hideable page={page}>{element}</Hideable>
    </Shell>
  </AuthGate>
)

export function App(): ReactNode {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <AuthGate>
            <Landing />
          </AuthGate>
        }
      />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/error/loop" element={<LoopErrorPage />} />
      <Route path="/home" element={guarded('home', <HomePage />)} />
      <Route path="/board" element={guarded('board', <BoardPage />)} />
      <Route path="/devices" element={guarded('devices', <DevicesPage />)} />
      <Route path="/users" element={guarded('users', <UsersPage />)} />
      <Route path="/users/invite" element={guarded('users/invite', <InviteUserPage />)} />
      <Route path="/settings" element={guarded('settings', <SettingsPage />)} />
      <Route
        path="/settings/password"
        element={guarded('settings/password', <PasswordSettingsPage />)}
      />
      <Route
        path="/settings/delete-tenant"
        element={guarded('settings/delete-tenant', <DeleteTenantPage />)}
      />
    </Routes>
  )
}
