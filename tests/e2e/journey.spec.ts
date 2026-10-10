/**
 * Cross-feature journey against the live backend (worker + fake marketplace running), tenant Acme.
 * Operator: sign in -> create a product -> list + detail -> CSV import -> job completes ->
 * imported products in the list -> rules dry run on one of them -> sign out.
 * Owner: connect Amazon through the fake OAuth -> team page lists members -> sign out.
 * No mocks; the only routing is the OAuth callback hop (the fake redirects to the API's default
 * port, so the callback is forwarded to the API under test unchanged, like marketplaces.spec.ts).
 */
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test'
import { API_URL, FAKE_MARKETPLACE_URL } from './env'
import { apiLogin, expect, fillStable, loginViaUi, test, USERS } from './fixtures'

const FAKE = FAKE_MARKETPLACE_URL
const RUN = Date.now().toString(36).toUpperCase()
const SELLER = `A1JRNY${RUN}`
const TERMINAL = /^(succeeded|partial|failed|cancelled|dead_letter)$/

const nav = (page: Page, name: string) =>
  page.locator('[data-sidebar="sidebar"]').getByRole('link', { name, exact: true })

async function revokeAcme(request: APIRequestContext) {
  const { access_token: token } = await apiLogin(request, USERS.acme.owner)
  const headers = { Authorization: `Bearer ${token}` }
  const res = await request.get(`${API_URL}/api/v1/marketplaces/accounts?limit=200`, { headers })
  expect(res.status()).toBe(200)
  for (const a of ((await res.json()) as { data: { id: string; status: string }[] }).data) {
    if (a.status === 'revoked') continue
    const r = await request.post(`${API_URL}/api/v1/marketplaces/accounts/${a.id}/revoke`, { headers })
    expect(r.status()).toBe(200)
  }
}

/** Real consent hop to the fake (with a per-run seller id), callback forwarded to the API under test. */
async function routeCallbackToApi(context: BrowserContext) {
  await context.route(`${FAKE}/*/authorize**`, async (route) => {
    const url = new URL(route.request().url())
    url.searchParams.set('seller', SELLER)
    const consent = await route.fetch({ url: url.toString(), maxRedirects: 0 })
    const location = consent.headers()['location']
    if (consent.status() !== 302 || !location) return route.fulfill({ response: consent })
    const cb = new URL(location)
    const callback = await route.fetch({ url: `${API_URL}${cb.pathname}${cb.search}`, method: 'GET', maxRedirects: 0 })
    await route.fulfill({ response: callback })
  })
}

async function signOut(page: Page) {
  await page.getByTestId('user-menu').click()
  await page.getByTestId('sign-out').click()
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByLabel('Email')).toBeVisible()
}

test.describe.configure({ mode: 'serial' })

