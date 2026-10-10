import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'
import { PASSWORD, resetRateLimits } from './env'

export const USERS = {
  acme: {
    owner: 'owner@acme.test',
    operator: 'operator@acme.test',
    reviewer: 'reviewer@acme.test',
    admin: 'admin@acme.test',
  },
  bharat: {
    owner: 'owner@bharat.test',
    operator: 'operator@bharat.test',
    reviewer: 'reviewer@bharat.test',
    admin: 'admin@bharat.test',
  },
} as const

export const TENANTS = {
  acme: { id: 'd1b7419f-71fb-5cb3-937c-b2d348056db4', name: 'Acme Apparel' },
  bharat: { id: 'f9bd53cc-df8a-5620-b126-014401ee39c6', name: 'Bharat Home' },
} as const

export interface Tokens {
  access_token: string
  refresh_token: string
  expires_in: number
}

/**
 * POST /auth/login through the dev proxy. Respects the 5/min-per-email limiter: on 429 it
 * resets the local limiter when possible, otherwise waits Retry-After, then retries.
 */
export async function apiLogin(request: APIRequestContext, email: string, password = PASSWORD): Promise<Tokens> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await request.post('/api/v1/auth/login', { data: { email, password } })
    if (res.status() === 200) return (await res.json()) as Tokens
    if (res.status() !== 429) throw new Error(`login ${email} failed: ${res.status()} ${await res.text()}`)
    if (!resetRateLimits()) {
      const wait = Number(res.headers()['retry-after'] ?? 60)
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000))
    }
  }
  throw new Error(`login ${email}: still rate limited`)
}

/**
 * Sign `page` in as `email` without the UI: log in via the API, hand the refresh token to the
 * app (localStorage `mkos.rt`, exactly what the app persists) and load `path`. The app then
 * restores the session through its own single-flight refresh.
 */
export async function loginAs(page: Page, email: string, path = '/') {
  const tokens = await apiLogin(page.request, email)
  await page.goto('/login')
  await page.evaluate((rt) => localStorage.setItem('mkos.rt', rt), tokens.refresh_token)
  await page.goto(path)
  await expect(page.getByTestId('user-menu')).toBeVisible()
  return tokens
}

/** Fill and submit the real login form. */
export async function loginViaUi(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Count POST /auth/refresh requests made by a page from now on. */
export function countRefreshes(page: Page) {
  let n = 0
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/v1/auth/refresh')) n += 1
  })
  return () => n
}

export async function visibleNavIds(page: Page) {
  return page.locator('[data-testid="main-nav"] [data-nav-id]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-nav-id') ?? ''),
  )
}

export const test = base
export { expect }

/**
 * Fill an input and check the value sticks. A freshly mounted react-hook-form field can drop a
 * value typed in the first few milliseconds (a re-render re-attaches the field's ref and writes
 * the stored value back). No person types that fast; Playwright does, so retry until it holds.
 */
export async function fillStable(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true })
  await expect(async () => {
    await input.fill(value)
    await page.waitForTimeout(150)
    await expect(input).toHaveValue(value, { timeout: 100 })
  }).toPass({ timeout: 10_000 })
}
