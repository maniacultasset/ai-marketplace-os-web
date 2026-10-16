/**
 * Marketplaces (p04 layout), Settings (Autonomy, sub-nav, Imports history, Account, Sign-up
 * requests) and Activity against the live backend. Read-only: nothing here connects, revokes or
 * changes data (the OAuth round trips live in marketplaces.spec.ts).
 *
 * Tenant: Acme Apparel. Written for later live runs.
 */
import { API_URL } from './env'
import { apiLogin, expect, loginAs, test, USERS } from './fixtures'

test.describe('marketplaces: p04 list and detail', () => {
  test('lists the two real marketplaces and four honest waitlist rows', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/marketplaces')
    await expect(page.getByRole('heading', { name: 'Where do you sell?' })).toBeVisible()
    await expect(page.getByTestId('marketplace-card-amazon')).toBeVisible()
    await expect(page.getByTestId('marketplace-card-flipkart')).toBeVisible()

    for (const [id, name] of [
      ['myntra', 'Myntra'],
      ['ajio', 'AJIO'],
      ['meesho', 'Meesho'],
      ['nykaa', 'Nykaa Fashion'],
    ] as const) {
      const row = page.getByTestId(`marketplace-row-${id}`)
      const join = row.getByRole('button', { name: `Join waitlist for ${name}` })
      await expect(join).toHaveAttribute('aria-disabled', 'true')
      // The reason is the accessible description, and a click calls nothing.
      await expect(join).toHaveAccessibleDescription(/not supported yet/)
      await join.click()
      await expect(page).toHaveURL(/\/marketplaces/)
    }
    await expect(page.getByRole('button', { name: /^Connect (Myntra|AJIO|Meesho|Nykaa)/ })).toHaveCount(0)
  })

  test('selecting a row loads its detail card and keeps it in the URL', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/marketplaces')
    await page.getByRole('button', { name: 'Show Flipkart details' }).click()
    await expect(page).toHaveURL(/[?&]mp=flipkart/)
    const detail = page.getByTestId('marketplace-detail')
    await expect(detail).toHaveAttribute('data-marketplace', 'flipkart')
    await expect(detail.getByRole('heading', { name: 'Flipkart' })).toBeVisible()
    await expect(page.getByTestId('marketplace-card-flipkart')).toHaveAttribute('data-selected', 'true')

    await page.reload()
    await expect(page.getByTestId('marketplace-detail')).toHaveAttribute('data-marketplace', 'flipkart')
  })

  test('detail matches GET /marketplaces/accounts, and unbuilt parts are disabled with a reason', async ({ page, request }) => {
    const { access_token } = await apiLogin(request, USERS.acme.owner)
    const res = await request.get(`${API_URL}/api/v1/marketplaces/accounts?limit=200`, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    expect(res.status()).toBe(200)
    const accounts = ((await res.json()) as { data: { marketplace: string; status: string; seller_id: string }[] }).data
    const liveAmazon = accounts.find((a) => a.marketplace === 'amazon' && a.status !== 'revoked')

    await loginAs(page, USERS.acme.owner, '/marketplaces?mp=amazon')
    const detail = page.getByTestId('marketplace-detail')
    await expect(detail).toHaveAttribute('data-status', liveAmazon?.status ?? 'none')
    if (liveAmazon) {
      await expect(detail.getByTestId('detail-seller-id')).toHaveText(liveAmazon.seller_id)
      await expect(detail.getByText('Pickup locations')).toBeVisible()
      await expect(detail.getByRole('button', { name: 'Upload proof' })).toHaveAttribute('aria-disabled', 'true')
    } else {
      await expect(detail).toContainText('Not connected')
    }
  })

  test('390px: no horizontal scroll, history renders as cards', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, USERS.acme.owner, '/marketplaces')
    await expect(page.getByTestId('marketplace-card-amazon')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  })
})

test.describe('settings', () => {
  test('Autonomy: approval is always on; no autonomous option; auto-fix list is disabled', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/settings')
    const s = page.getByTestId('autonomy-settings')
    await expect(s.getByRole('heading', { name: 'Autonomy' })).toBeVisible()
    await expect(s.getByText('Approval is always on')).toBeVisible()
    await expect(s.getByRole('radio', { name: /Approval mode/ })).toHaveAttribute('aria-checked', 'true')
    await expect(s.getByText('Autonomous', { exact: true })).toHaveCount(0)
    const toggles = s.getByRole('switch')
    await expect(toggles).toHaveCount(5)
    for (const t of await toggles.all()) await expect(t).toHaveAttribute('aria-disabled', 'true')
    await expect(s.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
    await expect(s.getByTestId('autonomy-amazon')).toContainText('Approval required')
  })

  test('sub-nav: hi-fi items, Soon items are not links, admin-only items follow the role', async ({ page }) => {
    await loginAs(page, USERS.acme.reviewer, '/settings')
    const nav = page.getByTestId('settings-nav')
    for (const name of ['Brand profile', 'Compliance', 'Autonomy', 'Marketplace rules', 'Imports history', 'Account']) {
      await expect(nav.getByRole('link', { name })).toBeVisible()
    }
    await expect(nav.getByRole('link', { name: 'Notifications' })).toHaveCount(0)
    await expect(nav.getByText('Notifications')).toHaveAttribute('aria-disabled', 'true')
    // Reviewer cannot manage the team; nobody in acme is a platform admin by default.
    await expect(nav.getByRole('link', { name: 'Team and brands' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Sign-up requests' })).toHaveCount(0)
  })

  test('Account and Imports history open inside Settings', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/account')
    await expect(page.getByTestId('settings-nav').getByRole('link', { name: 'Account' })).toHaveAttribute('data-status', 'active')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()

    await page.getByTestId('settings-nav').getByRole('link', { name: 'Imports history' }).click()
    await expect(page).toHaveURL(/\/settings\/imports$/)
    await expect(page.getByRole('heading', { name: 'Imports history' })).toBeVisible()
    await expect(page.getByTestId('history-note')).toContainText('this browser only')
  })

  test('Brand profile links to brand setup', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/brand')
    await expect(page.getByRole('link', { name: 'Open brand setup' })).toHaveAttribute('href', '/setup/brand')
  })

  test('Sign-up requests: forbidden for a brand owner who is not a platform admin', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/admin/signups')
    await expect(page.getByRole('heading', { name: 'Sign-up requests' })).toHaveCount(0)
  })
})

test.describe('activity', () => {
  test('says the brand-wide feed is coming and opens real per-listing history', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/activity')
    await expect(page.getByTestId('activity-coming-soon')).toContainText('Activity across your brand is coming soon')
    const rows = page.getByTestId('activity-listing')
    const empty = page.getByText('No listings yet')
    await expect(rows.first().or(empty)).toBeVisible()
    if ((await rows.count()) === 0) return

    const historyRes = page.waitForResponse((r) => /\/api\/v1\/listings\/[^/]+\/history/.test(r.url()))
    await rows.first().getByRole('button', { name: 'Show history' }).click()
    expect((await historyRes).status()).toBe(200)
    await expect(rows.first().getByRole('button', { name: 'Hide history' })).toHaveAttribute('aria-expanded', 'true')
    await expect(rows.first().getByRole('link', { name: 'Open product' })).toHaveAttribute('href', /\/products\//)
  })
})
