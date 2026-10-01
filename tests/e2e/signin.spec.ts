/**
 * T064, checklist M3 — SC-001: a user of an integrated tenant reaches the landing page within 10
 * seconds of starting sign-in, measured twice.
 *
 * Changed in G5: until T050 there was nothing listening on the web origin, so this spec caught the
 * landing as a *request* and could assert no more (facts F17). The web client is live now, so it
 * waits for the navigation to finish and asserts the **rendered** task board as well. The timing it
 * measures is the same one — from before `page.goto` on `/auth/login` to arriving at `/board` — and
 * G1's AC-1 was measured on G1's build and stands as recorded.
 */

import { expect, test } from '@playwright/test'
import { stackEnv } from './stack-env.ts'

const LOGIN = 'http://localhost:18400/auth/login?tenant=tenant-a'
const LANDING = 'http://localhost:18401/board'
const PASSWORD = stackEnv().KEYCLOAK_SEED_PASSWORD ?? ''

/** A JWS: three base64url parts whose first decodes to a JSON header with an `alg`. */
function isJwt(value: string | undefined): boolean {
  if (!value) return false
  const parts = value.split('.')
  if (parts.length !== 3 || !parts[0]) return false
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as unknown
    return typeof header === 'object' && header !== null && 'alg' in header
  } catch {
    return false
  }
}

test.describe.configure({ mode: 'serial' })

for (const run of [1, 2]) {
  test(`run ${run}: alice@tenant-a signs in and is sent to /board within 10 s`, async ({
    browser,
  }) => {
    // A fresh context per run: no IdP cookie carries over, so both runs are full sign-ins.
    const context = await browser.newContext()
    const page = await context.newPage()

    // Everything the application's origin sent the browser, so it can be scanned for a JWT.
    const apiPayloads: string[] = []
    page.on('response', (response) => {
      if (!response.url().startsWith('http://localhost:18400/')) return
      for (const [name, value] of Object.entries(response.headers()))
        apiPayloads.push(`${name}=${value}`)
      response
        .text()
        .then((body) => apiPayloads.push(...body.split(/["'\s,;=]+/)))
        .catch(() => undefined)
    })

    const startedAt = Date.now()
    await page.goto(LOGIN)

    // The platform's own sign-in page, at the issuer that names the tenant (FR-001, FR-005).
    await expect(page).toHaveURL(/^http:\/\/localhost:18480\/realms\/tenant-a\//)
    await page.fill('#username', 'alice')
    await page.fill('#password', PASSWORD)

    const landing = page.waitForRequest(LANDING, { timeout: 15_000 })
    await page.click('#kc-login')
    const landingRequest = await landing
    await page.waitForURL(LANDING, { timeout: 15_000 })
    const secondsToLanding = (Date.now() - startedAt) / 1000

    expect(landingRequest.url()).toBe(LANDING)
    expect(landingRequest.isNavigationRequest()).toBe(true)
    expect(page.url()).toBe(LANDING)
    // The landing now renders, because apps/web is live (T050).
    await expect(page.getByTestId('page-board')).toBeVisible()
    await expect(page.getByTestId('tenant')).toHaveText('tenant-a')
    expect(secondsToLanding).toBeLessThan(10)

    const session = await page.request.get('http://localhost:18400/auth/session')
    expect(session.status()).toBe(200)
    const info = await session.json()
    expect(info).toMatchObject({
      signedIn: true,
      tenantId: 'tenant-a',
      integrated: true,
      landing: '/board',
    })

    // The browser holds one opaque cookie from the application, and no response of the application
    // carried a platform token (FR-003). Keycloak's own cookies (KEYCLOAK_IDENTITY and friends) are
    // in the same jar because cookies ignore the port and the whole demo stack is on localhost; they
    // belong to the IdP's origin and are not something Acme Tasks handed the browser.
    const cookies = await context.cookies()
    const application = cookies.find((cookie) => cookie.name === 'acme_session')
    expect(application?.value).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(application?.httpOnly).toBe(true)
    expect(isJwt(application?.value)).toBe(false)
    const flow = cookies.find((cookie) => cookie.name === 'acme_auth_flow')
    expect(flow === undefined || flow.value === '' || flow.value.startsWith('v1.')).toBe(true)
    expect(apiPayloads.filter(isJwt)).toEqual([])

    console.log(
      `run ${run}: start to landing ${secondsToLanding.toFixed(2)} s; landed on ${landingRequest.url()}; ` +
        `session ${JSON.stringify(info)}`,
    )
    await context.close()
  })
}
