/**
 * T049 — the loop guard (US7 scenario 3, Q14, SC-007, FR-028).
 *
 * The loop is forced from outside the client: `GET /auth/session` is intercepted and always answers
 * `signedIn: false`, while the IdP's own session is real, so every `/auth/login` is answered
 * silently and the browser is sent straight back. That is the shape the case study found.
 *
 * The second test is the CONTROL of quickstart §4. It removes the guard's state on every page load —
 * no application code is changed — and the browser must then return to the platform **more than
 * twice within 60 seconds**, which is what SC-007 measures.
 */

import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { signInThroughPlatform, WEB } from './sign-in.ts'

const LOOP_MARKER = 'acme.signin.attempt'

test.describe.configure({ mode: 'serial' })

/** Sign in for real first, so that the IdP has a session and every later sign-in is silent. */
async function withIdpSession(context: BrowserContext): Promise<void> {
  const page = await context.newPage()
  await signInThroughPlatform(page, 'tenant-a', 'alice')
  await page.waitForURL(`${WEB}/board`)
  await page.close()
}

/** Count what leaves for the platform, and what the platform asked the user. */
function watch(page: Page): { logins: string[]; forms: string[] } {
  const logins: string[] = []
  const forms: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/auth/login')) logins.push(url)
    if (url.includes('login-actions/authenticate')) forms.push(url)
  })
  return { logins, forms }
}

test('a forced loop stops on /error/loop after at most one return to the platform', async ({
  browser,
}) => {
  const context = await browser.newContext()
  await withIdpSession(context)

  // The client can no longer see its own session, although the IdP still signs it in.
  await context.route('**/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ signedIn: false }),
    }),
  )

  const page = await context.newPage()
  const seen = watch(page)
  const startedAt = Date.now()
  await page.goto(`${WEB}/board?tenant=tenant-a`)
  await page.waitForURL(`${WEB}/error/loop`, { timeout: 20_000 })
  const seconds = (Date.now() - startedAt) / 1000

  await expect(page.getByTestId('page-error-loop')).toBeVisible()
  // At most one return to the platform (SC-007).
  expect(seen.logins).toHaveLength(1)
  // And the platform really did sign the browser in silently: it never asked for a password again.
  expect(seen.forms).toHaveLength(0)
  expect(seconds).toBeLessThan(60)

  console.log(
    `AC-33 green: ${seen.logins.length} return(s) to the platform in ${seconds.toFixed(2)} s`,
  )
  await context.close()
})

test('CONTROL: with the guard’s state removed, the browser bounces more than twice within 60 s', async ({
  browser,
}) => {
  // This is a control (constitution V): it asserts the WRONG behaviour on purpose. Nothing in
  // apps/web changes — the one-time marker of stage 1 is deleted on every page load, which is the
  // guard not being there. Stage 2 cannot fire either, because a client that never sees a session
  // never remembers a completed sign-in.
  const context = await browser.newContext()
  await withIdpSession(context)

  await context.route('**/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ signedIn: false }),
    }),
  )
  await context.addInitScript((key) => {
    window.sessionStorage.removeItem(key as string)
  }, LOOP_MARKER)

  const page = await context.newPage()
  const seen = watch(page)
  const startedAt = Date.now()

  await page.goto(`${WEB}/board?tenant=tenant-a`).catch(() => undefined)
  // Wait for the bouncing to pass the threshold SC-007 names, or give up after 30 s.
  await expect(async () => {
    expect(seen.logins.length).toBeGreaterThan(2)
  }).toPass({ timeout: 30_000 })
  const seconds = (Date.now() - startedAt) / 1000

  expect(seen.logins.length).toBeGreaterThan(2)
  expect(seconds).toBeLessThan(60)
  // It never reached the error page, and the platform never asked for a password: the bouncing is
  // the IdP signing in silently, over and over.
  expect(page.url()).not.toContain('/error/loop')
  expect(seen.forms).toHaveLength(0)

  console.log(
    `AC-33 control (red): ${seen.logins.length} returns to the platform in ${seconds.toFixed(2)} s`,
  )
  await context.close()
})
