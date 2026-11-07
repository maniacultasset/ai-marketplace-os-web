import type { APIRequestContext, Page } from '@playwright/test'
import { apiLogin, expect, loginAs, test, USERS } from './fixtures'

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`

interface ProductOut {
  id: string
  sku: string
  title: string
  status: string
  category: string
  attributes: Record<string, unknown>
  parent_product_id: string | null
}

async function apiProducts(request: APIRequestContext, token: string) {
  const all: ProductOut[] = []
  let cursor: string | null = null
  do {
    const res = await request.get('/api/v1/products', {
      params: { limit: 200, ...(cursor ? { cursor } : {}) },
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { data: ProductOut[]; page: { next_cursor: string | null; has_more: boolean } }
    all.push(...body.data)
    cursor = body.page.has_more ? body.page.next_cursor : null
  } while (cursor)
  return all
}

/** The first page the app shows (limit 50, newest first) is exactly the API's first page. */
async function expectFirstPage(page: Page, token: string) {
  const res = await page.request.get('/api/v1/products', {
    params: { limit: 50 },
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(200)
  // The table lists styles and standalone products; variants are counted under their style.
  const skus = ((await res.json()) as { data: { sku: string; parent_product_id: string | null }[] }).data
    .filter((p) => !p.parent_product_id)
    .map((p) => p.sku)
  expect(skus.length).toBeGreaterThan(0)
  const table = page.getByRole('table', { name: 'Products' })
  await expect(table.getByRole('link', { name: skus[0], exact: true })).toBeVisible()
  await expect(table.getByRole('link', { name: skus[skus.length - 1], exact: true })).toBeVisible()
}

test.describe('products', () => {
  test('every role sees the list with the seeded products and no sort controls', async ({ page }) => {
    for (const email of Object.values(USERS.acme)) {
      const { access_token } = await loginAs(page, email, '/products')
      const table = page.getByRole('table', { name: 'Products' })
      await expectFirstPage(page, access_token)
      for (const header of ['Product', 'SKU', 'Overall']) {
        await expect(table.getByRole('columnheader', { name: header, exact: true })).toBeVisible()
      }
      await expect(table.locator('[aria-sort]')).toHaveCount(0)
      await page.evaluate(() => localStorage.removeItem('mkos.rt'))
    }
  })

  test('create is gated by product:import: operator sees it, reviewer and admin do not', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/products')
    await expect(page.getByTestId('new-product')).toBeVisible()

    for (const email of [USERS.acme.reviewer, USERS.acme.admin]) {
      const { access_token } = await loginAs(page, email, '/products')
      await expectFirstPage(page, access_token)
      await expect(page.getByTestId('new-product')).toHaveCount(0)
      // The old single-product form redirects to the guided form, which needs product:import.
      await page.goto('/products/new')
      await expect(page).toHaveURL(/\/add\/guided$/)
      await expect(page.getByText("You don't have access to this page")).toBeVisible()
      await expect(page.getByLabel('SKU', { exact: true })).toHaveCount(0)
    }
  })

  test('the table reads every page and counts products and variants from the API', async ({ page }) => {
    const tokens = await loginAs(page, USERS.acme.reviewer, '/products')
    const all = await apiProducts(page.request, tokens.access_token)
    const styles = all.filter((p) => !p.parent_product_id)
    const rows = page.getByRole('table', { name: 'Products' }).locator('tbody tr')
    await expect(rows).toHaveCount(styles.length)
    const variants = all.length - styles.length
    await expect(page.getByTestId('products-count')).toHaveText(
      `${styles.length} ${styles.length === 1 ? 'product' : 'products'} · ${variants} ${variants === 1 ? 'variant' : 'variants'}`,
    )
  })

  test('unknown or malformed product id shows not found', async ({ page }) => {
    await loginAs(page, USERS.acme.reviewer, '/products/00000000-0000-4000-8000-000000000000')
    await expect(page.getByText('Product not found')).toBeVisible()
    await page.goto('/products/not-a-uuid')
    await expect(page.getByText('Product not found')).toBeVisible()
    await page.getByRole('link', { name: 'Back to products' }).click()
    await expect(page).toHaveURL(/\/products$/)
  })

  test('another brand cannot open an acme product', async ({ page }) => {
    const acme = await apiLogin(page.request, USERS.acme.reviewer)
    const kurta = (await apiProducts(page.request, acme.access_token)).find((p) => p.sku === 'KURTA-001')!
    await loginAs(page, USERS.bharat.reviewer, `/products/${kurta.id}`)
    await expect(page.getByText('Product not found')).toBeVisible()
  })

  test('list shows an error state with a reference when the API fails, and recovers on retry', async ({ page }) => {
    const { access_token } = await loginAs(page, USERS.acme.reviewer, '/account')
    let fail = true
    await page.route('**/api/v1/products?*', async (route) => {
      if (!fail) return route.continue()
      await route.fulfill({
        status: 500,
        headers: { 'content-type': 'application/json', 'X-Request-ID': 'pw-ref-500' },
        body: JSON.stringify({
          error: { type: 'INTERNAL_ERROR', message: 'Internal error.', status: 500, correlation_id: 'pw-ref-500' },
        }),
      })
    })
    await page.getByRole('link', { name: 'Products' }).first().click()
    const alert = page.getByRole('table', { name: 'Products' }).getByRole('alert')
    await expect(alert).toContainText("We couldn't load this", { timeout: 20_000 })
    await expect(alert.getByTestId('error-reference')).toHaveText('pw-ref-500')
    fail = false
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expectFirstPage(page, access_token)
  })

  test('detail shows the family: parent link for a variant, variants for a style', async ({ page }) => {
    const tokens = await loginAs(page, USERS.acme.reviewer, '/account')
    const all = await apiProducts(page.request, tokens.access_token)
    const kurta = all.find((p) => p.sku === 'KURTA-001')!
    await page.goto(`/products/${kurta.id}`)
    await expect(page.getByTestId('product-sku')).toHaveText('KURTA-001')
    const family = page.getByTestId('product-family')
    if (kurta.parent_product_id) await expect(family.getByTestId('parent-link')).toBeVisible()
    else await expect(family.getByTestId('no-parent')).toBeVisible()

    const variant = all.find((p) => p.parent_product_id && all.some((q) => q.id === p.parent_product_id))
    if (variant) {
      const parent = all.find((q) => q.id === variant.parent_product_id)!
      await page.goto(`/products/${variant.id}`)
      const link = page.getByTestId('parent-link').getByRole('link')
      await expect(link).toContainText(parent.sku)
      await link.click()
      await expect(page.getByTestId('product-sku')).toHaveText(parent.sku)
      // A style with variants must not read as if it had none.
      if (!parent.parent_product_id) {
        const family = page.getByTestId('product-family')
        await expect(family.getByTestId('no-parent')).toHaveCount(0)
        await page.getByTestId('tab-variants').click()
        await expect(page.getByRole('table', { name: 'Variants' }).getByRole('link', { name: variant.sku, exact: true })).toBeVisible()
      }
    }
  })

  test('a finished import refreshes a cached product detail', async ({ page }) => {
    test.setTimeout(120_000)
    // Spreadsheet import lives under Add products (chooser -> Bulk upload, /add/bulk).
    await loginAs(page, USERS.bharat.operator, '/add/bulk')
    const sku = `PW-${RUN}-imp`
    const upload = async (title: string) => {
      const csv = `seller_sku,product_name,category,main_image\n${sku},${title},home_decor_lamps,https://cdn.example.com/pw/${RUN}.jpg\n`
      await page.getByTestId('bulk-next').click()
      await page
        .getByLabel('CSV file', { exact: true })
        .setInputFiles({ name: `pw-${RUN}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) })
      // The app's own job polling sees the import succeed.
      const succeeded = page.waitForResponse(
        async (r) =>
          /\/api\/v1\/jobs\/[0-9a-f-]{36}$/.test(r.url()) &&
          r.request().method() === 'GET' &&
          r.ok() &&
          ((await r.json()) as { status: string }).status === 'succeeded',
        { timeout: 60_000 },
      )
      await page.getByTestId('bulk-upload').click()
      await expect(page).toHaveURL(/\/add\/bulk\?import=[0-9a-f-]{36}/)
      await succeeded
      await expect(page.getByText('Sending opens once the import has run.')).toHaveCount(0)
    }
    await upload(`PW lamp ${RUN} v1`)
    // Cache the detail page (staleTime 30s), all in-app so the cache survives.
    await page.getByRole('link', { name: 'Products' }).first().click()
    await page.getByRole('link', { name: sku, exact: true }).click()
    await expect(page.getByTestId('product-title')).toHaveText(`PW lamp ${RUN} v1`)

    await page.getByRole('link', { name: 'Add products' }).first().click()
    await page.getByTestId('route-bulk').click()
    await page.getByTestId('add-continue').click()
    await expect(page).toHaveURL(/\/add\/bulk/)
    await upload(`PW lamp ${RUN} v2`)
    await page.getByRole('link', { name: 'Products' }).first().click()
    await page.getByRole('link', { name: sku, exact: true }).click()
    await expect(page.getByTestId('product-title')).toHaveText(`PW lamp ${RUN} v2`)
  })

  test('created and updated times are reachable by keyboard and show the exact time', async ({ page }) => {
    await loginAs(page, USERS.acme.reviewer, '/products')
    const sku = page.getByRole('table', { name: 'Products' }).locator('tbody tr').first().getByRole('link').first()
    await sku.focus()
    let reached = false
    // SKU link → marketplace status cells (each focusable for its tooltip) → Activity time.
    for (let i = 0; i < 12 && !reached; i++) {
      await page.keyboard.press('Tab')
      reached = await page.evaluate(() => document.activeElement?.tagName === 'TIME')
    }
    expect(reached).toBe(true)
    // The focused time names its exact time: as its description and as the open tooltip. The
    // status cells' tooltips passed on the way can still be fading out, so match by text.
    const exact = /\d{1,2} \w{3} \d{4}, \d{2}:\d{2}:\d{2}/
    await expect(page.locator('time:focus')).toHaveAccessibleDescription(exact)
    await expect(page.getByRole('tooltip').filter({ hasText: exact })).toBeVisible()
  })
})
