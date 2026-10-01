/** Signing in through the web client, the only way the browser is given (FR-027). */

import { expect, type Page } from '@playwright/test'
import { stackEnv } from './stack-env.ts'

export const WEB = 'http://localhost:18401'

/** An integrated tenant: the client's gate sends the browser to the platform, which asks for a password. */
export async function signInThroughPlatform(
  page: Page,
  tenant: 'tenant-a' | 'tenant-b',
  username: string,
): Promise<void> {
  await page.goto(`${WEB}/signin`)
  await page.getByTestId(`signin-${tenant}`).click()
  await expect(page).toHaveURL(new RegExp(`^http://localhost:18480/realms/${tenant}/`))
  await page.fill('#username', username)
  await page.fill('#password', stackEnv().KEYCLOAK_SEED_PASSWORD ?? '')
  await page.click('#kc-login')
}

/** The tenant that is not integrated: its own password form, unchanged (FR-031). */
export async function signInWithPassword(page: Page, email: string): Promise<void> {
  await page.goto(`${WEB}/signin?tenant=local`)
  await page.fill('#email', email)
  await page.fill('#password', stackEnv().LOCAL_SEED_PASSWORD ?? '')
  await page.getByTestId('password-submit').click()
}
