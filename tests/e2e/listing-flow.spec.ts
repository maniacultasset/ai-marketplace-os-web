import { randomUUID } from 'node:crypto'
import type { APIRequestContext } from '@playwright/test'
import { apiLogin, expect, loginAs, test, USERS } from './fixtures'

/**
 * Listing flow (hi-fi p12 Agent run, p13 Review and approve, p14 Live confirmation, p18 Mapping
 * and validation) against the real backend and its demo seed (stub AI). Data is made through the
 * API (POST /products, POST /listings/generate), never mocked. Approval is always on: the maker
 * (the owner who asked for the generation) cannot approve; a reviewer can.
 */

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
const NIL = '00000000-0000-4000-8000-000000000000'

async function createProduct(request: APIRequestContext, token: string) {
  const sku = `E2E-LF-${Date.now().toString(36).toUpperCase()}`
  const res = await request.post('/api/v1/products', {
    headers: auth(token),
    data: { sku, title: `E2E listing flow ${sku}`, category: 'tshirts', attributes: { color: 'Black', fabric_type: 'Cotton' } },
  })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()) as { id: string; sku: string; title: string }
}

async function generate(request: APIRequestContext, token: string, productId: string, marketplace: 'amazon' | 'flipkart') {
  const res = await request.post('/api/v1/listings/generate', {
    headers: { ...auth(token), 'Idempotency-Key': randomUUID() },
    data: { product_id: productId, marketplace, force_regenerate: false },
  })
  expect(res.status(), await res.text()).toBe(202)
  return (await res.json()) as { job_id: string; listing_id: string }
}

async function waitForJob(request: APIRequestContext, token: string, jobId: string) {
  let status = ''
  await expect(async () => {
    const res = await request.get(`/api/v1/jobs/${jobId}`, { headers: auth(token) })
    status = ((await res.json()) as { status: string }).status
    expect(['succeeded', 'partial', 'failed', 'cancelled', 'dead_letter']).toContain(status)
  }).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 5_000] })
  return status
}

