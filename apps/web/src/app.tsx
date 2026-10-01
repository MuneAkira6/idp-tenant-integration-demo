/**
 * The routes of contracts/web.md.
 *
 * A page the registry hides is not merely unlinked: its route renders `HiddenPage` instead, so
 * navigating straight to it shows nothing of the page (FR-026). The decision comes from
 * `visibility.ts`, which reads the frozen registry — there is no list of hidden pages here.
 */

import type { PageId } from '@acme/contracts'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router'
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

function Shell({ children }: { children: ReactNode }): ReactNode {
  const session = useSession()
  const navigate = useNavigate()
  return (
    <main>
      <header data-testid="shell">
        <span data-testid="shell-tenant">{session.tenantId}</span>
        <span data-testid="shell-integrated">{String(session.integrated)}</span>
        <button type="button" data-testid="go-signin" onClick={() => navigate('/signin')}>
          Sign in
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
