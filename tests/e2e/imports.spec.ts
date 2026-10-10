/**
 * Imports + jobs against the live backend (worker running), tenant Bharat Home.
 * Imports and jobs. No mocks: every assertion that matters is
 * re-checked through the API after the UI action.
 */
import path from 'node:path'
import type { APIRequestContext, Page } from '@playwright/test'
import { ARTIFACTS } from './env'
import { apiLogin, expect, loginAs, test, USERS } from './fixtures'

/** 50 rows, 5 invalid (rows 8, 15, 22, 35, 43); copied from the backend's import fixtures. */
const FIXTURE = path.resolve(import.meta.dirname, '../fixtures/products_50_5_bad.csv')
const SHOTS = ARTIFACTS
const RUN = `${Date.now().toString(36)}`
const TERMINAL = /^(succeeded|partial|failed|cancelled|dead_letter)$/

const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

async function apiGet<T>(request: APIRequestContext, token: string, url: string): Promise<T> {
  const res = await request.get(`/api/v1${url}`, auth(token))
  expect(res.status(), `GET ${url}`).toBe(200)
  return (await res.json()) as T
}

async function waitTerminal(page: Page, timeout = 90_000) {
  const progress = page.getByTestId('job-progress')
  await expect(progress).toHaveAttribute('data-status', TERMINAL, { timeout })
  return (await progress.getAttribute('data-status')) ?? ''
}

/** Every /api/v1 GET the page sends from now on (path + search). */
function trackApiGets(page: Page) {
  const seen: string[] = []
  page.on('request', (r) => {
    if (r.method() !== 'GET') return
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api/v1/')) seen.push(u.pathname.slice('/api/v1'.length) + u.search)
  })
  return seen
}

/** POST /products/bulk straight to the API (multipart part `file`). */
async function apiUpload(request: APIRequestContext, token: string, name: string, csv: string) {
  const res = await request.post('/api/v1/products/bulk', {
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': crypto.randomUUID() },
    multipart: { file: { name, mimeType: 'text/csv', buffer: Buffer.from(csv) } },
  })
  expect(res.status(), `upload ${name}: ${await res.text()}`).toBe(202)
  return (await res.json()) as { import_id: string; job_id: string }
}

async function apiWaitTerminal(request: APIRequestContext, token: string, jobId: string, timeout = 120_000) {
  await expect
    .poll(async () => (await apiGet<{ status: string }>(request, token, `/jobs/${jobId}`)).status, {
      timeout,
      intervals: [1_000, 2_000],
    })
    .toMatch(TERMINAL)
}

/** The import row for `sku` points at a product the API serves with that SKU (no catalog walk). */
async function apiHasSku(request: APIRequestContext, token: string, importId: string, sku: string) {
  const rows = await apiGet<{ data: { sku: string | null; product_id: string | null }[] }>(
    request,
    token,
    `/imports/${importId}/rows?status=imported&limit=100`,
  )
  const row = rows.data.find((r) => r.sku === sku)
  if (!row?.product_id) return false
  const product = await apiGet<{ sku: string }>(request, token, `/products/${row.product_id}`)
  return product.sku === sku
}

const sidebarLink = (page: Page, name: string) =>
  page.locator('[data-sidebar="sidebar"]').getByRole('link', { name, exact: true })

async function uploadFile(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto('/imports/new')
  await page.getByLabel('CSV file', { exact: true }).setInputFiles(file)
}

