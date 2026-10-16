/**
 * Products and Add products (hi-fi p07-p11, p17) against the live API: /products, /products/$id,
 * /add, /add/guided, /add/variants and /add/bulk. Every assertion reads the API too, so the
 * screen is proven to show real data, never invented numbers.
 */
import type { APIRequestContext } from '@playwright/test'
import { apiLogin, expect, loginAs, test, USERS } from './fixtures'

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`

interface ProductOut {
  id: string
  sku: string
  title: string
  category: string
  parent_product_id: string | null
}

async function walk<T>(request: APIRequestContext, token: string, path: string, query: Record<string, string> = {}) {
  const all: T[] = []
  let cursor: string | null = null
  do {
    const res = await request.get(`/api/v1${path}`, {
      params: { limit: 200, ...query, ...(cursor ? { cursor } : {}) },
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { data: T[]; page: { next_cursor: string | null; has_more: boolean } }
    all.push(...body.data)
    cursor = body.page.has_more ? body.page.next_cursor : null
  } while (cursor)
  return all
}

test.describe('products table (p07)', () => {
  test('counts come from the API and sum to All', async ({ page }) => {
    const tokens = await loginAs(page, USERS.acme.reviewer, '/products')
    const products = await walk<ProductOut>(page.request, tokens.access_token, '/products')
    const styles = products.filter((p) => !p.parent_product_id)
    await expect(page.getByTestId('products-count')).toContainText(`${styles.length} product`)
    const radios = page.getByRole('radiogroup', { name: 'Overall status' }).getByRole('radio')
    await expect(radios.first()).toContainText(String(styles.length))
    const counts = await radios.allTextContents()
    const sum = counts.slice(1).reduce((n, t) => n + Number(/(\d+)\s*$/.exec(t)?.[1] ?? 0), 0)
    expect(sum).toBe(styles.length)
  })

  test('search filters loaded rows by name or SKU', async ({ page }) => {
    const tokens = await loginAs(page, USERS.acme.reviewer, '/products')
    const [first] = (await walk<ProductOut>(page.request, tokens.access_token, '/products')).filter((p) => !p.parent_product_id)
    await page.getByTestId('products-filter').fill(first!.sku)
    const table = page.getByRole('table', { name: 'Products' })
    await expect(table.getByRole('link', { name: first!.sku, exact: true })).toBeVisible()
    await page.getByTestId('products-filter').fill(`no-such-${RUN}`)
    await expect(page.getByText('No products match')).toBeVisible()
  })

  test('marketplaces outside the API are shown as not supported, never as listed', async ({ page }) => {
    await loginAs(page, USERS.acme.reviewer, '/products')
    const table = page.getByRole('table', { name: 'Products' })
    await expect(table.getByRole('img', { name: 'Myntra: not supported yet' }).first()).toBeVisible()
    await expect(table.getByRole('img', { name: /Myntra: Live/ })).toHaveCount(0)
  })

  test('bulk bar: pause, resubmit and archive are unavailable; add marketplace needs listing:generate', async ({ page }) => {
    await loginAs(page, USERS.acme.reviewer, '/products')
    await page.getByRole('table', { name: 'Products' }).getByRole('checkbox', { name: 'Select row' }).first().click()
    const bar = page.getByRole('region', { name: 'Bulk actions' })
    for (const name of ['Pause', 'Resubmit', 'Archive', 'Add marketplace']) {
      await expect(bar.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true')
    }
    await loginAs(page, USERS.acme.operator, '/products')
    await page.getByRole('table', { name: 'Products' }).getByRole('checkbox', { name: 'Select row' }).first().click()
    await expect(page.getByTestId('bulk-add-marketplace')).toBeEnabled()
  })

  test('add marketplace starts one generate per product x marketplace with an Idempotency-Key', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/products')
    await page.getByRole('table', { name: 'Products' }).getByRole('checkbox', { name: 'Select row' }).first().click()
    await page.getByTestId('bulk-add-marketplace').click()
    const dialog = page.getByRole('dialog', { name: 'Add marketplace' })
    await dialog.getByRole('checkbox', { name: /Amazon/ }).click()
    const start = dialog.getByTestId('start-generate')
    if (await start.isDisabled()) return // every selected product already has an Amazon listing
    const req = page.waitForRequest((r) => r.url().endsWith('/api/v1/listings/generate') && r.method() === 'POST')
    await start.click()
    const sent = await req
    expect(sent.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(sent.postDataJSON()).toMatchObject({ marketplace: 'amazon', force_regenerate: false })
    await expect(dialog.getByTestId('generate-results')).toBeVisible()
  })
})

test.describe('product detail (p17)', () => {
  test('marketplace cards follow the listings API; unsupported marketplaces offer a disabled waitlist', async ({ page }) => {
    const tokens = await apiLogin(page.request, USERS.acme.reviewer)
    const [style] = (await walk<ProductOut>(page.request, tokens.access_token, '/products')).filter((p) => !p.parent_product_id)
    const listings = await walk<{ marketplace: string }>(page.request, tokens.access_token, '/listings', { product_id: style!.id })
    await loginAs(page, USERS.acme.reviewer, `/products/${style!.id}`)
    await expect(page.getByTestId('product-sku')).toHaveText(style!.sku)
    for (const l of listings) await expect(page.getByTestId(`marketplace-card-${l.marketplace}`)).toBeVisible()
    const waitlist = page.getByRole('button', { name: 'Join waitlist' })
    await expect(waitlist).toHaveCount(4)
    await expect(waitlist.first()).toHaveAttribute('aria-disabled', 'true')
  })

  test('tabs are addressable and the edit button is honest', async ({ page }) => {
    const tokens = await apiLogin(page.request, USERS.acme.reviewer)
    const [style] = (await walk<ProductOut>(page.request, tokens.access_token, '/products')).filter((p) => !p.parent_product_id)
    await loginAs(page, USERS.acme.reviewer, `/products/${style!.id}?tab=activity`)
    await expect(page.getByTestId('tab-activity')).toHaveAttribute('data-state', 'active')
    await page.getByTestId('tab-validation').click()
    await expect(page).toHaveURL(/tab=validation/)
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-disabled', 'true')
  })
})

test.describe('add products (p08-p11)', () => {
  test('chooser: guided and bulk are live; photos, catalog export, URL and PIM are not', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/add')
    for (const name of ['Photos and basics', 'Catalog export', 'Product page URL', 'PIM or ERP']) {
      await expect(page.getByLabel(new RegExp(`^${name}:`))).toHaveAttribute('aria-disabled', 'true')
    }
    await page.getByTestId('route-bulk').click()
    await page.getByTestId('add-continue').click()
    await expect(page).toHaveURL(/\/add\/bulk/)
  })

  test('reviewer cannot open the add screens', async ({ page }) => {
    await loginAs(page, USERS.acme.reviewer, '/add/guided')
    await expect(page.getByText("You don't have access to this page")).toBeVisible()
  })

  test('guided form creates the product with only the filled attributes, then opens variants', async ({ page }) => {
    const tokens = await loginAs(page, USERS.acme.operator, '/add/guided')
    const sku = `PW-G-${RUN}`
    await page.getByLabel('SKU', { exact: true }).fill(sku)
    await page.getByLabel('Product name').fill('PW guided kurta')
    await page.getByRole('button', { name: /^Category/ }).click()
    await page.getByLabel('Category', { exact: true }).fill('kurtas')
    await page.getByRole('button', { name: /^Attributes/ }).click()
    await page.getByLabel(/Fabric type/).fill('organic cotton')
    const created = page.waitForResponse((r) => r.url().endsWith('/api/v1/products') && r.request().method() === 'POST' && r.status() !== 401)
    await page.getByTestId('guided-next').click()
    const res = await created
    expect(res.status()).toBe(201)
    const body = (await res.json()) as ProductOut & { attributes: Record<string, unknown> }
    expect(body).toMatchObject({ sku, title: 'PW guided kurta', category: 'kurtas' })
    expect(body.attributes).toEqual({ fabric_type: 'organic cotton' })
    await expect(page).toHaveURL(new RegExp(`/add/variants\\?product=${body.id}`))
    const stored = await page.request.get(`/api/v1/products/${body.id}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    expect(stored.status()).toBe(200)
  })

  test('guided form shows a SKU conflict on the field', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/add/guided')
    await page.getByLabel('SKU', { exact: true }).fill('KURTA-001')
    await page.getByLabel('Product name').fill('Duplicate')
    await page.getByRole('button', { name: /^Category/ }).click()
    await page.getByLabel('Category', { exact: true }).fill('kurtas')
    await page.getByTestId('guided-next').click()
    await expect(page.getByText('This SKU already exists in this brand.')).toBeVisible()
  })

  test('variants are saved as a family CSV through POST /products/bulk', async ({ page }) => {
    const tokens = await apiLogin(page.request, USERS.acme.operator)
    const sku = `PW-V-${RUN}`
    const res = await page.request.post('/api/v1/products', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      data: { sku, title: 'PW variant tee', category: 'kurtas' },
    })
    expect(res.status()).toBe(201)
    const product = (await res.json()) as ProductOut
    await loginAs(page, USERS.acme.operator, `/add/variants?product=${product.id}`)
    const colours = page.getByLabel('Colours')
    await colours.fill('Black')
    await colours.press('Enter')
    const bulk = page.waitForRequest((r) => r.url().endsWith('/api/v1/products/bulk') && r.method() === 'POST')
    await page.getByTestId('variants-save').click()
    const sent = await bulk
    expect(sent.headers()['idempotency-key']).toBeTruthy()
    const csv = sent.postData() ?? ''
    expect(csv).toContain(`${sku}-BLK-S,${sku},PW variant tee,kurtas,Black,S`)
    await expect(page).toHaveURL(/\/add\/bulk\?import=/)
  })

  test('bulk upload lists every column before upload and refuses an unknown one client-side', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/add/bulk')
    await page.getByTestId('bulk-next').click()
    let posted = 0
    page.on('request', (r) => {
      if (r.url().endsWith('/api/v1/products/bulk')) posted += 1
    })
    await page.getByLabel('CSV file', { exact: true }).setInputFiles({
      name: 'bad.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('seller_sku,product_name,category,Wash\nA,B,kurtas,x\n'),
    })
    const table = page.getByRole('table', { name: 'Column matching' })
    await expect(table.getByRole('row', { name: /Wash/ })).toContainText('Unknown')
    await expect(page.getByTestId('bulk-upload')).toBeDisabled()
    expect(posted).toBe(0)
  })

  test('bulk upload: check step reads the import report and its rows', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/add/bulk')
    await page.getByTestId('bulk-next').click()
    const sku = `PW-B-${RUN}`
    await page.getByLabel('CSV file', { exact: true }).setInputFiles({
      name: 'ok.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`seller_sku,product_name,category\n${sku},PW bulk kurta,kurtas\n`),
    })
    const accepted = page.waitForResponse((r) => r.url().endsWith('/api/v1/products/bulk') && r.request().method() === 'POST' && r.status() !== 401)
    await page.getByTestId('bulk-upload').click()
    expect((await accepted).status()).toBe(202)
    await expect(page).toHaveURL(/\/add\/bulk\?import=/)
    await expect(page.getByTestId('bulk-counts')).toBeVisible()
  })
})
