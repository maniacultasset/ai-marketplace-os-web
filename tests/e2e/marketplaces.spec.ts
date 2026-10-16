/**
 * Marketplace connections against the live backend and the backend's fake marketplace (no consent
 * UI: authorize answers 302 straight to the callback).
 *
 * Real browser round trip: FE Connect -> POST /marketplaces/connect -> browser to the fake's
 * /authorize -> 302 to the API callback -> 303 to /marketplaces/connected?pending=… -> confirm.
 *
 * The backend's OAuth redirect URI may point at a different port than E2E_API_URL, and the fake
 * checks it. Like the backend's scripts/e2e/marketplace_connect.sh, `routeCallbackToApi` sends the
 * callback hop to E2E_API_URL unchanged and hands back the API's own 303. Nothing is mocked.
 *
 * Tenant: Bharat Home (owner@bharat.test), so other feature specs on acme are untouched. Every
 * connection made here is revoked in beforeAll/afterAll.
 */
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { API_URL, ARTIFACTS, BACKEND_DIR, FAKE_MARKETPLACE_URL, resetRateLimits } from './env'
import { apiLogin, expect, loginAs, loginViaUi, test, USERS } from './fixtures'

const FAKE = FAKE_MARKETPLACE_URL
const LOGS = ARTIFACTS
mkdirSync(LOGS, { recursive: true })
/** The OAuth round trip is several hops through two local servers; allow it more than the default. */
const ROUND_TRIP = { timeout: 25_000 }
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(LOGS, `marketplaces-${name}.png`), fullPage: true })

type Account = {
  id: string
  marketplace: 'amazon' | 'flipkart'
  seller_id: string
  status: string
  expires_at: string | null
  needs_reconnect_since: string | null
}

async function ownerToken(request: APIRequestContext) {
  return (await apiLogin(request, USERS.bharat.owner)).access_token
}

async function listAccounts(request: APIRequestContext, token: string): Promise<Account[]> {
  const res = await request.get(`${API_URL}/api/v1/marketplaces/accounts?limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(200)
  return ((await res.json()) as { data: Account[] }).data
}

async function revokeAll(request: APIRequestContext, token: string) {
  for (const a of await listAccounts(request, token)) {
    if (a.status === 'revoked') continue
    const res = await request.post(`${API_URL}/api/v1/marketplaces/accounts/${a.id}/revoke`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
  }
}

/**
 * The browser's consent hop: the request to the fake's /authorize really goes to the fake; its
 * 302 points at the backend's configured redirect URI, so the callback is sent to E2E_API_URL
 * with the identical path and query, and the browser receives the API's own
 * 303 to the FE. (Playwright route handlers do not see redirect hops, hence both legs here.)
 */
async function routeCallbackToApi(context: BrowserContext) {
  await context.route(`${FAKE}/*/authorize**`, async (route) => {
    const consent = await route.fetch({ maxRedirects: 0 })
    const location = consent.headers()['location']
    if (consent.status() !== 302 || !location) return route.fulfill({ response: consent })
    const cb = new URL(location)
    const callback = await route.fetch({ url: `${API_URL}${cb.pathname}${cb.search}`, method: 'GET', maxRedirects: 0 })
    await route.fulfill({ response: callback })
  })
}

/** Remember every /marketplaces/connected?pending=… URL the browser lands on. */
function captureLandings(page: Page) {
  const urls: string[] = []
  page.on('request', (r) => {
    if (r.isNavigationRequest() && r.url().includes('/marketplaces/connected?pending=')) urls.push(r.url())
  })
  return urls
}

/** Run connect -> fake authorize -> API callback over HTTP only; returns the FE landing URL. */
async function pendingLandingViaHttp(request: APIRequestContext, token: string, marketplace: 'amazon' | 'flipkart') {
  const res = await request.post(`${API_URL}/api/v1/marketplaces/connect`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { marketplace },
  })
  expect(res.status()).toBe(200)
  const { authorize_url } = (await res.json()) as { authorize_url: string }
  const consent = await request.get(authorize_url, { maxRedirects: 0 })
  expect(consent.status()).toBe(302)
  const cb = new URL(consent.headers()['location']!)
  const callback = await request.get(`${API_URL}${cb.pathname}${cb.search}`, { maxRedirects: 0 })
  expect(callback.status()).toBe(303)
  return callback.headers()['location']!
}

/** The fake's test controls (fake_marketplace.py `POST /__control`); `expires_in: null` = its default. */
async function fakeControl(request: APIRequestContext, body: Record<string, unknown>) {
  const res = await request.post(`${FAKE}/__control`, { data: body })
  expect(res.status()).toBe(200)
}

/** Full connect over HTTP (connect -> fake -> callback -> confirm); returns the confirmed account. */
async function connectViaHttp(request: APIRequestContext, token: string, marketplace: 'amazon' | 'flipkart') {
  const landing = await pendingLandingViaHttp(request, token, marketplace)
  const pending = new URL(landing).searchParams.get('pending')
  const res = await request.post(`${API_URL}/api/v1/marketplaces/connect/confirm`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { pending },
  })
  expect(res.status()).toBe(200)
  return (await res.json()) as Account
}

