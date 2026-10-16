/**
 * Setup wizard (hi-fi 02-04) against the live backend. Nothing is mocked.
 *
 * Tenant: Bharat Home, so acme specs are untouched. The brand profile (name, tone) is read before
 * and restored after every test through PATCH /tenants/me with If-Match. Marketplace connections
 * are only read here (marketplaces.spec.ts owns connecting and revoking).
 */
import type { APIRequestContext, Page } from '@playwright/test'
import path from 'node:path'
import { API_URL, ARTIFACTS } from './env'
import { apiLogin, expect, loginAs, test, TENANTS, USERS } from './fixtures'

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(ARTIFACTS, `onboarding-${name}.png`), fullPage: true })

interface Tenant {
  id: string
  name: string
  tone: string | null
  guidelines: string[]
  glossary: Record<string, string>
}

async function ownerToken(request: APIRequestContext) {
  return (await apiLogin(request, USERS.bharat.owner)).access_token
}

async function getProfile(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_URL}/api/v1/tenants/me`, { headers: { Authorization: `Bearer ${token}` } })
  expect(res.status()).toBe(200)
  return { body: (await res.json()) as Tenant, etag: res.headers()['etag']! }
}

async function patchProfile(request: APIRequestContext, token: string, body: Partial<Tenant>) {
  const { etag } = await getProfile(request, token)
  const res = await request.patch(`${API_URL}/api/v1/tenants/me`, {
    headers: { Authorization: `Bearer ${token}`, 'If-Match': etag },
    data: body,
  })
  expect(res.status()).toBe(200)
  return (await res.json()) as Tenant
}

let seed: Pick<Tenant, 'name' | 'tone'>

test.beforeAll(async ({ request }) => {
  const token = await ownerToken(request)
  const { body } = await getProfile(request, token)
  expect(body.id).toBe(TENANTS.bharat.id)
  seed = { name: body.name, tone: body.tone }
})

test.afterEach(async ({ request }) => {
  const token = await ownerToken(request)
  const { body } = await getProfile(request, token)
  if (body.name !== seed.name || body.tone !== seed.tone) await patchProfile(request, token, { name: seed.name, tone: seed.tone })
})

test.describe('setup wizard', () => {
  test('step 1 autosaves the brand voice on blur with If-Match and continues to step 2', async ({ page, request }) => {
    await loginAs(page, USERS.bharat.owner, '/setup/brand')
    await expect(page.getByRole('heading', { name: 'Tell us about your brand once' })).toBeVisible()
    await expect(page.getByLabel('Brand name')).toHaveValue(seed.name)

    const voice = `Plain and warm, e2e ${Date.now()}`
    const patch = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith('/api/v1/tenants/me'))
    await page.getByLabel('Brand voice').fill(voice)
    await page.getByLabel('Brand name').focus() // blur the voice field
    const req = await patch
    expect(req.headers()['if-match']).toMatch(/^"/)
    expect(req.postDataJSON()).toEqual({ tone: voice })
    await expect(page.getByTestId('setup-footer-status')).toContainText('Saved automatically')

    const token = await ownerToken(request)
    expect((await getProfile(request, token)).body.tone).toBe(voice)

    await page.getByTestId('setup-continue').click()
    await expect(page).toHaveURL(/\/setup\/compliance$/)
    await shot(page, 'compliance')
  })

  test('fields with no API render disabled under one banner', async ({ page }) => {
    await loginAs(page, USERS.bharat.owner, '/setup/brand')
    await expect(page.getByText('Some fields can’t be saved yet')).toHaveCount(1)
    for (const label of ['Legal business name', 'Brand website', 'Short brand description']) {
      await expect(page.getByLabel(label)).toBeDisabled()
    }
    await expect(page.getByRole('button', { name: 'Read my site' })).toHaveAttribute('aria-disabled', 'true')

    await page.goto('/setup/compliance')
    await expect(page.getByText('Compliance defaults can’t be saved yet')).toHaveCount(1)
    for (const label of ['Customer care email', 'Customer care phone', 'Registered address', 'GST number']) {
      await expect(page.getByLabel(label)).toBeDisabled()
    }
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page).toHaveURL(/\/setup\/brand$/)
  })

  test('a newer save elsewhere shows the stale banner and keeps my change for the re-save', async ({ page, request }) => {
    await loginAs(page, USERS.bharat.owner, '/setup/brand')
    await expect(page.getByLabel('Brand name')).toHaveValue(seed.name)

    // Someone else saves after this page read the profile.
    const token = await ownerToken(request)
    const theirName = `${seed.name} (renamed e2e)`
    await patchProfile(request, token, { name: theirName })

    const mine = `Mine e2e ${Date.now()}`
    await page.getByLabel('Brand voice').fill(mine)
    await page.getByTestId('setup-continue').click()
    await expect(page.getByText('Someone saved a newer version')).toBeVisible()
    await expect(page.getByLabel('Brand name')).toHaveValue(theirName)
    await expect(page.getByLabel('Brand voice')).toHaveValue(mine)
    await shot(page, 'stale')

    await page.getByTestId('setup-continue').click()
    await expect(page).toHaveURL(/\/setup\/compliance$/)
    const after = (await getProfile(request, token)).body
    expect(after).toMatchObject({ name: theirName, tone: mine })
  })

  test('Save and exit saves first, then goes Home', async ({ page, request }) => {
    await loginAs(page, USERS.bharat.owner, '/setup/brand')
    const voice = `Exit e2e ${Date.now()}`
    await page.getByLabel('Brand voice').fill(voice)
    await page.getByTestId('save-and-exit').click()
    await expect(page).toHaveURL(/\/home$/)
    expect((await getProfile(request, await ownerToken(request))).body.tone).toBe(voice)
  })

  test('step 3 lists real connections; unsupported marketplaces are waitlist-only', async ({ page, request }) => {
    const token = await ownerToken(request)
    const res = await request.get(`${API_URL}/api/v1/marketplaces/accounts?limit=200`, { headers: { Authorization: `Bearer ${token}` } })
    const accounts = ((await res.json()) as { data: { marketplace: string; status: string }[] }).data
    const active = accounts.filter((a) => a.status === 'active')

    await loginAs(page, USERS.bharat.owner, '/setup/marketplaces')
    await expect(page.getByRole('heading', { name: 'Where do you sell?' })).toBeVisible()
    for (const id of ['myntra', 'ajio', 'meesho', 'nykaa']) {
      await expect(page.getByTestId(`setup-mp-${id}`).getByRole('button', { name: 'Join waitlist' })).toHaveAttribute('aria-disabled', 'true')
    }
    for (const mp of ['amazon', 'flipkart']) {
      const row = page.getByTestId(`setup-mp-${mp}`)
      if (active.some((a) => a.marketplace === mp)) await expect(row).toContainText('Connected')
      else await expect(row).not.toContainText('Connected')
    }
    if (active.length) await expect(page.getByTestId('setup-finish')).toBeEnabled()
    else await expect(page.getByTestId('setup-finish')).toBeDisabled()
    await shot(page, 'marketplaces')

    await page.getByTestId('setup-skip').click()
    await expect(page).toHaveURL(/\/home$/)
  })

  test('a reviewer can look through setup but not change the profile', async ({ page }) => {
    await loginAs(page, USERS.bharat.reviewer, '/setup/brand')
    await expect(page.getByText('Only owners and admins can change the brand profile')).toBeVisible()
    await expect(page.getByLabel('Brand name')).toHaveAttribute('readonly', '')
    let patched = false
    page.on('request', (r) => {
      if (r.method() === 'PATCH' && r.url().endsWith('/tenants/me')) patched = true
    })
    await page.getByTestId('setup-continue').click()
    await expect(page).toHaveURL(/\/setup\/compliance$/)
    expect(patched).toBe(false)
  })
})
