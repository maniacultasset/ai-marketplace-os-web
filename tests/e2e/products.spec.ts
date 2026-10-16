import type { APIRequestContext, Page } from '@playwright/test'
import { apiLogin, expect, fillStable, loginAs, test, USERS } from './fixtures'

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

/** POST /products response, skipping a 401 that the client answers with refresh + replay. */
const isCreateResponse = (r: { url(): string; status(): number; request(): { method(): string } }) =>
  r.url().endsWith('/api/v1/products') && r.request().method() === 'POST' && r.status() !== 401

async function fillBasics(page: Page, sku: string) {
  await fillStable(page, 'SKU', sku)
  await fillStable(page, 'Title', 'PW product')
  await fillStable(page, 'Category', 'kurtas')
}

async function addAttribute(page: Page, n: number, key: string, value: string, type?: 'number') {
  await page.getByRole('button', { name: 'Add attribute' }).click()
  await page.getByLabel(`Attribute ${n} key`).fill(key)
  if (type) {
    await page.getByRole('combobox', { name: `Attribute ${n} type` }).click()
    await page.getByRole('option', { name: type }).click()
  }
  await page.getByLabel(`Attribute ${n} value`).fill(value)
}

/** Fail the test if the page sends POST /products (client validation must block it). */
function forbidCreate(page: Page) {
  const state = { posted: false }
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/v1/products')) state.posted = true
  })
  return state
}