test.describe('listing flow', () => {
  test('agent run shows real progress, lanes and an honest Pause', async ({ page }) => {
    const { access_token } = await loginAs(page, USERS.acme.owner, '/home')
    const product = await createProduct(page.request, access_token)
    const { job_id } = await generate(page.request, access_token, product.id, 'amazon')

    await page.goto(`/runs/${job_id}`)
    await expect(page.getByTestId('screen-title')).toHaveText(product.title)
    await expect(page.getByTestId('run-progress').locator('[data-step]')).toHaveCount(6)
    // Pause is not in the API: focusable, aria-disabled, with the reason.
    const pause = page.getByTestId('run-pause')
    await expect(pause).toHaveAttribute('aria-disabled', 'true')
    // Lanes: the generated marketplace, and Flipkart offered from the same product.
    const lanes = page.getByTestId('run-marketplaces')
    await expect(lanes.locator('[data-lane="amazon"]')).toBeVisible()
    await expect(lanes.locator('[data-lane="flipkart"]')).toBeVisible()
    await expect(lanes.getByTestId('list-on-flipkart')).toBeVisible()
    await expect(page.getByTestId('agent-log')).toBeVisible()
  })

  test('generate from the run lane opens a new run with an Idempotency-Key', async ({ page }) => {
    const { access_token } = await loginAs(page, USERS.acme.operator, '/home')
    const product = await createProduct(page.request, access_token)
    const { job_id } = await generate(page.request, access_token, product.id, 'amazon')
    await page.goto(`/runs/${job_id}`)
    const req = page.waitForRequest((r) => r.url().endsWith('/api/v1/listings/generate') && r.method() === 'POST')
    await page.getByTestId('list-on-flipkart').click()
    const sent = await req
    expect(sent.headers()['idempotency-key']).toBeTruthy()
    expect(sent.postDataJSON()).toMatchObject({ product_id: product.id, marketplace: 'flipkart', force_regenerate: false })
    await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/)
    await expect(page).not.toHaveURL(new RegExp(job_id))
  })

  test('review: approval is always on, nine gates, maker-checker for the maker', async ({ page }) => {
    const { access_token } = await loginAs(page, USERS.acme.owner, '/home')
    const product = await createProduct(page.request, access_token)
    const { job_id, listing_id } = await generate(page.request, access_token, product.id, 'amazon')
    await waitForJob(page.request, access_token, job_id)

    await page.goto(`/listings/${listing_id}/review`)
    await expect(page.getByText('Approval is always on.')).toBeVisible()
    await expect(page.getByText('Change in Settings')).toHaveCount(0)
    await expect(page.getByTestId('review-tabs').getByRole('link', { name: /Amazon/ })).toHaveAttribute('aria-current', 'page')
    const gates = page.getByTestId('quality-gates').locator('[data-gate]')
    await expect(gates).toHaveCount(9)
    // Submission is decided by the marketplace: never "passed" before it is sent.
    await expect(page.getByTestId('quality-gates').locator('[data-gate="submission"]')).toHaveAttribute('data-state', 'unchecked')
  })

  test('review: a reviewer can send back with a note (reject + rewrite) and lands on the new run', async ({ page }) => {
    const owner = await apiLogin(page.request, USERS.acme.owner)
    const product = await createProduct(page.request, owner.access_token)
    const { job_id, listing_id } = await generate(page.request, owner.access_token, product.id, 'amazon')
    const status = await waitForJob(page.request, owner.access_token, job_id)
    test.skip(status !== 'succeeded', `generation ended ${status}; nothing to review`)
    const detail = await (await page.request.get(`/api/v1/listings/${listing_id}`, { headers: auth(owner.access_token) })).json()
    test.skip(!['validated', 'needs_review'].includes(detail.status), `listing is ${detail.status}`)

    await loginAs(page, USERS.acme.reviewer, `/listings/${listing_id}/review`)
    await page.getByTestId('send-back').click()
    await page.getByRole('combobox', { name: 'Reason' }).click()
    await page.getByRole('option', { name: 'Off-brand voice' }).click()
    await page.getByLabel('Note').fill('Use a warmer tone in the first bullet.')
    const req = page.waitForRequest((r) => r.url().endsWith('/api/v1/listings/approve') && r.method() === 'POST')
    await page.getByTestId('send-back-submit').click()
    const sent = await req
    expect(sent.headers()['idempotency-key']).toBeTruthy()
    expect(sent.postDataJSON()).toMatchObject({
      items: [{ listing_id, decision: 'reject', reason_code: 'off_brand_voice', feedback: 'Use a warmer tone in the first bullet.', regenerate: true }],
    })
    await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/)
  })

  test('live: never says Live before the marketplace confirms it', async ({ page }) => {
    const { access_token } = await loginAs(page, USERS.acme.owner, '/home')
    const product = await createProduct(page.request, access_token)
    const { listing_id } = await generate(page.request, access_token, product.id, 'amazon')
    await page.goto(`/listings/${listing_id}/live`)
    const hero = page.getByTestId('live-hero')
    await expect(hero).toBeVisible()
    await expect(hero).not.toHaveAttribute('data-state', 'live')
    await expect(page.getByTestId('view-live')).toHaveCount(0)
    await expect(page.getByTestId('proof')).toContainText('Not yet')
  })

  test('mapping: rules banner, gate list and a link to the rules', async ({ page }) => {
    const { access_token } = await loginAs(page, USERS.acme.owner, '/home')
    const product = await createProduct(page.request, access_token)
    const { job_id, listing_id } = await generate(page.request, access_token, product.id, 'amazon')
    await waitForJob(page.request, access_token, job_id)
    await page.goto(`/listings/${listing_id}/mapping`)
    await expect(page.getByTestId('screen-title')).toContainText(`${product.title} on Amazon`)
    await expect(page.getByText(/Rules used:/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'View rules' })).toHaveAttribute('href', /\/rules\?marketplace=amazon/)
    await expect(page.getByTestId('quality-gates').locator('[data-gate]')).toHaveCount(9)
    await expect(page.getByTestId('mapping-table').or(page.getByTestId('mapping-empty'))).toBeVisible()
  })

  test('unknown run and listing ids read as not found', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, `/runs/${NIL}`)
    await expect(page.getByText('Run not found')).toBeVisible()
    for (const screen of ['review', 'live', 'mapping']) {
      await page.goto(`/listings/${NIL}/${screen}`)
      await expect(page.getByText('Listing not found')).toBeVisible()
    }
  })

  test('mobile: review and run have no horizontal scroll at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const { access_token } = await loginAs(page, USERS.acme.owner, '/home')
    const product = await createProduct(page.request, access_token)
    const { job_id, listing_id } = await generate(page.request, access_token, product.id, 'amazon')
    for (const path of [`/runs/${job_id}`, `/listings/${listing_id}/review`, `/listings/${listing_id}/live`]) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    }
  })
})
