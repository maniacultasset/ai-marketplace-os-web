import { expect, test } from './fixtures'

/**
 * Public pages against the live backend: landing, privacy, sign-up (POST /signup →
 * POST /signup/status) and the status check. No stubs.
 */
test.describe('public pages', () => {
  test('landing shows one call to action and honest marketplace status', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Two marketplaces')
    await expect(page.getByTestId('hero-example')).toContainText('Example')
    await expect(page.getByTestId('market-in-setup')).toContainText('Amazon')
    await expect(page.getByTestId('market-pending')).toContainText('Flipkart')
    await expect(page.locator('[data-status="live"]')).toHaveCount(0)
    await page.getByTestId('landing-cta').click()
    await expect(page).toHaveURL(/\/signup$/)
  })

  test('privacy policy is marked as a draft and has anchors', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByTestId('privacy-draft')).toContainText('Draft, pending legal review')
    await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: /Grievance Officer/ }).click()
    await expect(page).toHaveURL(/#grievance-officer$/)
  })

  test('sign-up requires the privacy box and shows the pending state from /signup/status', async ({ page }) => {
    const email = `e2e-public-${Date.now()}@example.com`
    const password = 'correct horse battery staple'
    await page.goto('/signup')
    await expect(page.getByRole('button', { name: /Continue with Google/ })).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId('signup-describes')).toBeDisabled()

    await page.getByLabel('Brand name').fill('E2E Public Brand')
    await page.getByLabel('Your name').fill('E2E Owner')
    await page.getByLabel('Work email').fill(email)
    await page.locator('#password').fill(password)
    await page.getByTestId('signup-submit').click()
    await expect(page.getByText('Confirm that you have read the privacy policy.')).toBeVisible()

    await page.getByTestId('signup-agree').click()
    const created = page.waitForResponse((r) => r.url().endsWith('/api/v1/signup') && r.request().method() === 'POST')
    const status = page.waitForResponse((r) => r.url().endsWith('/api/v1/signup/status'))
    await page.getByTestId('signup-submit').click()
    expect((await created).status()).toBe(202)
    expect((await status).status()).toBe(200)
    await expect(page.getByTestId('signup-sent-brand')).toHaveText('E2E Public Brand')
    await expect(page.getByTestId('signup-live-chip')).toHaveText('Waiting for review')

    await page.getByTestId('signup-sent-status').click()
    await expect(page).toHaveURL(/\/signup\/status\?email=/)
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
