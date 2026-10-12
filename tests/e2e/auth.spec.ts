import {
  apiLogin,
  countRefreshes,
  expect,
  loginAs,
  loginViaUi,
  TENANTS,
  test,
  USERS,
  visibleNavIds,
} from './fixtures'

test.describe('auth', () => {
  test('login succeeds and the shell shows tenant and role from /auth/me', async ({ page }) => {
    await page.goto('/login')
    const loginResponse = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/login'))
    await loginViaUi(page, USERS.acme.owner)
    expect((await loginResponse).status()).toBe(200)

    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByTestId('tenant-name')).toHaveText(TENANTS.acme.name)
    await expect(page.getByTestId('role-badge')).toHaveText('owner')
    expect(await page.evaluate(() => localStorage.getItem('mkos.rt'))).toBeTruthy()
  })

  test('wrong password shows an inline error and stays on /login', async ({ page }) => {
    await page.goto('/login')
    const loginResponse = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/login'))
    await loginViaUi(page, USERS.acme.reviewer, 'not-the-password')
    const res = await loginResponse
    expect(res.status()).toBe(401)

    const error = page.getByTestId('login-error')
    await expect(error).toContainText('Email or password is incorrect.')
    // The reference shown equals the response X-Request-ID.
    await expect(error.getByTestId('error-reference')).toHaveText(res.headers()['x-request-id']!)
    await expect(page).toHaveURL(/\/login/)
    expect(await page.evaluate(() => localStorage.getItem('mkos.rt'))).toBeNull()
  })

  test('the password can be shown and hidden without losing focus or the value', async ({ page }) => {
    await page.goto('/login')
    const password = page.getByLabel('Password', { exact: true })
    await password.fill('secret value')
    await expect(password).toHaveAttribute('type', 'password')
    const toggle = page.getByRole('button', { name: 'Show password' })
    await toggle.click()
    await expect(password).toHaveAttribute('type', 'text')
    await expect(password).toHaveValue('secret value')
    await expect(page.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Hide password' }).click()
    await expect(password).toHaveAttribute('type', 'password')
  })

  test('client validation blocks an invalid email without a request', async ({ page }) => {
    await page.goto('/login')
    let sent = false
    page.on('request', (r) => {
      if (r.url().endsWith('/auth/login')) sent = true
    })
    await loginViaUi(page, 'owner@')
    await expect(page.getByText('Enter a valid email address.')).toBeVisible()
    expect(sent).toBe(false)
  })

  test('protected route redirects to /login and returns after sign-in', async ({ page }) => {
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login\?redirect=%2Faccount/)
    await loginViaUi(page, USERS.acme.operator)
    await expect(page).toHaveURL(/\/account$/)
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
    await expect(page.getByText(USERS.acme.operator).first()).toBeVisible()
  })

  test('logout clears the session and revokes the refresh token family', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/account')
    const rt = await page.evaluate(() => localStorage.getItem('mkos.rt'))
    expect(rt).toBeTruthy()

    const logoutCall = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/logout'))
    await page.getByTestId('user-menu').click()
    await page.getByTestId('sign-out').click()
    expect((await logoutCall).status()).toBe(204)

    await expect(page).toHaveURL(/\/login/)
    expect(await page.evaluate(() => localStorage.getItem('mkos.rt'))).toBeNull()
    const reuse = await page.request.post('/api/v1/auth/refresh', { data: { refresh_token: rt } })
    expect(reuse.status()).toBe(401)

    // Protected pages are closed again.
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login/)
  })

  test('session survives a reload (restored through refresh)', async ({ page }) => {
    await loginAs(page, USERS.acme.admin, '/account')
    const before = await page.evaluate(() => localStorage.getItem('mkos.rt'))
    const refreshes = countRefreshes(page)

    await page.reload()
    await expect(page).toHaveURL(/\/account$/)
    await expect(page.getByText(USERS.acme.admin).first()).toBeVisible()
    await expect(page.getByTestId('role-badge')).toHaveText('admin')
    expect(refreshes()).toBe(1)
    const after = await page.evaluate(() => localStorage.getItem('mkos.rt'))
    expect(after).toBeTruthy()
    expect(after).not.toBe(before) // rotated
  })

  test('parallel 401s trigger exactly one refresh (single flight)', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/account')
    const refreshes = countRefreshes(page)
    await page.evaluate(() => (window as unknown as { __mkosTest: { corruptAccess(): void } }).__mkosTest.corruptAccess())

    // Diagnostics fires five capability probes at once.
    await page.getByTestId('user-menu').click()
    await page.getByRole('menuitem', { name: 'Diagnostics' }).click()
    await expect(page.getByTestId('probe-brand').locator('[data-result]')).toBeVisible()
    for (const cap of ['brand', 'listings.generate', 'listings.review', 'images', 'analytics']) {
      await expect(page.getByTestId(`probe-${cap}`).locator('[data-result]')).toHaveAttribute('data-result', /live|stub/)
    }
    expect(refreshes()).toBe(1)
    await expect(page.getByTestId('role-badge')).toHaveText('owner')
  })

  test('two tabs share one refresh and both keep working', async ({ context, page }) => {
    await loginAs(page, USERS.acme.owner, '/account')
    const second = await context.newPage()
    await second.goto('/account')
    await expect(second.getByTestId('user-menu')).toBeVisible()

    const r1 = countRefreshes(page)
    const r2 = countRefreshes(second)
    const corrupt = () => (window as unknown as { __mkosTest: { corruptAccess(): void } }).__mkosTest.corruptAccess()
    await page.evaluate(corrupt)
    await second.evaluate(corrupt)

    for (const p of [page, second]) {
      await p.getByTestId('user-menu').click()
      await p.getByRole('menuitem', { name: 'Diagnostics' }).click()
    }
    for (const p of [page, second]) {
      await expect(p.getByTestId('probe-images').locator('[data-result]')).toHaveAttribute('data-result', /live|stub/)
    }
    expect(r1() + r2()).toBe(1)
  })

  test('role-gated navigation differs between owner and reviewer', async ({ browser }) => {
    const ownerCtx = await browser.newContext()
    const reviewerCtx = await browser.newContext()
    const owner = await ownerCtx.newPage()
    const reviewer = await reviewerCtx.newPage()
    await loginAs(owner, USERS.acme.owner, '/account')
    await loginAs(reviewer, USERS.acme.reviewer, '/account')

    await expect(owner.getByTestId('role-badge')).toHaveText('owner')
    await expect(reviewer.getByTestId('role-badge')).toHaveText('reviewer')

    // Main nav: whatever the reviewer sees, the owner sees too; Team is never shown to reviewers.
    const ownerNav = await visibleNavIds(owner)
    const reviewerNav = await visibleNavIds(reviewer)
    expect(reviewerNav).not.toContain('team')
    for (const id of reviewerNav) expect(ownerNav).toContain(id)

    // User menu: Diagnostics needs settings:manage (owner, admin), Account is for everyone.
    await owner.getByTestId('user-menu').click()
    await expect(owner.getByRole('menuitem', { name: 'Diagnostics' })).toBeVisible()
    await expect(owner.getByRole('menuitem', { name: 'Account' })).toBeVisible()
    await reviewer.getByTestId('user-menu').click()
    await expect(reviewer.getByRole('menuitem', { name: 'Account' })).toBeVisible()
    await expect(reviewer.getByRole('menuitem', { name: 'Diagnostics' })).toHaveCount(0)

    // Direct URL still renders Forbidden in place for the reviewer.
    await reviewer.keyboard.press('Escape')
    await reviewer.goto('/about')
    await expect(reviewer.getByText("You don't have access to this page")).toBeVisible()
    await expect(reviewer).toHaveURL(/\/about$/)

    await ownerCtx.close()
    await reviewerCtx.close()
  })

  test('another tenant user sees their own brand', async ({ page }) => {
    await loginAs(page, USERS.bharat.reviewer, '/account')
    await expect(page.getByTestId('tenant-name')).toHaveText(TENANTS.bharat.name)
    // Single membership: the brand renders as a static label, not a switcher.
    await expect(page.getByRole('button', { name: 'Switch brand' })).toHaveCount(0)
  })

  test('refresh-token reuse ends the session in the app', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/account')
    const stolen = await page.evaluate(() => localStorage.getItem('mkos.rt'))
    // Rotate in-app (reload restores via refresh), then replay the old token from outside.
    await page.reload()
    await expect(page.getByTestId('user-menu')).toBeVisible()
    const reuse = await page.request.post('/api/v1/auth/refresh', { data: { refresh_token: stolen } })
    expect(reuse.status()).toBe(401)
    // The whole family is revoked: the app's next refresh fails and it returns to /login.
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login\?redirect=%2Faccount/)
    await expect(page.getByText('Your session ended. Sign in again.')).toBeVisible()
  })
})

test('apiLogin helper works for every seeded acme role', async ({ request }) => {
  for (const email of Object.values(USERS.acme)) {
    const t = await apiLogin(request, email)
    expect(t.access_token).toBeTruthy()
  }
})
