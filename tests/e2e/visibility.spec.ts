/**
 * T048, T070 — what an integrated tenant sees, and what the tenant that is not integrated still sees
 * (US7, Q13, FR-026; and the web half of US9, AC-45, FR-033).
 *
 * The two tenants are compared side by side, in fresh browser contexts, as the runbook asks. A hidden
 * page is checked to be **not reachable**, not merely unlinked: the test navigates straight to it.
 */

import { expect, test } from '@playwright/test'
import { signInThroughPlatform, signInWithPassword, WEB } from './sign-in.ts'

const OWNED_BY_THE_PLATFORM = [
  { path: '/settings/password', testId: 'page-settings-password' },
  { path: '/users/invite', testId: 'page-users-invite' },
  { path: '/settings/delete-tenant', testId: 'page-settings-delete-tenant' },
] as const

test.describe.configure({ mode: 'serial' })

test('tenant-a hides the three functions the platform owns and lands on /board', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  // adam is the `admin` of tenant-a, so the user list is readable and the section can be looked for.
  await signInThroughPlatform(page, 'tenant-a', 'adam')

  await page.waitForURL(`${WEB}/board`)
  await expect(page.getByTestId('page-board')).toBeVisible()
  await expect(page.getByTestId('shell-integrated')).toHaveText('true')

  // The three pages are not reachable, even by typing the address.
  for (const owned of OWNED_BY_THE_PLATFORM) {
    await page.goto(`${WEB}${owned.path}`)
    await expect(page.getByTestId('page-hidden')).toBeVisible()
    await expect(page.getByTestId(owned.testId)).toHaveCount(0)
  }

  // The tab inside a page that is still visible.
  await page.goto(`${WEB}/settings`)
  await expect(page.getByTestId('page-settings')).toBeVisible()
  await expect(page.getByTestId('tab-security')).toHaveCount(0)

  // The section inside a page that is still visible.
  await page.goto(`${WEB}/users`)
  await expect(page.getByTestId('users')).toBeVisible()
  await expect(page.getByTestId('section-pending-invitations')).toHaveCount(0)

  await context.close()
})

test('local sees all of them and lands on /home', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  // lotte is the `admin` of local, so the same pages are comparable.
  await signInWithPassword(page, 'lotte@local.example')

  await page.waitForURL(`${WEB}/home`)
  await expect(page.getByTestId('page-home')).toBeVisible()
  await expect(page.getByTestId('shell-integrated')).toHaveText('false')

  // Every page the integrated tenant hides renders here.
  for (const owned of OWNED_BY_THE_PLATFORM) {
    await page.goto(`${WEB}${owned.path}`)
    await expect(page.getByTestId(owned.testId)).toBeVisible()
    await expect(page.getByTestId('page-hidden')).toHaveCount(0)
  }

  await page.goto(`${WEB}/settings`)
  await expect(page.getByTestId('tab-security')).toBeVisible()

  await page.goto(`${WEB}/users`)
  await expect(page.getByTestId('users')).toBeVisible()
  await expect(page.getByTestId('section-pending-invitations')).toBeVisible()

  await context.close()
})

test('a member of tenant-a is shown the server’s 403 on /devices and /users (AC-45)', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  // alice is the `member`: the permission table says no to both of these.
  await signInThroughPlatform(page, 'tenant-a', 'alice')
  await page.waitForURL(`${WEB}/board`)

  for (const path of ['/devices', '/users']) {
    // The route really is called, and the answer really is the server's 403.
    const [response] = await Promise.all([
      page.waitForResponse((candidate) => candidate.url().includes(`/api${path}`)),
      page.goto(`${WEB}${path}`),
    ])
    expect(response.status()).toBe(403)
    expect(await response.json()).toMatchObject({ error: 'forbidden' })
    await expect(page.getByTestId('forbidden')).toHaveText(
      'You do not have permission to see this page',
    )
  }

  await context.close()
})

test('an admin of tenant-a is shown the devices and the users, from the same pages', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signInThroughPlatform(page, 'tenant-a', 'adam')
  await page.waitForURL(`${WEB}/board`)

  await page.goto(`${WEB}/devices`)
  await expect(page.getByTestId('page-devices')).toBeVisible()
  await expect(page.getByTestId('forbidden')).toHaveCount(0)

  await page.goto(`${WEB}/users`)
  await expect(page.getByTestId('users')).toBeVisible()
  await expect(page.getByTestId('forbidden')).toHaveCount(0)

  await context.close()
})