/**
 * One pass of the worker's token refresh (the backend's one-shot entry), pointed at the fake.
 * Needs E2E_BACKEND_DIR; it reads the backend checkout, never writes it.
 */
const BACKEND = BACKEND_DIR
function refreshTokensOnce() {
  execFileSync(path.join(BACKEND, '.venv/bin/python'), ['-m', 'app.workers.oneshot', 'refresh_marketplace_tokens'], {
    cwd: BACKEND,
    stdio: 'pipe',
    timeout: 60_000,
    env: {
      ...process.env,
      APP_ROLE: 'worker',
      AMAZON_APP_ID: 'amzn1.sp.solution.REPLACE_ME',
      AMAZON_AUTHORIZE_URL: `${FAKE}/amazon/authorize`,
      AMAZON_LWA_TOKEN_URL: `${FAKE}/amazon/token`,
      FLIPKART_AUTHORIZE_URL: `${FAKE}/flipkart/authorize`,
      FLIPKART_TOKEN_URL: `${FAKE}/flipkart/token`,
    },
  })
}

test.describe.configure({ mode: 'serial' })

test.describe('marketplaces', () => {
  test.skip(!FAKE, 'E2E_FAKE_MARKETPLACE_URL is not set')
  test.beforeAll(async ({ request }) => {
    const fake = await request.get(`${FAKE}/healthz`)
    expect(fake.ok(), `fake marketplace must run on ${FAKE}`).toBeTruthy()
    await revokeAll(request, await ownerToken(request))
  })

  test.afterAll(async ({ request }) => {
    await revokeAll(request, await ownerToken(request))
  })

  test('owner connects Amazon through the fake marketplace; reloading the link is refused', async ({ page, context, request }) => {
    await routeCallbackToApi(context)
    const landings = captureLandings(page)
    await loginAs(page, USERS.bharat.owner, '/marketplaces')

    const card = page.getByTestId('marketplace-card-amazon')
    await expect(card).toHaveAttribute('data-status', 'none')
    await shot(page, 'list-disconnected')

    const authorize = page.waitForRequest((r) => r.url().startsWith(`${FAKE}/amazon/authorize?`))
    await card.getByRole('button', { name: 'Connect Amazon' }).click()
    const authorizeUrl = new URL((await authorize).url())
    expect(authorizeUrl.searchParams.get('application_id')).toBeTruthy()
    expect(authorizeUrl.searchParams.get('state')).toBeTruthy()

    // Landed on the FE route, confirmed, query stripped.
    const success = page.getByTestId('connect-success')
    await expect(success).toBeVisible(ROUND_TRIP)
    await expect(success).toContainText('Amazon connected')
    await expect(success.getByTestId('seller-id')).toHaveText('A1FAKESELLER')
    await expect(success.getByTestId('account-status')).toHaveText('Connected')
    await expect(page).toHaveURL(/\/marketplaces\/connected$/)
    expect(landings).toHaveLength(1)
    expect(new URL(landings[0]!).searchParams.get('pending')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    await shot(page, 'connect-success')

    // DB-backed: the API lists it active.
    const accounts = await listAccounts(request, await ownerToken(request))
    expect(accounts.find((a) => a.marketplace === 'amazon' && a.status === 'active')?.seller_id).toBe('A1FAKESELLER')

    // Back to the list: card + history row reflect it.
    await page.getByRole('link', { name: 'View marketplaces' }).click()
    await expect(card).toHaveAttribute('data-status', 'active')
    await expect(card.getByTestId('seller-id')).toHaveText('A1FAKESELLER')
    // p04 detail card: the connected account is selected by default.
    await expect(page.getByTestId('marketplace-detail').getByText('Token expires')).toBeVisible()
    const history = page.getByRole('table', { name: 'Marketplace connection history' })
    await expect(history.getByRole('row').filter({ hasText: 'A1FAKESELLER' }).filter({ hasText: 'Connected' })).toHaveCount(1)
    await shot(page, 'list-connected')

    // Reloading the landing URL re-confirms a used handle -> 409 OAUTH_STATE_INVALID panel.
    const confirmRes = page.waitForResponse((r) => r.url().endsWith('/api/v1/marketplaces/connect/confirm'))
    await page.goto(landings[0]!)
    const res = await confirmRes
    expect(res.status()).toBe(409)
    const invalid = page.getByTestId('connect-link-invalid')
    await expect(invalid).toContainText('This connection link expired or was already used.')
    await expect(invalid.getByTestId('error-reference')).toHaveText(res.headers()['x-request-id']!)
    await expect(page).toHaveURL(/\/marketplaces\/connected$/)
    await shot(page, 'link-used')
  })

  test('a malformed pending handle is rejected client-side without calling confirm', async ({ page }) => {
    let confirmCalls = 0
    page.on('request', (r) => {
      if (r.url().endsWith('/marketplaces/connect/confirm')) confirmCalls += 1
    })
    await loginAs(page, USERS.bharat.owner, '/marketplaces/connected?pending=not-a-real-handle')
    await expect(page.getByText('This connection link is not valid')).toBeVisible()
    await page.goto('/marketplaces/connected')
    await expect(page.getByText('No connection to confirm')).toBeVisible()
    expect(confirmCalls).toBe(0)
  })

  test('reviewer sees accounts but no Connect/Revoke, and cannot confirm', async ({ page, request }) => {
    await loginAs(page, USERS.bharat.reviewer, '/marketplaces')
    const amazon = page.getByTestId('marketplace-card-amazon')
    await expect(amazon).toHaveAttribute('data-status', 'active')
    await expect(amazon.getByTestId('seller-id')).toHaveText('A1FAKESELLER')
    await page.getByRole('button', { name: 'Show Flipkart details' }).click()
    await expect(page.getByTestId('marketplace-detail')).toContainText('An owner or admin can connect Flipkart.')
    await expect(page.getByRole('button', { name: /Connect|Reconnect|Revoke/ })).toHaveCount(0)
    await shot(page, 'reviewer')

    // Landing on a confirm link as a reviewer: no confirm call, permission panel.
    await page.goto(`/marketplaces/connected?pending=${'a'.repeat(43)}`)
    await expect(page.getByText('Only owners and admins can connect marketplaces')).toBeVisible()

    // Server enforces it too.
    const token = (await apiLogin(request, USERS.bharat.reviewer)).access_token
    const res = await request.post(`${API_URL}/api/v1/marketplaces/connect`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { marketplace: 'flipkart' },
    })
    expect(res.status()).toBe(403)
  })

  test('admin sees Connect and Revoke', async ({ page }) => {
    await loginAs(page, USERS.bharat.admin, '/marketplaces')
    await expect(page.getByTestId('marketplace-detail').getByRole('button', { name: 'Revoke' })).toBeVisible()
    await expect(page.getByTestId('marketplace-card-flipkart').getByRole('button', { name: 'Connect Flipkart' })).toBeVisible()
  })

  test('another seller while Amazon is live: conflict panel, then Try again works after revoking', async ({
    page,
    context,
    request,
  }) => {
    await routeCallbackToApi(context)
    const tokens = await loginAs(page, USERS.bharat.owner, '/marketplaces')
    await expect(page.getByTestId('marketplace-card-amazon')).toHaveAttribute('data-status', 'active')

    // The card offers no Connect while Amazon is live, so start the flow as the same user via the API
    // and let the browser walk the consent + callback hops. For Amazon the seller comes from the
    // callback's selling_partner_id, which the fake takes from its `seller=` control parameter.
    const res = await request.post(`${API_URL}/api/v1/marketplaces/connect`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      data: { marketplace: 'amazon' },
    })
    expect(res.status()).toBe(200)
    const { authorize_url } = (await res.json()) as { authorize_url: string }
    await page.goto(`${authorize_url}&seller=B1OTHER`)

    const conflict = page.getByTestId('connect-conflict')
    await expect(conflict).toContainText('This seller account already has a live connection; revoke it first.', ROUND_TRIP)
    await expect(conflict.getByTestId('error-reference')).toBeVisible()
    await shot(page, 'conflict')

    // Revoke the live account, then the same handle confirms the new seller.
    await revokeAll(request, tokens.access_token)
    await conflict.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByTestId('connect-success').getByTestId('seller-id')).toHaveText('B1OTHER')
    const live = (await listAccounts(request, tokens.access_token)).filter((a) => a.status !== 'revoked')
    expect(live.map((a) => `${a.marketplace}:${a.seller_id}`)).toEqual(['amazon:B1OTHER'])
  })

  test('owner revokes Amazon with confirmation; card offers Connect again', async ({ page, request }) => {
    await loginAs(page, USERS.bharat.owner, '/marketplaces')
    const card = page.getByTestId('marketplace-card-amazon')
    await expect(card).toHaveAttribute('data-status', 'active')

    const detail = page.getByTestId('marketplace-detail')
    await expect(detail).toHaveAttribute('data-marketplace', 'amazon')
    await detail.getByRole('button', { name: 'Revoke' }).click()
    const dialog = page.getByTestId('revoke-dialog')
    await expect(dialog).toContainText('This deletes the stored tokens')
    await expect(dialog).toContainText('Seller Central')
    await shot(page, 'revoke-dialog')

    // Cancel keeps it.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(card).toHaveAttribute('data-status', 'active')

    await detail.getByRole('button', { name: 'Revoke' }).click()
    const revokeRes = page.waitForResponse((r) => /\/marketplaces\/accounts\/[^/]+\/revoke$/.test(r.url()))
    await page.getByTestId('revoke-dialog').getByRole('button', { name: 'Revoke' }).click()
    expect((await revokeRes).status()).toBe(200)
    await expect(page.getByText('Amazon connection revoked')).toBeVisible()
    await expect(card).toHaveAttribute('data-status', 'none')
    await expect(card.getByRole('button', { name: 'Connect Amazon' })).toBeVisible()
    await expect(page.getByTestId('marketplace-detail')).toContainText('was revoked')

    const history = page.getByRole('table', { name: 'Marketplace connection history' })
    // Newest first: the row just revoked is the first B1OTHER row (earlier runs leave revoked rows).
    await expect(history.getByRole('row').filter({ hasText: 'B1OTHER' }).first().getByTestId('account-status')).toHaveText('Revoked')
    const accounts = await listAccounts(request, await ownerToken(request))
    expect(accounts.filter((a) => a.marketplace === 'amazon' && a.status !== 'revoked')).toHaveLength(0)
  })

  test('owner connects Flipkart; seller comes from the token reply', async ({ page, context, request }) => {
    await routeCallbackToApi(context)
    await loginAs(page, USERS.bharat.owner, '/marketplaces')
    const authorize = page.waitForRequest((r) => r.url().startsWith(`${FAKE}/flipkart/authorize?`))
    await page.getByTestId('marketplace-card-flipkart').getByRole('button', { name: 'Connect Flipkart' }).click()
    const url = new URL((await authorize).url())
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')

    await expect(page.getByTestId('connect-success')).toContainText('Flipkart connected', ROUND_TRIP)
    await expect(page.getByTestId('connect-success').getByTestId('seller-id')).toHaveText('A1FAKESELLER')
    const accounts = await listAccounts(request, await ownerToken(request))
    expect(accounts.find((a) => a.marketplace === 'flipkart' && a.status === 'active')?.seller_id).toBe('A1FAKESELLER')
  })

  test('signed-out landing on the confirm link: sign in, come back, confirm', async ({ browser, request }) => {
    const token = await ownerToken(request)
    await revokeAll(request, token)
    const landing = await pendingLandingViaHttp(request, token, 'amazon')
    expect(landing).toMatch(/\/marketplaces\/connected\?pending=[A-Za-z0-9_-]{43}$/)

    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(landing)
    await expect(page).toHaveURL(/\/login\?redirect=/)
    resetRateLimits() // the UI login below counts against the 5/min per-email limit
    await loginViaUi(page, USERS.bharat.owner)
    await expect(page.getByTestId('connect-success')).toContainText('Amazon connected', ROUND_TRIP)
    await expect(page).toHaveURL(/\/marketplaces\/connected$/)
    await context.close()
  })

  test('accounts list failure shows the error state and recovers on Retry', async ({ page }) => {
    await loginAs(page, USERS.bharat.owner, '/account')
    await page.route('**/api/v1/marketplaces/accounts**', (route) => route.abort('connectionrefused'))
    await page.getByTestId('main-nav').getByRole('link', { name: 'Marketplaces' }).click()
    await expect(page.getByText("Couldn't load marketplace accounts")).toBeVisible({ timeout: 20_000 })
    await shot(page, 'error')
    await page.unroute('**/api/v1/marketplaces/accounts**')
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByTestId('marketplace-card-amazon')).toHaveAttribute('data-status', 'active')
  })

  test('screens: 375px', async ({ page }) => {
    await loginAs(page, USERS.bharat.owner, '/marketplaces')
    await expect(page.getByTestId('marketplace-card-amazon')).toHaveAttribute('data-status', 'active')
    await page.setViewportSize({ width: 375, height: 812 })
    await shot(page, 'mobile-light')
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(hasHScroll).toBe(false)
  })
  test('a live account older than the first History page still drives its card; Load more changes nothing', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    let token = await ownerToken(request)
    await revokeAll(request, token)

    // Flipkart live with a token that is already past its expiry (the card and the table mark it).
    await fakeControl(request, { expires_in: 1 })
    let flipkart: Account
    try {
      flipkart = await connectViaHttp(request, token, 'flipkart')
    } finally {
      await fakeControl(request, { expires_in: null })
    }

    // Push it off the first History page (50 rows): newer Amazon connect + revoke rows.
    for (let i = 0; i < 50; i += 1) {
      if (i % 8 === 0) {
        resetRateLimits()
        token = await ownerToken(request)
      }
      const a = await connectViaHttp(request, token, 'amazon')
      const res = await request.post(`${API_URL}/api/v1/marketplaces/accounts/${a.id}/revoke`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(res.status()).toBe(200)
    }
    resetRateLimits()
    const all = await listAccounts(request, await ownerToken(request))
    expect(all.findIndex((a) => a.id === flipkart.id)).toBeGreaterThanOrEqual(50)

    await loginAs(page, USERS.bharat.owner, '/marketplaces')
    const card = page.getByTestId('marketplace-card-flipkart')
    await expect(card).toHaveAttribute('data-status', 'active')
    await expect(card.getByTestId('seller-id')).toHaveText(flipkart.seller_id)
    await expect(card.getByRole('button', { name: /Connect/ })).toHaveCount(0)
    // The connected marketplace is selected by default; its detail card carries the actions.
    const detail = page.getByTestId('marketplace-detail')
    await expect(detail).toHaveAttribute('data-marketplace', 'flipkart')
    await expect(detail.getByRole('button', { name: 'Revoke' })).toBeVisible()
    await expect(detail).toContainText(/Expired (just now|.+ ago)/)
    await expect(page.getByTestId('marketplace-card-amazon')).toHaveAttribute('data-status', 'none')
    const cardText = await detail.innerText()

    // History: first page only, so the Flipkart row is not there yet.
    const history = page.getByRole('table', { name: 'Marketplace connection history' })
    const bodyRows = history.locator('tbody tr')
    await expect(bodyRows).toHaveCount(50)
    await expect(bodyRows.filter({ hasText: 'Flipkart' }).filter({ hasText: 'Connected' })).toHaveCount(0)
    await page.getByTestId('load-more').click()
    await expect.poll(() => bodyRows.count()).toBeGreaterThan(50)
    const row = bodyRows.filter({ hasText: 'Flipkart' }).filter({ hasText: 'Connected' })
    await expect(row).toHaveCount(1)
    await expect(row.getByTestId('token-expiry')).toHaveAttribute('data-expired', 'true')
    await expect(row.getByTestId('token-expiry')).toContainText('Expired')
    await shot(page, 'history-load-more')

    // The cards do not depend on how far History has been paged.
    expect(await detail.innerText()).toBe(cardText)
  })

  test('a rejected token refresh: needs-reconnect card and row, admin reconnects the same account', async ({
    page,
    context,
    request,
  }) => {
    test.skip(!BACKEND, 'E2E_BACKEND_DIR is not set')
    test.setTimeout(120_000)
    const token = await ownerToken(request)
    await revokeAll(request, token)

    // Amazon live with a token inside the refresh window; the fake rejects the next refresh.
    await fakeControl(request, { expires_in: 600 })
    let account: Account
    try {
      account = await connectViaHttp(request, token, 'amazon')
    } finally {
      await fakeControl(request, { expires_in: null })
    }
    await expect
      .poll(
        async () => {
          await fakeControl(request, { next_refresh: 'invalid_grant' })
          refreshTokensOnce()
          return (await listAccounts(request, token)).find((a) => a.id === account.id)?.status
        },
        { timeout: 60_000, intervals: [500] },
      )
      .toBe('needs_reconnect')
    await fakeControl(request, { next_refresh: 'ok' })

    await routeCallbackToApi(context)
    await loginAs(page, USERS.bharat.admin, '/marketplaces')
    const card = page.getByTestId('marketplace-card-amazon')
    await expect(card).toHaveAttribute('data-status', 'needs_reconnect')
    await expect(card.getByTestId('account-status')).toHaveText('Reconnect needed')
    const detail = page.getByTestId('marketplace-detail')
    const alert = detail.getByRole('status').filter({ hasText: 'rejected the token refresh' })
    await expect(alert).toContainText(/Amazon rejected the token refresh (just now|.+ ago)\./)
    await expect(alert).toContainText(`Reconnect with the same seller account (${account.seller_id}); a different seller is refused.`)
    const history = page.getByRole('table', { name: 'Marketplace connection history' })
    const row = history.locator('tbody tr').filter({ hasText: 'Reconnect needed' })
    await expect(row).toHaveCount(1)
    await expect(row.getByTestId('reconnect-since')).toHaveText(/^since (just now|.+ ago)$/)
    await shot(page, 'needs-reconnect')

    // Reconnect as admin through the fake: the same account comes back active.
    const authorize = page.waitForRequest((r) => r.url().startsWith(`${FAKE}/amazon/authorize?`))
    await detail.getByRole('button', { name: 'Reconnect' }).click()
    await authorize
    const success = page.getByTestId('connect-success')
    await expect(success).toContainText('Amazon connected', ROUND_TRIP)
    await expect(success.getByTestId('account-status')).toHaveText('Connected')
    const after = (await listAccounts(request, token)).filter((a) => a.marketplace === 'amazon' && a.status !== 'revoked')
    expect(after.map((a) => [a.id, a.status])).toEqual([[account.id, 'active']])

    await page.getByRole('link', { name: 'View marketplaces' }).click()
    await expect(card).toHaveAttribute('data-status', 'active')
    await expect(card.getByRole('button', { name: 'Reconnect' })).toHaveCount(0)
    await expect(history.locator('tbody tr').filter({ hasText: 'Reconnect needed' })).toHaveCount(0)
  })
})