test.describe('journey', () => {
  test.skip(!FAKE, 'E2E_FAKE_MARKETPLACE_URL is not set')
  test.beforeAll(async ({ request }) => {
    const fake = await request.get(`${FAKE}/healthz`)
    expect(fake.ok(), `fake marketplace must run on ${FAKE}`).toBeTruthy()
    await revokeAcme(request)
  })

  test.afterAll(async ({ request }) => {
    await revokeAcme(request)
  })

  test('operator: product, CSV import, dry run; owner: marketplace, team; sign out', async ({ page, context }) => {
    test.setTimeout(240_000)

    // Sign in through the real form.
    await page.goto('/login')
    await loginViaUi(page, USERS.acme.operator)
    await expect(page.getByTestId('user-menu')).toBeVisible()

    // Create a product.
    const sku = `JRNY-${RUN}-1`
    await nav(page, 'Products').click()
    await expect(page.getByRole('table', { name: 'Products' })).toBeVisible()
    await page.getByTestId('new-product').click()
    await fillStable(page, 'SKU', sku)
    await fillStable(page, 'Title', 'Journey cotton kurta')
    await fillStable(page, 'Category', 'kurtas')
    const created = page.waitForResponse(
      (r) => r.url().endsWith('/api/v1/products') && r.request().method() === 'POST' && r.status() !== 401,
    )
    await page.getByTestId('create-product').click()
    expect((await created).status()).toBe(201)
    await expect(page.getByTestId('product-title')).toHaveText('Journey cotton kurta')
    await expect(page.getByTestId('product-sku')).toHaveText(sku)

    // ...and it is in the list (newest first) without a reload.
    await nav(page, 'Products').click()
    const products = page.getByRole('table', { name: 'Products' })
    await expect(products.getByRole('link', { name: sku, exact: true })).toBeVisible()

    // Upload a CSV import and watch the job finish.
    const importSkus = [`JRNY-${RUN}-A`, `JRNY-${RUN}-B`]
    const csv = [
      'seller_sku,product_name,category,color_name,main_image',
      `${importSkus[0]},Journey indigo kurta set,ethnic_wear_kurta_sets,indigo,https://cdn.example.com/j/${RUN}-a.jpg`,
      `${importSkus[1]},Journey rust kurta set,ethnic_wear_kurta_sets,rust,https://cdn.example.com/j/${RUN}-b.jpg`,
    ].join('\n')
    await nav(page, 'Imports').click()
    await page.getByRole('link', { name: 'Import CSV' }).first().click()
    await expect(page).toHaveURL(/\/imports\/new$/)
    await page
      .getByLabel('CSV file', { exact: true })
      .setInputFiles({ name: `journey-${RUN}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) })
    const bulk = page.waitForResponse((r) => r.url().endsWith('/api/v1/products/bulk') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Upload and import' }).click()
    expect((await bulk).status()).toBe(202)
    await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}\?job=/)
    const progress = page.getByTestId('job-progress')
    await expect(progress).toBeVisible()
    await expect(progress).toHaveAttribute('data-status', TERMINAL, { timeout: 90_000 })
    await expect(progress).toHaveAttribute('data-status', 'succeeded')
    await expect(page.getByTestId('count-imported')).toHaveText('2')
    await expect(page.getByTestId('count-failed')).toHaveText('0')

    // Imported products appear in the list.
    await nav(page, 'Products').click()
    for (const s of importSkus) await expect(products.getByRole('link', { name: s, exact: true })).toBeVisible()

    // Rules dry run against one of them, from its detail page.
    await products.getByRole('link', { name: importSkus[0], exact: true }).click()
    await expect(page.getByTestId('product-title')).toHaveText('Journey indigo kurta set')
    await page.getByTestId('check-rules').click()
    await expect(page).toHaveURL(/\/rules\/check\?.*product=/)
    await expect(page.getByTestId('draft-title')).toHaveValue('Journey indigo kurta set')
    await expect(page.getByLabel('Category')).toHaveValue('ethnic_wear_kurta_sets')
    await page.locator('#marketplace').click()
    await page.getByRole('option', { name: 'Amazon', exact: true }).click()
    // Products carry no bullets or description; the draft needs them.
    await page.getByTestId('draft-bullet-0').fill('Soft cotton kurta with matching pants')
    await page.getByTestId('draft-description').fill('An indigo cotton kurta set for everyday wear.')
    const dry = page.waitForResponse((r) => r.url().endsWith('/api/v1/rules/dry-run'))
    await page.getByTestId('run-dry-run').click()
    const dryRes = await dry
    expect(dryRes.status()).toBe(200)
    const verdict = (await dryRes.json()) as { passed: boolean; report: { errors: unknown[] } }
    await expect(page.getByTestId('dry-run-verdict')).toHaveText(verdict.passed ? 'Pass' : 'Fail')
    await expect(page.getByTestId('dry-run-issue')).toHaveCount(verdict.report.errors.length)

    await signOut(page)

    // Owner connects Amazon through the fake OAuth.
    await routeCallbackToApi(context)
    await loginViaUi(page, USERS.acme.owner)
    await expect(page.getByTestId('user-menu')).toBeVisible()
    await nav(page, 'Marketplaces').click()
    const card = page.getByTestId('marketplace-card-amazon')
    await expect(card.getByTestId('account-status')).toHaveText('Not connected')
    await card.getByRole('button', { name: 'Connect Amazon' }).click()
    const success = page.getByTestId('connect-success')
    await expect(success).toBeVisible({ timeout: 25_000 })
    await expect(success.getByTestId('seller-id')).toHaveText(SELLER)
    await expect(success.getByTestId('account-status')).toHaveText('Active')
    await page.getByRole('link', { name: 'View marketplaces' }).click()
    await expect(card).toHaveAttribute('data-status', 'active')

    // Team page shows the members.
    await nav(page, 'Team').click()
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()
    const emails = page.getByTestId('member-email')
    await expect(emails).toHaveCount(4)
    expect((await emails.allTextContents()).sort()).toEqual([...Object.values(USERS.acme)].sort())

    await signOut(page)
  })
})
