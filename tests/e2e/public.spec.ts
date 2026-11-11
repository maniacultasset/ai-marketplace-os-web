import { expect, test } from './fixtures'

/**
 * Public pages against the live backend: landing, privacy, sign-up (POST /signup →
 * POST /signup/status) and the status check. No stubs.
 */
test.describe('public pages', () => {
  test('landing shows one call to action and honest marketplace status', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every Indian marketplace')
    await expect(page.getByTestId('hero-example')).toHaveAccessibleName('How Kuinn turns your products into Amazon listings')
    await expect(page.getByTestId('hero-example')).not.toContainText('Example')
    await expect(page.getByTestId('market-live')).toContainText('Amazon')
    await expect(page.getByTestId('market-soon')).toContainText('Flipkart')
    await expect(page.getByTestId('market-soon')).toContainText('Next')
    await expect(page.getByTestId('market-roadmap')).toContainText('Myntra')
    await page.getByTestId('landing-cta').click()
    await expect(page).toHaveURL(/\/signup$/)
  })

  test('on a 375 phone the first call to action is above the fold and nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    const cta = await page.getByTestId('landing-cta').boundingBox()
    expect(cta).not.toBeNull()
    expect(cta!.y + cta!.height).toBeLessThan(600)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    // The hero loop has no visible controls (it holds only off screen and in a hidden tab), and the final call to action leads with Amazon.
    await expect(page.getByTestId('hero-example').getByRole('button')).toHaveCount(0)
    await expect(page.getByTestId('cta-lockup').locator('[data-marketplace="amazon"] img')).toBeVisible()
  })

  test('privacy policy is final, names the company and has anchors', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.locator('[data-placeholder]')).toHaveCount(0)
    await expect(page.getByRole('article')).toContainText('Maniacult Technology Pvt Ltd')
    await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: /Grievance Officer/ }).click()
    await expect(page).toHaveURL(/#grievance-officer$/)
  })

  test('terms page loads and /privacy-policy redirects to the policy', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.getByRole('heading', { level: 1, name: 'Terms and Conditions' })).toBeVisible()
    await page.goto('/privacy-policy')
    await expect(page).toHaveURL(/\/privacy$/)
  })

  test('sign-up requires the privacy box and shows the pending state from /signup/status', async ({ page }) => {
    const email = `e2e-public-${Date.now()}@example.com`
    const password = 'correct horse battery staple'
    await page.goto('/signup')
    await expect(page.getByText('Coming soon')).toHaveCount(0)

    await page.getByLabel('Brand name').fill('E2E Public Brand')
    await page.getByLabel('Your name').fill('E2E Owner')
    await page.getByLabel('Work email').fill(email)
    await page.locator('#password').fill(password)
    await page.getByTestId('signup-submit').click()
    await expect(page.getByText('Agree to the terms and confirm that you have read the privacy policy.')).toBeVisible()

    await page.getByTestId('signup-agree').click()
    const created = page.waitForResponse((r) => r.url().endsWith('/api/v1/signup') && r.request().method() === 'POST')
    // The status panel polls with the sign-up's status handle (body only), never the password.
    const status = page.waitForResponse((r) => r.url().endsWith('/api/v1/signup/status/poll'))
    await page.getByTestId('signup-submit').click()
    expect((await created).status()).toBe(202)
    expect((await status).status()).toBe(200)
    await expect(page.getByTestId('signup-sent-brand')).toHaveText('E2E Public Brand')
    await expect(page.getByTestId('signup-live-chip')).toHaveText('Waiting for review')

    await page.getByTestId('signup-sent-status').click()
    await expect(page).toHaveURL(/\/signup\/status\?email=/)
    // The handle kept on this device opens the live status without the password.
    await expect(page.getByTestId('signup-status-badge')).toHaveText('Waiting for review')
    await expect(page.getByText(/This page updates by itself/)).toBeVisible()
    await page.getByTestId('signup-status-another').click()
    await page.getByLabel('Password').fill(password)
    await page.getByTestId('signup-status-submit').click()
    await expect(page.getByTestId('signup-status-badge')).toHaveText('Waiting for review')
  })

  test('status check with unknown credentials shows one 401 message with a reference', async ({ page }) => {
    await page.goto('/signup/status')
    await page.getByLabel('Email').fill(`nobody-${Date.now()}@example.com`)
    await page.getByLabel('Password').fill('not a real password')
    await page.getByTestId('signup-status-submit').click()
    await expect(page.getByTestId('signup-status-error')).toContainText('No sign-up request matches')
  })
})