test.describe('imports', () => {
  test('operator uploads the 50-row fixture, sees 45/5, opens a product and retries failed rows', async ({ page }) => {
    test.setTimeout(180_000)
    const { access_token: token } = await loginAs(page, USERS.bharat.operator, '/imports')
    await expect(page.getByTestId('history-note')).toContainText('Imports from other browsers are not listed.')

    await uploadFile(page, FIXTURE)
    await expect(page.getByTestId('selected-file')).toHaveText('products_50_5_bad.csv')
    const bulk = page.waitForResponse((r) => r.url().endsWith('/api/v1/products/bulk') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Upload and import' }).click()
    const bulkRes = await bulk
    expect(bulkRes.status()).toBe(202)
    expect(bulkRes.request().headers()['idempotency-key']).toBeTruthy()
    const accepted = (await bulkRes.json()) as { import_id: string; job_id: string }

    await expect(page).toHaveURL(new RegExp(`/imports/${accepted.import_id}\\?job=${accepted.job_id}`))
    // Processing is shown truthfully before the job ends.
    await expect(page.getByTestId('job-progress')).toBeVisible()
    expect(await waitTerminal(page)).toBe('partial')
    await expect(page.getByText('Completed with failures').first()).toBeVisible()
    await expect(page.getByTestId('count-imported')).toHaveText('45')
    await expect(page.getByTestId('count-failed')).toHaveText('5')
    await expect(page.getByTestId('count-total')).toHaveText('50')

    // Default tab is Failed once the job ended with failures (server filter status=failed).
    await expect(page.getByRole('tab', { name: /Failed/ })).toHaveAttribute('data-state', 'active')
    const rowNumbers = page.getByTestId('row-number')
    await expect(rowNumbers).toHaveText(['8', '15', '22', '35', '43'])
    await expect(page.locator('[data-code="CATEGORY_NOT_MAPPED"]').first()).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/imports-report-partial.png`, fullPage: true })

    // DB-backed: the API agrees.
    const report = await apiGet<{ imported: number; failed: number; total_rows: number }>(
      page.request,
      token,
      `/imports/${accepted.import_id}`,
    )
    expect(report).toMatchObject({ imported: 45, failed: 5, total_rows: 50 })
    const failedRows = await apiGet<{ data: { row_number: number }[] }>(
      page.request,
      token,
      `/imports/${accepted.import_id}/rows?status=failed`,
    )
    expect(failedRows.data.map((r) => r.row_number)).toEqual([8, 15, 22, 35, 43])

    // Issue details sheet.
    await page.getByRole('button', { name: /Show \d+ issues? for row 8/ }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('heading', { name: 'Row 8' })).toBeVisible()
    await expect(sheet.getByTestId('error-report-list')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/imports-row-issues.png` })
    await page.keyboard.press('Escape')

    // Imported tab -> product link -> product detail; FX-001 is in the products list.
    await page.getByRole('tab', { name: /Imported/ }).click()
    await expect(page).toHaveURL(/rows=imported/)
    await expect(rowNumbers.first()).toHaveText('2')
    expect(await apiHasSku(page.request, token, accepted.import_id, 'FX-001')).toBe(true)
    const productLink = page.getByTestId('row-product-link').first()
    await expect(productLink).toBeVisible()
    const href = await productLink.getAttribute('href')
    expect(href).toMatch(/^\/products\/[0-9a-f-]{36}$/)
    await productLink.click()
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    await expect(page.getByTestId('product-title')).toBeVisible()
    await page.goBack()

    // Retry failed rows -> new job id tracked in the URL, polled to terminal.
    await expect(page.getByTestId('retry-failed')).toBeEnabled()
    const retryRes = page.waitForResponse((r) => r.url().endsWith(`/imports/${accepted.import_id}/rows/retry`))
    await page.getByTestId('retry-failed').click()
    const retried = await retryRes
    expect(retried.status()).toBe(202)
    const { job_id: newJob } = (await retried.json()) as { job_id: string }
    expect(newJob).not.toBe(accepted.job_id)
    await expect(page).toHaveURL(new RegExp(`job=${newJob}`))
    await expect(page.getByTestId('job-progress')).toHaveAttribute('data-job-id', newJob)
    await waitTerminal(page)
    const after = await apiGet<{ imported: number; failed: number }>(page.request, token, `/imports/${accepted.import_id}`)
    expect(after.imported + after.failed).toBe(50)
    await expect(page.getByTestId('count-failed')).toHaveText(String(after.failed))

    // History lists this upload with its live status and counts: one job + one report call per row.
    await page.goto('/imports/new')
    const gets = trackApiGets(page)
    await sidebarLink(page, 'Imports').click()
    const row = page.locator(`[data-testid="history-row"][data-import-id="${accepted.import_id}"]`)
    await expect(row).toContainText('products_50_5_bad.csv')
    await expect(row.locator('[data-status]')).toHaveAttribute('data-status', TERMINAL)
    await expect(row).toContainText(String(after.imported))
    await page.waitForTimeout(1_500)
    const perRow = (list: string[]) => list.filter((u) => /^\/(jobs|imports)\//.test(u))
    expect(perRow(gets).filter((u) => u.startsWith('/jobs/')).length).toBeLessThanOrEqual(1)
    expect(perRow(gets).filter((u) => u === `/imports/${accepted.import_id}`).length).toBeLessThanOrEqual(1)
    // A second in-app visit is served from cache: finished jobs and their reports never change.
    gets.length = 0
    await page.getByRole('link', { name: 'Import CSV' }).first().click()
    await expect(page).toHaveURL(/\/imports\/new$/)
    await sidebarLink(page, 'Imports').click()
    await expect(row.locator('[data-status]')).toHaveAttribute('data-status', TERMINAL)
    await page.waitForTimeout(1_500)
    expect(perRow(gets), 'no job/report refetch on revisit').toEqual([])
    await page.screenshot({ path: `${SHOTS}/imports-history.png`, fullPage: true })

    // Generic job page for the retry job; result link opens the import.
    await page.goto(`/jobs/${newJob}`)
    await expect(page.getByTestId('job-progress')).toHaveAttribute('data-status', TERMINAL)
    await expect(page.getByText('CSV import').first()).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/imports-job.png`, fullPage: true })
    await page.getByTestId('job-result-link').click()
    await expect(page).toHaveURL(new RegExp(`/imports/${accepted.import_id}`))
    await expect(page.getByTestId('count-total')).toHaveText('50')
  })

  test('the upload page lists template categories and every accepted column', async ({ page }) => {
    await loginAs(page, USERS.bharat.operator, '/imports/new')
    const cats = page.getByTestId('template-categories')
    await expect(cats).toContainText('ethnic_wear_kurta_sets')
    await expect(cats).toContainText('home_decor_lamps')
    await page.getByRole('button', { name: 'All accepted columns' }).click()
    const groups = page.getByTestId('column-group')
    await expect(groups.locator('h3')).toContainText(['Identity', 'Classification', 'Attributes', 'Care', 'Compliance', 'Commercial', 'Media', 'Content', 'Marketplace', 'Workflow'])
    await expect(groups.filter({ hasText: 'Content' })).toContainText('bullet_1 … bullet_99')
    await expect(groups.filter({ hasText: 'Content' })).toContainText('accepted, not stored')
    await expect(groups.filter({ hasText: 'Workflow' })).toContainText('human_action_required')
    const aliases = page.getByTestId('column-aliases')
    for (const a of ['parent_sku', 'mrp_inr', 'price_inr', 'weight_grams', 'package_weight_g']) await expect(aliases).toContainText(a)
  })

  test('header errors are listed inline and nothing navigates', async ({ page }) => {
    await loginAs(page, USERS.bharat.operator, '/imports')
    await uploadFile(page, { name: 'bad-header.csv', mimeType: 'text/csv', buffer: Buffer.from('seller_sku,foo\nA,b\n') })
    const bulk = page.waitForResponse((r) => r.url().endsWith('/api/v1/products/bulk'))
    await page.getByRole('button', { name: 'Upload and import' }).click()
    expect((await bulk).status()).toBe(422)
    const problem = page.getByTestId('upload-problem')
    await expect(problem).toContainText('The file was refused')
    await expect(problem.locator('[data-code="HEADER_MISSING_COLUMN"]').first()).toBeVisible()
    await expect(problem.locator('[data-code="HEADER_UNKNOWN_COLUMN"]').first()).toBeVisible()
    await expect(problem.getByTestId('error-reference')).toBeVisible()
    await expect(page).toHaveURL(/\/imports\/new$/)
    await page.screenshot({ path: `${SHOTS}/imports-new-header-errors.png`, fullPage: true })
  })

  test('oversize and empty files are refused client-side without a request', async ({ page }) => {
    await loginAs(page, USERS.bharat.operator, '/imports/new')
    let posted = 0
    page.on('request', (r) => {
      if (r.url().endsWith('/api/v1/products/bulk')) posted += 1
    })
    await uploadFile(page, {
      name: 'big.csv',
      mimeType: 'text/csv',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 'a'),
    })
    await expect(page.getByTestId('upload-problem')).toContainText('File is larger than 10 MiB')
    await expect(page.getByRole('button', { name: 'Upload and import' })).toBeDisabled()
    await page.getByLabel('CSV file', { exact: true }).setInputFiles({ name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.alloc(0) })
    await expect(page.getByTestId('upload-problem')).toContainText('The file is empty.')
    expect(posted).toBe(0)
  })

  test('a fully valid file succeeds 1/0 and Retry stays disabled', async ({ page }) => {
    test.setTimeout(120_000)
    const { access_token: token } = await loginAs(page, USERS.bharat.operator, '/imports/new')
    const sku = `PW-${RUN}-1`
    const csv = `seller_sku,product_name,category,main_image\n${sku},Playwright lamp ${RUN},home_decor_lamps,https://cdn.example.com/pw/${RUN}.jpg\n`
    await page.getByLabel('CSV file', { exact: true }).setInputFiles({ name: `pw-${RUN}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await page.getByRole('button', { name: 'Upload and import' }).click()
    await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}\?job=/)
    // While the job is non-terminal the retry button is disabled.
    const status = await page.getByTestId('job-progress').getAttribute('data-status')
    if (status === 'queued' || status === 'running') await expect(page.getByTestId('retry-failed')).toBeDisabled()
    expect(await waitTerminal(page)).toBe('succeeded')
    await expect(page.getByTestId('count-imported')).toHaveText('1')
    await expect(page.getByTestId('count-failed')).toHaveText('0')
    await expect(page.getByTestId('retry-failed')).toBeDisabled()
    await expect(page.getByRole('tab', { name: /All/ })).toHaveAttribute('data-state', 'active')
    await page.screenshot({ path: `${SHOTS}/imports-report-succeeded.png`, fullPage: true })

    const products = await apiGet<{ data: { sku: string }[] }>(page.request, token, '/products?limit=200')
    expect(products.data.some((p) => p.sku === sku)).toBe(true)
  })

  test('reviewer can read a report but sees no upload, retry or cancel; /imports/new is forbidden', async ({ page, browser }) => {
    test.setTimeout(120_000)
    // Operator creates an import to look at (separate context so histories stay separate).
    const opCtx = await browser.newContext()
    const opPage = await opCtx.newPage()
    await loginAs(opPage, USERS.bharat.operator, '/imports/new')
    await opPage.getByLabel('CSV file', { exact: true }).setInputFiles(FIXTURE)
    await opPage.getByRole('button', { name: 'Upload and import' }).click()
    await expect(opPage).toHaveURL(/\/imports\/[0-9a-f-]{36}\?job=/)
    const reportUrl = new URL(opPage.url())
    await waitTerminal(opPage)
    await opCtx.close()

    await loginAs(page, USERS.bharat.reviewer, '/imports')
    await expect(page.getByText('No imports from this browser yet')).toBeVisible()
    await expect(page.getByText('This list shows imports uploaded from this browser.')).toBeVisible()
    await expect(page.getByText('listed by the people who uploaded them')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Import CSV' })).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/imports-empty-reviewer.png`, fullPage: true })

    // A finished partial import opens straight on Failed: job, report and failed rows, once each.
    const gets = trackApiGets(page)
    await page.goto(reportUrl.pathname + reportUrl.search)
    await expect(page.getByTestId('count-failed')).toHaveText('5')
    await expect(page.getByRole('tab', { name: /Failed/ })).toHaveAttribute('data-state', 'active')
    await expect(page.getByTestId('row-number')).toHaveCount(5)
    await page.waitForTimeout(1_500)
    const importId = reportUrl.pathname.split('/').pop()!
    const dataGets = gets.filter((u) => /^\/(jobs|imports)\//.test(u))
    expect(dataGets.filter((u) => u.startsWith('/jobs/'))).toHaveLength(1)
    expect(dataGets.filter((u) => u === `/imports/${importId}`)).toHaveLength(1)
    const rowGets = dataGets.filter((u) => u.startsWith(`/imports/${importId}/rows`))
    expect(rowGets).toHaveLength(1)
    expect(rowGets[0]).toContain('status=failed')
    await expect(page.getByTestId('retry-failed')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'New import' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cancel job' })).toHaveCount(0)

    // Without ?job= and no local history the report still renders, minus live progress.
    await page.goto(reportUrl.pathname)
    await expect(page.getByText("Live progress isn't available here")).toBeVisible()
    await expect(page.getByTestId('count-total')).toHaveText('50')
    // The job is unknown, so the default tab stays All; the counts settle after a few polls.
    await expect(page.getByRole('tab', { name: /All/ })).toHaveAttribute('data-state', 'active')
    await expect(page.getByTestId('report-watch')).toHaveAttribute('data-settled', 'true', { timeout: 20_000 })
    await expect(page.getByTestId('report-watch')).toContainText('The counts below have stopped changing.')

    // Opening an import by link never adds it to this browser's list.
    await page.goto('/imports')
    await expect(page.getByText('No imports from this browser yet')).toBeVisible()

    await page.goto('/imports/new')
    await expect(page.getByText("You don't have access to this page")).toBeVisible()

    // Server still enforces it: a direct retry by the reviewer is 403.
    const { access_token } = await apiLogin(page.request, USERS.bharat.reviewer)
    const res = await page.request.post(`/api/v1/imports/${importId}/rows/retry`, {
      headers: { Authorization: `Bearer ${access_token}`, 'Idempotency-Key': crypto.randomUUID() },
    })
    expect(res.status()).toBe(403)
  })

  test('unknown import and job ids render not-found', async ({ page }) => {
    await loginAs(page, USERS.bharat.operator, '/imports/00000000-0000-4000-8000-000000000000')
    await expect(page.getByText('Import not found')).toBeVisible()
    await page.goto('/jobs/00000000-0000-4000-8000-000000000000')
    await expect(page.getByText('Job not found')).toBeVisible()
    await page.goto('/jobs/not-a-uuid')
    await expect(page.getByText('Job not found')).toBeVisible()
  })

  test('job polling stops at a terminal status', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAs(page, USERS.bharat.operator, '/imports/new')
    const csv = `seller_sku,product_name,category,main_image\nPW-${RUN}-2,Playwright kurta ${RUN},ethnic_wear_kurta_sets,https://cdn.example.com/pw/${RUN}-2.jpg\n`
    await page.getByLabel('CSV file', { exact: true }).setInputFiles({ name: `pw-${RUN}-2.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await page.getByRole('button', { name: 'Upload and import' }).click()
    await expect(page).toHaveURL(/\?job=/)
    await waitTerminal(page)
    const jobId = new URL(page.url()).searchParams.get('job')!
    await page.goto(`/jobs/${jobId}`)
    await expect(page.getByTestId('job-progress')).toHaveAttribute('data-status', TERMINAL)
    let polls = 0
    page.on('request', (r) => {
      if (r.url().includes(`/api/v1/jobs/${jobId}`)) polls += 1
    })
    await page.waitForTimeout(6_000)
    expect(polls).toBe(0)
  })

  test('an import refreshes an already-open product detail (existing SKU updated)', async ({ page }) => {
    test.setTimeout(150_000)
    const { access_token: token } = await loginAs(page, USERS.bharat.operator, '/products')
    const sku = `PW-${RUN}-UPD`
    const csvFor = (title: string) =>
      `seller_sku,product_name,category,main_image\n${sku},${title},home_decor_lamps,https://cdn.example.com/pw/${RUN}-upd.jpg\n`
    const first = await apiUpload(page.request, token, `pw-${RUN}-upd-a.csv`, csvFor(`Lamp before ${RUN}`))
    await apiWaitTerminal(page.request, token, first.job_id)
    const list = await apiGet<{ data: { id: string; sku: string }[] }>(page.request, token, `/products?limit=200`)
    const product = list.data.find((p) => p.sku === sku)
    expect(product, `${sku} created`).toBeTruthy()

    // Cache the detail page, then import a new title for the same SKU without reloading the app.
    await page.goto(`/products/${product!.id}`)
    await expect(page.getByTestId('product-title')).toHaveText(`Lamp before ${RUN}`)
    await sidebarLink(page, 'Imports').click()
    await page.getByRole('link', { name: 'Import CSV' }).first().click()
    await page.getByLabel('CSV file', { exact: true }).setInputFiles({
      name: `pw-${RUN}-upd-b.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(csvFor(`Lamp after ${RUN}`)),
    })
    await page.getByRole('button', { name: 'Upload and import' }).click()
    expect(await waitTerminal(page)).toBe('succeeded')
    await page.getByRole('tab', { name: /Imported/ }).click()
    await page.getByTestId('row-product-link').first().click()
    await expect(page).toHaveURL(new RegExp(`/products/${product!.id}$`))
    await expect(page.getByTestId('product-title')).toHaveText(`Lamp after ${RUN}`)
  })

  test('a network failure keeps the Idempotency-Key; a changed body under the same key is refused', async ({ page }) => {
    test.setTimeout(150_000)
    const { access_token: token } = await loginAs(page, USERS.bharat.operator, '/imports/new')
    const keys: string[] = []
    page.on('request', (r) => {
      if (r.url().endsWith('/api/v1/products/bulk') && r.method() === 'POST') keys.push(r.headers()['idempotency-key'] ?? '')
    })
    const csv = `seller_sku,product_name,category,main_image\nPW-${RUN}-NET,Network lamp ${RUN},home_decor_lamps,https://cdn.example.com/pw/${RUN}-net.jpg\n`
    const pickFile = () =>
      page.getByLabel('CSV file', { exact: true }).setInputFiles({ name: `pw-${RUN}-net.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) })

    // 1) The server accepts the upload but the response is lost: the UI shows a network error.
    await pickFile()
    let accepted: { import_id: string; job_id: string } | null = null
    await page.route('**/api/v1/products/bulk', async (route) => {
      const res = await route.fetch()
      accepted = (await res.json()) as { import_id: string; job_id: string }
      await route.abort('failed')
    })
    await page.getByRole('button', { name: 'Upload and import' }).click()
    await expect(page.getByTestId('upload-problem')).toContainText("Can't reach the server")
    await expect(page).toHaveURL(/\/imports\/new$/)
    await page.unroute('**/api/v1/products/bulk')
    expect(accepted).not.toBeNull()

    // 2) Submitting again resends the same key; the server replays the original import.
    const replay = page.waitForResponse((r) => r.url().endsWith('/api/v1/products/bulk'))
    await page.getByRole('button', { name: 'Upload and import' }).click()
    const replayRes = await replay
    expect(replayRes.status()).toBe(202)
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
    const replayed = (await replayRes.json()) as { import_id: string }
    expect(replayed.import_id).toBe(accepted!.import_id)
    await expect(page).toHaveURL(new RegExp(`/imports/${accepted!.import_id}`))
    await waitTerminal(page)

    // 3) Same key, different bytes (the request is altered in flight) -> 409 IDEMPOTENCY_KEY_REUSED.
    await sidebarLink(page, 'Imports').click()
    await page.getByRole('link', { name: 'Import CSV' }).first().click()
    await pickFile()
    let firstKey = ''
    await page.route('**/api/v1/products/bulk', async (route) => {
      const res = await route.fetch()
      const body = (await res.json()) as { job_id: string }
      firstKey = route.request().headers()['idempotency-key'] ?? ''
      await apiWaitTerminal(page.request, token, body.job_id)
      await route.abort('failed')
    })
    await page.getByRole('button', { name: 'Upload and import' }).click()
    await expect(page.getByTestId('upload-problem')).toContainText("Can't reach the server")
    await page.unroute('**/api/v1/products/bulk')
    await page.route('**/api/v1/products/bulk', async (route) => {
      const original = route.request().postDataBuffer()!
      const altered = Buffer.from(original.toString('latin1').replace(`Network lamp ${RUN}`, `Network lamq ${RUN}`), 'latin1')
      await route.continue({ postData: altered })
    })
    const reused = page.waitForResponse((r) => r.url().endsWith('/api/v1/products/bulk'))
    await page.getByRole('button', { name: 'Upload and import' }).click()
    const reusedRes = await reused
    expect(reusedRes.status()).toBe(409)
    expect(reusedRes.request().headers()['idempotency-key']).toBe(firstKey)
    await expect(page.getByTestId('upload-problem')).toContainText('This upload conflicted with an earlier one')
    await expect(page.getByTestId('upload-problem').getByTestId('error-reference')).toBeVisible()
    await page.unroute('**/api/v1/products/bulk')

    // The key was dropped: the next submit uses a fresh one and is accepted.
    const fresh = page.waitForResponse((r) => r.url().endsWith('/api/v1/products/bulk'))
    await page.getByRole('button', { name: 'Upload and import' }).click()
    const freshRes = await fresh
    expect(freshRes.status()).toBe(202)
    expect(freshRes.request().headers()['idempotency-key']).not.toBe(firstKey)
    await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}\?job=/)
    await waitTerminal(page)
  })

  test('a third upload while two imports are live shows the cap message', async ({ page }) => {
    test.setTimeout(240_000)
    const { access_token: token } = await loginAs(page, USERS.bharat.operator, '/imports/new')
    // Two real 9,000-row imports (unknown category: every row fails, nothing is stored).
    const rows = Array.from({ length: 9_000 }, (_, i) => `PW-CAP-${RUN}-${i},Cap row ${i},no_such_category,https://cdn.example.com/cap/${i}.jpg`)
    const big = `seller_sku,product_name,category,main_image\n${rows.join('\n')}\n`
    const live = [
      await apiUpload(page.request, token, `pw-${RUN}-cap-1.csv`, big),
      await apiUpload(page.request, token, `pw-${RUN}-cap-2.csv`, big),
    ]
    try {
      await page.getByLabel('CSV file', { exact: true }).setInputFiles({
        name: `pw-${RUN}-cap-3.csv`,
        mimeType: 'text/csv',
        buffer: Buffer.from(`seller_sku,product_name,category,main_image\nPW-${RUN}-CAP,Cap lamp,home_decor_lamps,https://cdn.example.com/cap.jpg\n`),
      })
      const res = page.waitForResponse((r) => r.url().endsWith('/api/v1/products/bulk'))
      await page.getByRole('button', { name: 'Upload and import' }).click()
      const capRes = await res
      expect(capRes.status()).toBe(429)
      expect(capRes.headers()['retry-after']).toBeUndefined()
      await expect(page.getByTestId('upload-problem')).toContainText('Two imports are already running. Wait for one to finish.')
      await expect(page.getByTestId('upload-problem').getByTestId('error-reference')).toBeVisible()
      await expect(page).toHaveURL(/\/imports\/new$/)
    } finally {
      // Leave the tenant under the cap: cancel what is still queued, wait out the rest.
      for (const j of live) {
        await page.request.post(`/api/v1/jobs/${j.job_id}/cancel`, {
          headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': crypto.randomUUID() },
        })
      }
      for (const j of live) await apiWaitTerminal(page.request, token, j.job_id, 180_000)
    }
  })
  test('a report opened without its job keeps refreshing until the counts settle', async ({ page }) => {
    test.setTimeout(240_000)
    const { access_token: token } = await loginAs(page, USERS.bharat.operator, '/imports')
    // A long import uploaded straight to the API: this browser has no job id for it.
    const rows = Array.from({ length: 8_000 }, (_, i) => `PW-W-${RUN}-${i},Watch row ${i},no_such_category,https://cdn.example.com/w/${i}.jpg`)
    const csv = `seller_sku,product_name,category,main_image\n${rows.join('\n')}\n`
    const accepted = await apiUpload(page.request, token, `pw-${RUN}-watch.csv`, csv)
    try {
      await page.goto(`/imports/${accepted.import_id}`)
      const watch = page.getByTestId('report-watch')
      await expect(watch).toContainText('The counts below refresh every few seconds.')
      await expect(page.getByTestId('count-total')).toBeVisible()
      const first = Number((await page.getByTestId('count-total').textContent())!.replace(/,/g, ''))
      expect(first).toBeLessThan(8_000)
      // While the import runs: Retry stays disabled and the default tab is All, not Failed.
      await expect(page.getByTestId('retry-failed')).toBeDisabled()
      await expect(page.getByRole('tab', { name: /All/ })).toHaveAttribute('data-state', 'active')
      // The counts move without a reload or focus change.
      await expect
        .poll(async () => Number((await page.getByTestId('count-total').textContent())!.replace(/,/g, '')), {
          timeout: 60_000,
          intervals: [1_000],
        })
        .toBeGreaterThan(first)
      await apiWaitTerminal(page.request, token, accepted.job_id, 180_000)
      const final = await apiGet<{ total_rows: number; failed: number }>(page.request, token, `/imports/${accepted.import_id}`)
      await expect(page.getByTestId('count-total')).toHaveText(final.total_rows.toLocaleString('en-US'), { timeout: 15_000 })
      await expect(watch).toHaveAttribute('data-settled', 'true', { timeout: 20_000 })
      await expect(page.getByTestId('retry-failed')).toBeEnabled()
    } finally {
      await page.request.post(`/api/v1/jobs/${accepted.job_id}/cancel`, {
        headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': crypto.randomUUID() },
      })
      await apiWaitTerminal(page.request, token, accepted.job_id, 180_000)
    }
  })

  test('the products list refreshes when an import ends while another page is open', async ({ page }) => {
    test.setTimeout(240_000)
    const { access_token: token } = await loginAs(page, USERS.bharat.operator, '/imports/new')
    // Failing rows first so the one valid product is created near the end of the run.
    const sku = `PW-${RUN}-LATE`
    const rows = Array.from({ length: 4_000 }, (_, i) => `PW-L-${RUN}-${i},Late row ${i},no_such_category,https://cdn.example.com/l/${i}.jpg`)
    const csv = `seller_sku,product_name,category,main_image\n${rows.join('\n')}\n${sku},Late lamp ${RUN},home_decor_lamps,https://cdn.example.com/pw/${RUN}-late.jpg\n`
    await page.getByLabel('CSV file', { exact: true }).setInputFiles({ name: `pw-${RUN}-late.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await page.getByRole('button', { name: 'Upload and import' }).click()
    await expect(page).toHaveURL(/\?job=/)
    const jobId = new URL(page.url()).searchParams.get('job')!
    // Leave the import page straight away and stay on Products.
    await sidebarLink(page, 'Products').click()
    await expect(page).toHaveURL(/\/products$/)
    await expect(page.getByTestId('products-count')).toBeVisible()
    const job = await apiGet<{ status: string }>(page.request, token, `/jobs/${jobId}`)
    expect(job.status, 'import still running when Products opened').not.toMatch(TERMINAL)
    await expect(page.getByText(sku, { exact: true })).toHaveCount(0)
    const productGets = trackApiGets(page)
    await apiWaitTerminal(page.request, token, jobId, 180_000)
    // No reload, no focus change: the import's end alone refetches the list.
    await expect(page.getByText(sku, { exact: true })).toBeVisible({ timeout: 20_000 })
    expect(productGets.some((u) => u.startsWith('/products'))).toBe(true)
  })
})