const fulfill422 = (details: { loc: (string | number)[]; msg: string }[]) => ({
  status: 422,
  headers: { 'content-type': 'application/json', 'X-Request-ID': 'pw-ref-422' },
  body: JSON.stringify({
    error: {
      type: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      status: 422,
      correlation_id: 'pw-ref-422',
      details,
    },
  }),
})

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
      await page.goto('/products/new')
      await expect(page.getByText("You don't have access to this page")).toBeVisible()
      await expect(page.getByLabel('SKU')).toHaveCount(0)
    }
  })

  test('operator creates a product: detail shows canonical attributes and the list updates', async ({ page }) => {
    const tokens = await loginAs(page, USERS.acme.operator, '/products')
    await expectFirstPage(page, tokens.access_token)
    const sku = `PW-${RUN}-1`

    await page.getByTestId('new-product').click()
    await expect(page).toHaveURL(/\/add$/)
    await page.goto('/products/new')
    await fillStable(page, 'SKU', sku)
    await page.getByLabel('Title').fill('PW Kurta')
    await page.getByLabel('Category').fill('kurtas')
    await page.getByRole('button', { name: 'Add attribute' }).click()
    await page.getByLabel('Attribute 1 key').fill('color')
    await page.getByLabel('Attribute 1 value').fill('navy blue')
    await page.getByRole('button', { name: 'Add attribute' }).click()
    await page.getByLabel('Attribute 2 key').fill('material')
    await page.getByLabel('Attribute 2 value').fill('organic cotton')
    await page.getByRole('button', { name: 'Add attribute' }).click()
    await page.getByLabel('Attribute 3 key').fill('gsm')
    await page.getByRole('combobox', { name: 'Attribute 3 type' }).click()
    await page.getByRole('option', { name: 'number' }).click()
    await page.getByLabel('Attribute 3 value').fill('180')

    const created = page.waitForResponse(isCreateResponse)
    await page.getByTestId('create-product').click()
    const res = await created
    expect(res.status()).toBe(201)
    const body = (await res.json()) as ProductOut
    // Aliases come back canonical; the number stays a number.
    expect(body).toMatchObject({ sku, title: 'PW Kurta', category: 'kurtas', status: 'draft' })
    expect(body.attributes).toEqual({ color: 'navy blue', fabric_type: 'organic cotton', gsm: 180 })

    await expect(page).toHaveURL(new RegExp(`/products/${body.id}$`))
    await expect(page.getByTestId('product-title')).toHaveText('PW Kurta')
    const attrs = page.getByTestId('product-attributes')
    await expect(attrs.locator('[data-attr-key="color"]')).toContainText('navy blue')
    await expect(attrs.locator('[data-attr-key="fabric_type"]')).toContainText('organic cotton')
    await expect(attrs.locator('[data-attr-key="gsm"]')).toContainText('180')
    await expect(attrs.locator('[data-attr-key="material"]')).toHaveCount(0)
    await expect(page.getByTestId('no-parent')).toBeVisible()

    // DB-backed: re-read through the API.
    const fresh = await page.request.get(`/api/v1/products/${body.id}`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    expect(fresh.status()).toBe(200)
    const stored = (await fresh.json()) as ProductOut
    expect(stored).toMatchObject({ sku, status: 'draft', category: 'kurtas' })
    expect(stored.attributes).toEqual({ color: 'navy blue', fabric_type: 'organic cotton', gsm: 180 })

    // List was invalidated: the new SKU is the newest row without a reload.
    await page.getByRole('link', { name: 'Products' }).first().click()
    await expect(page).toHaveURL(/\/products$/)
    const firstRow = page.getByRole('table', { name: 'Products' }).locator('tbody tr').first()
    await expect(firstRow.getByRole('link', { name: sku, exact: true })).toBeVisible()
  })

  test('duplicate SKU shows a field error and offers the existing product', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/products/new')
    await fillStable(page, 'SKU', 'KURTA-001')
    await page.getByLabel('Title').fill('Duplicate')
    await page.getByLabel('Category').fill('kurtas')
    const res = page.waitForResponse(isCreateResponse)
    await page.getByTestId('create-product').click()
    expect((await res).status()).toBe(409)
    await expect(page.getByText('This SKU already exists in this brand.')).toBeVisible()
    await expect(page.getByLabel('SKU')).toHaveAttribute('aria-invalid', 'true')
    await page.getByTestId('open-existing').click()
    await expect(page.getByTestId('product-sku')).toHaveText('KURTA-001')
  })

  test('unknown attribute key maps the 422 onto that row', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/products/new')
    await fillStable(page, 'SKU', `PW-${RUN}-unknown`)
    await page.getByLabel('Title').fill('Unknown attr')
    await page.getByLabel('Category').fill('kurtas')
    await page.getByRole('button', { name: 'Add attribute' }).click()
    await page.getByLabel('Attribute 1 key').fill('color')
    await page.getByLabel('Attribute 1 value').fill('red')
    await page.getByRole('button', { name: 'Add attribute' }).click()
    await page.getByLabel('Attribute 2 key').fill('not_a_fact')
    await page.getByLabel('Attribute 2 value').fill('x')
    const res = page.waitForResponse(isCreateResponse)
    await page.getByTestId('create-product').click()
    const r = await res
    expect(r.status()).toBe(422)
    expect(((await r.json()) as { error: { type: string } }).error.type).toBe('UNKNOWN_FACT_KEY')
    const row = page.getByTestId('attribute-row-1')
    await expect(row.getByText('Unknown attribute.')).toBeVisible()
    await expect(page.getByLabel('Attribute 2 key')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('Attribute 1 key')).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page).toHaveURL(/\/products\/new$/)
  })

  test('client validation blocks bad input without a request', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/products/new')
    let posted = false
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/v1/products')) posted = true
    })
    await fillStable(page, 'SKU', 'HAS SPACE')
    await page.getByLabel('Category').fill('Kurtas')
    await page.getByRole('button', { name: 'Add attribute' }).click()
    await page.getByLabel('Attribute 1 key').fill('Bad-Key')
    await page.getByRole('combobox', { name: 'Attribute 1 type' }).click()
    await page.getByRole('option', { name: 'number' }).click()
    await page.getByLabel('Attribute 1 value').fill('abc')
    await page.getByTestId('create-product').click()
    await expect(page.getByText('No spaces or "]" allowed.')).toBeVisible()
    await expect(page.getByText('Enter a title.')).toBeVisible()
    await expect(page.getByText(/2-64 lowercase letters/)).toBeVisible()
    await expect(page.getByText(/start with a letter/)).toBeVisible()
    await expect(page.getByText('Enter a finite number.')).toBeVisible()
    expect(posted).toBe(false)
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
    await expect(alert).toContainText('Something went wrong', { timeout: 20_000 })
    await expect(alert.getByTestId('error-reference')).toHaveText('pw-ref-500')
    fail = false
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expectFirstPage(page, access_token)
  })

  test('title counter is described by the input, not announced on every keystroke', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/products/new')
    const title = page.getByLabel('Title')
    await title.fill('Kurta')
    const counter = page.locator('#title-count')
    await expect(counter).toHaveText('5/500')
    await expect(counter).not.toHaveAttribute('aria-live', /.*/)
    await expect(page.locator('[aria-live]').filter({ hasText: '/500' })).toHaveCount(0)
    await expect(title).toHaveAttribute('aria-describedby', /title-count/)
  })

  test('adding attribute rows back to back adds a row on every click', async ({ page }) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      if (width === 375) await loginAs(page, USERS.acme.operator, '/products/new')
      else await page.reload()
      const add = page.getByRole('button', { name: 'Add attribute' })
      for (let n = 1; n <= 3; n++) {
        // A real pointer click at the button's current centre (mousedown blurs the focused new key input).
        await add.scrollIntoViewIfNeeded()
        const box = (await add.boundingBox())!
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await expect(page.getByLabel(`Attribute ${n} key`)).toBeFocused()
      }
      await expect(page.locator('[data-testid^="attribute-row-"]')).toHaveCount(3)
      await expect(page.getByText('3/200')).toBeVisible()
      // Untouched empty rows are not flagged while the user is still adding rows.
      await expect(page.getByText('Enter a key.')).toHaveCount(0)
      // Errors still show on submit.
      await page.getByTestId('create-product').click()
      await expect(page.getByTestId('attribute-row-0').getByText('Enter a key.')).toBeVisible()
    }
  })

  test('number attributes accept decimals only and keep big integers exact', async ({ page }) => {
    const tokens = await loginAs(page, USERS.acme.operator, '/products/new')
    const guard = forbidCreate(page)
    await fillBasics(page, `PW-${RUN}-num`)
    await addAttribute(page, 1, 'gsm', '0x10', 'number')
    for (const bad of ['0x10', '0b11', '0o7', '1e400', 'Infinity', '+5', '.5', '1_000']) {
      await page.getByLabel('Attribute 1 value').fill(bad)
      await page.getByTestId('create-product').click()
      await expect(page.getByTestId('attribute-row-0').getByText('Enter a finite number.')).toBeVisible()
    }
    expect(guard.posted).toBe(false)

    const big = '12345678901234567890'
    await page.getByLabel('Attribute 1 value').fill(big)
    const created = page.waitForResponse(isCreateResponse)
    await page.getByTestId('create-product').click()
    const res = await created
    expect(res.status()).toBe(201)
    // Sent and stored digit for digit (a JS number would round to 12345678901234567000).
    // Chromium may not expose a streamed request body (postData null); the stored-text check below
    // proves the digits reached the backend either way.
    const sent = res.request().postData()
    if (sent !== null) expect(sent).toContain(`"gsm":${big}`)
    const { id } = (await res.json()) as ProductOut
    const stored = await page.request.get(`/api/v1/products/${id}`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    expect(await stored.text()).toContain(`"gsm":${big}`)
    // The detail page prints the stored digits, not the rounded JS number (12345678901234567000).
    await expect(page).toHaveURL(new RegExp(`/products/${id}$`))
    const gsmRow = page.getByTestId('product-attributes').locator('[data-attr-key="gsm"]')
    await expect(gsmRow).toContainText(big)
    // Same after a fresh GET (not the create response seeded into the cache).
    await page.reload()
    await expect(gsmRow).toContainText(big)
    await expect(gsmRow).not.toContainText('12345678901234567000')
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

  test('alias and non-attribute keys are reported on the key, not the value', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/products/new')
    const guard = forbidCreate(page)
    await fillBasics(page, `PW-${RUN}-alias`)
    await addAttribute(page, 1, 'material', 'cotton')
    await addAttribute(page, 2, 'fabric_type', 'silk')
    await page.getByTestId('create-product').click()
    const row = page.getByTestId('attribute-row-1')
    await expect(row.getByText('Same attribute as "material" (both are saved as fabric_type).')).toBeVisible()
    await expect(page.getByLabel('Attribute 2 key')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('Attribute 2 value')).not.toHaveAttribute('aria-invalid', 'true')
    expect(guard.posted).toBe(false)

    // Server-side: a product field (brand_name) is rejected under that key without a union variant.
    await page.getByRole('button', { name: 'Remove attribute 2' }).click()
    await page.getByLabel('Attribute 1 key').fill('brand_name')
    const res = page.waitForResponse(isCreateResponse)
    await page.getByTestId('create-product').click()
    const r = await res
    expect(r.status()).toBe(422)
    const first = page.getByTestId('attribute-row-0')
    await expect(first.getByText("This key can't be saved as a product attribute.")).toBeVisible()
    await expect(page.getByLabel('Attribute 1 key')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('Attribute 1 value')).not.toHaveAttribute('aria-invalid', 'true')
    await expect(first.getByText('Invalid value.')).toHaveCount(0)
  })

  test('422 details with no matching field are still shown', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/products/new')
    const replies = [
      fulfill422([{ loc: ['body', 'attributes'], msg: 'Dictionary should have at most 200 items.' }]),
      fulfill422([{ loc: ['body', 'attributes', 'gsm', 'bool'], msg: 'Input should be a valid boolean' }]),
    ]
    await page.route('**/api/v1/products', (route) =>
      route.request().method() === 'POST' ? route.fulfill(replies.shift()!) : route.continue(),
    )
    await fillBasics(page, `PW-${RUN}-422`)
    await addAttribute(page, 1, 'gsm', '180', 'number')

    await page.getByTestId('create-product').click()
    await expect(page.getByText('Dictionary should have at most 200 items.')).toBeVisible()

    // A value detail for another union member than the row's type goes to the error box.
    await page.getByTestId('create-product').click()
    const box = page.getByTestId('form-error')
    await expect(box).toContainText('Input should be a valid boolean')
    await expect(box.getByTestId('error-reference')).toHaveText('pw-ref-422')
  })

  test('a lost create response still refreshes the products list', async ({ page }) => {
    const { access_token } = await loginAs(page, USERS.acme.operator, '/products')
    await expectFirstPage(page, access_token)
    await page.goto('/products/new')
    const sku = `PW-${RUN}-lost`
    await page.route('**/api/v1/products', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      const res = await route.fetch()
      expect(res.status()).toBe(201)
      await route.abort('failed')
    })
    await fillBasics(page, sku)
    await page.getByTestId('create-product').click()
    await expect(page.getByTestId('form-error')).toContainText("Can't reach the server")
    await page.unroute('**/api/v1/products')
    await page.getByRole('link', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(/\/products$/)
    await expect(page.getByRole('link', { name: sku, exact: true })).toBeVisible()
  })

  test('a finished import refreshes a cached product detail', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAs(page, USERS.bharat.operator, '/imports/new')
    const sku = `PW-${RUN}-imp`
    const upload = async (title: string) => {
      const csv = `seller_sku,product_name,category,main_image\n${sku},${title},home_decor_lamps,https://cdn.example.com/pw/${RUN}.jpg\n`
      await page
        .getByLabel('CSV file', { exact: true })
        .setInputFiles({ name: `pw-${RUN}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) })
      await page.getByRole('button', { name: 'Upload and import' }).click()
      await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}\?job=/)
      await expect(page.getByTestId('job-progress')).toHaveAttribute('data-status', 'succeeded', { timeout: 60_000 })
    }
    await upload(`PW lamp ${RUN} v1`)
    // Cache the detail page (staleTime 30s), all in-app so the cache survives.
    await page.getByRole('link', { name: 'Products' }).first().click()
    await page.getByRole('link', { name: sku, exact: true }).click()
    await expect(page.getByTestId('product-title')).toHaveText(`PW lamp ${RUN} v1`)

    await page.getByRole('link', { name: 'Imports' }).first().click()
    // The imports page's create link (its label is owned by the imports feature).
    await page.locator('main a[href="/imports/new"]').first().click()
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
    await expect(page.getByRole('tooltip')).toHaveText(/\d{1,2} \w{3} \d{4}, \d{2}:\d{2}:\d{2}/)
  })
})
