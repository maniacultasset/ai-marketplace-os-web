import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'
import { ARTIFACTS, BASE_URL } from './env'
import { apiLogin, expect, loginAs, test, TENANTS, USERS, visibleNavIds } from './fixtures'

/**
 * /team and /account against the live backend. Every mutation is checked by re-reading
 * GET /members through the API, and the seed state (roles + active) is restored after each test.
 */

const SHOTS = ARTIFACTS
const SEED_ROLES: Record<string, 'owner' | 'operator' | 'reviewer' | 'admin'> = {
  [USERS.acme.owner]: 'owner',
  [USERS.acme.operator]: 'operator',
  [USERS.acme.reviewer]: 'reviewer',
  [USERS.acme.admin]: 'admin',
}

interface MemberOut {
  user_id: string
  email: string
  display_name: string | null
  role: string
  is_active: boolean
}

let owner: { ctx: APIRequestContext; token: string }

async function listMembers(): Promise<MemberOut[]> {
  const res = await owner.ctx.get('/api/v1/members?limit=50', { headers: { Authorization: `Bearer ${owner.token}` } })
  expect(res.status()).toBe(200)
  return ((await res.json()) as { data: MemberOut[] }).data
}

async function member(email: string) {
  const m = (await listMembers()).find((x) => x.email === email)
  if (!m) throw new Error(`no member ${email}`)
  return m
}

async function restoreSeed() {
  for (const m of await listMembers()) {
    const role = SEED_ROLES[m.email]
    if (!role || (m.role === role && m.is_active)) continue
    const res = await owner.ctx.patch(`/api/v1/members/${m.user_id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: m.role !== role ? { role } : { is_active: true },
    })
    expect(res.status()).toBe(200)
    if (m.role !== role && !m.is_active) {
      await owner.ctx.patch(`/api/v1/members/${m.user_id}`, {
        headers: { Authorization: `Bearer ${owner.token}` },
        data: { is_active: true },
      })
    }
  }
}

const row = (page: Page, email: string) => page.getByRole('row').filter({ hasText: email })

test.describe('team and account', () => {
  test.beforeAll(async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL })
    const tokens = await apiLogin(ctx, USERS.acme.owner)
    owner = { ctx, token: tokens.access_token }
    await restoreSeed()
  })
  test.afterEach(async () => {
    await restoreSeed()
  })
  test.afterAll(async () => {
    await owner.ctx.dispose()
  })

  test('owner sees every member oldest first with "You" on their own row', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/team')
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()
    const emails = page.getByTestId('member-email')
    await expect(emails).toHaveCount(4)
    const api = await listMembers()
    await expect(emails).toHaveText(api.map((m) => m.email))
    expect(api[0]!.email).toBe(USERS.acme.owner)
    expect(new Set(api.map((m) => m.email))).toEqual(new Set(Object.keys(SEED_ROLES)))

    await expect(row(page, USERS.acme.owner).getByTestId('you-badge')).toBeVisible()
    await expect(page.getByTestId('you-badge')).toHaveCount(1)
    await expect(page.getByTestId('members-count')).toHaveText('4 members · 4 active')
    await expect(page.getByTestId('approvals-note')).toBeVisible()
    // No invite (no endpoint), no load more (single page).
    await expect(page.getByRole('button', { name: /invite/i })).toHaveCount(0)
    await expect(page.getByTestId('load-more')).toHaveCount(0)
    expect(await visibleNavIds(page)).toContain('team')
    await page.screenshot({ path: `${SHOTS}/team-account-owner.png`, fullPage: true })
  })

  test('operator and reviewer: Team hidden from nav and /team is forbidden', async ({ page }) => {
    for (const email of [USERS.acme.operator, USERS.acme.reviewer]) {
      let membersCalled = false
      page.on('request', (r) => {
        if (r.url().includes('/api/v1/members')) membersCalled = true
      })
      await loginAs(page, email, '/team')
      await expect(page.getByText("You don't have access to this page")).toBeVisible()
      expect(await visibleNavIds(page)).not.toContain('team')
      expect(membersCalled).toBe(false)
      if (email === USERS.acme.operator) await page.screenshot({ path: `${SHOTS}/team-account-forbidden.png` })
      await page.evaluate(() => localStorage.clear())
    }
  })

  test('owner changes a role; the server answer is shown and persisted', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/team')
    const r = row(page, USERS.acme.reviewer)
    await r.getByTestId('role-select').click()
    // Every role is offered to an owner.
    await expect(page.getByRole('option')).toHaveCount(4)
    const patch = page.waitForResponse((res) => res.url().includes('/api/v1/members/') && res.request().method() === 'PATCH')
    await page.getByRole('option', { name: /^Operator/ }).click()
    const res = await patch
    expect(res.status()).toBe(200)
    await expect(r.getByTestId('role-select')).toHaveText(/Operator/)
    expect((await member(USERS.acme.reviewer)).role).toBe('operator')

    // Survives a reload (DB-backed, not local state).
    await page.reload()
    await expect(row(page, USERS.acme.reviewer).getByTestId('role-select')).toHaveText(/Operator/)
  })

  test('sole owner cannot demote themselves: 409 inline, control reverted', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/team')
    const r = row(page, USERS.acme.owner)
    await r.getByTestId('role-select').click()
    await page.getByRole('option', { name: /^Admin/ }).click()
    // Own role change asks first.
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Change your own role to Admin?')
    const patch = page.waitForResponse((res) => res.url().includes('/api/v1/members/') && res.request().method() === 'PATCH')
    await dialog.getByRole('button', { name: 'Change role' }).click()
    const res = await patch
    expect(res.status()).toBe(409)
    const err = r.getByTestId('member-error')
    await expect(err).toContainText('A brand must keep at least one active owner.')
    await expect(err.getByTestId('error-reference')).toHaveText(res.headers()['x-request-id']!)
    await expect(r.getByTestId('role-select')).toHaveText(/Owner/)
    expect((await member(USERS.acme.owner)).role).toBe('owner')
    await page.screenshot({ path: `${SHOTS}/team-account-last-owner.png` })

    // Deactivating the sole owner is refused the same way.
    await r.getByTestId('active-switch').click()
    await expect(page.getByRole('alertdialog')).toContainText('Deactivate yourself?')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Deactivate' }).click()
    await expect(r.getByTestId('member-error')).toContainText('A brand must keep at least one active owner.')
    await expect(r.getByTestId('member-error')).toHaveCount(1) // the role cell's older error is gone
    await expect(r.getByTestId('active-switch')).toBeChecked()
    expect((await member(USERS.acme.owner)).is_active).toBe(true)
  })

  test('admin: owner row locked, no owner option, own role locked, own toggle allowed', async ({ page }) => {
    await loginAs(page, USERS.acme.admin, '/team')
    const ownerRow = row(page, USERS.acme.owner)
    await expect(ownerRow.getByTestId('role-select')).toBeDisabled()
    await expect(ownerRow.getByTestId('active-switch')).toBeDisabled()
    const self = row(page, USERS.acme.admin)
    await expect(self.getByTestId('you-badge')).toBeVisible()
    await expect(self.getByTestId('role-select')).toBeDisabled()
    await expect(self.getByTestId('active-switch')).toBeEnabled()

    await row(page, USERS.acme.operator).getByTestId('role-select').click()
    await expect(page.getByRole('option')).toHaveCount(3)
    await expect(page.getByRole('option', { name: /^Owner/ })).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/team-account-admin.png` })
    await page.keyboard.press('Escape')

    // Admin can still change a non-owner's role.
    const patch = page.waitForResponse((res) => res.url().includes('/api/v1/members/') && res.request().method() === 'PATCH')
    await row(page, USERS.acme.operator).getByTestId('role-select').click()
    await page.getByRole('option', { name: /^Reviewer/ }).click()
    expect((await patch).status()).toBe(200)
    await expect(row(page, USERS.acme.operator).getByTestId('role-select')).toHaveText(/Reviewer/)
    expect((await member(USERS.acme.operator)).role).toBe('reviewer')
  })

  test('owner deactivates a member; their open session is bounced to /login', async ({ page, browser }) => {
    const other = await browser.newContext()
    const opPage = await other.newPage()
    await loginAs(opPage, USERS.acme.operator, '/account')
    await expect(opPage.getByTestId('account-email')).toHaveText(USERS.acme.operator)

    await loginAs(page, USERS.acme.owner, '/team')
    const r = row(page, USERS.acme.operator)
    await r.getByTestId('active-switch').click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText(`Deactivate ${USERS.acme.operator}?`)
    const patch = page.waitForResponse((res) => res.url().includes('/api/v1/members/') && res.request().method() === 'PATCH')
    await dialog.getByRole('button', { name: 'Deactivate' }).click()
    const res = await patch
    expect(res.status()).toBe(200)
    await expect(r.getByTestId('member-status')).toHaveText('Inactive')
    await expect(r.getByTestId('active-switch')).not.toBeChecked()
    await expect(page.getByTestId('members-count')).toHaveText('4 members · 3 active')
    expect((await member(USERS.acme.operator)).is_active).toBe(false)
    await page.screenshot({ path: `${SHOTS}/team-account-inactive.png` })

    // The operator's next call fails (membership probe 401, refresh revoked) -> /login.
    await opPage.reload()
    await expect(opPage).toHaveURL(/\/login/)
    await other.close()

    // Reactivate from the UI (no confirm needed).
    const re = page.waitForResponse((x) => x.url().includes('/api/v1/members/') && x.request().method() === 'PATCH')
    await r.getByTestId('active-switch').click()
    expect((await re).status()).toBe(200)
    await expect(r.getByTestId('member-status')).toHaveText('Active')
    expect((await member(USERS.acme.operator)).is_active).toBe(true)
  })

  test('admin deactivating themselves is signed out here', async ({ page }) => {
    await loginAs(page, USERS.acme.admin, '/team')
    await row(page, USERS.acme.admin).getByTestId('active-switch').click()
    await expect(page.getByRole('alertdialog')).toContainText('You will be signed out of this brand')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Deactivate' }).click()
    await expect(page).toHaveURL(/\/login/)
    expect(await page.evaluate(() => localStorage.getItem('mkos.rt'))).toBeNull()
    expect((await member(USERS.acme.admin)).is_active).toBe(false)
  })

  test('members list failure shows an error state with retry', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/account')
    await page.route('**/api/v1/members*', (route) => route.abort('connectionrefused'))
    await page.getByRole('link', { name: 'Manage team' }).click()
    const table = page.getByRole('table', { name: 'Team members' })
    await expect(table.getByRole('alert')).toContainText("Can't reach the server", { timeout: 20_000 })
    await page.screenshot({ path: `${SHOTS}/team-account-error.png` })
    await page.unroute('**/api/v1/members*')
    await table.getByRole('button', { name: /retry/i }).click()
    await expect(page.getByTestId('member-email')).toHaveCount(4)
  })

  test('account shows profile and memberships from /auth/me; sign out', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/account')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
    await expect(page.getByTestId('account-email')).toHaveText(USERS.acme.owner)
    await expect(page.getByTestId('account-role')).toHaveText('Owner')
    await expect(page.getByText('Not set')).toBeVisible()
    await expect(page.getByText(TENANTS.acme.id)).toBeVisible()
    const memberships = page.getByTestId('membership-row')
    await expect(memberships).toHaveCount(1)
    await expect(memberships.first()).toContainText(TENANTS.acme.name)
    await expect(memberships.first()).toContainText('Current')
    await page.screenshot({ path: `${SHOTS}/team-account-account.png`, fullPage: true })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.screenshot({ path: `${SHOTS}/team-account-account-mobile.png`, fullPage: true })
    await page.goto('/team')
    await expect(page.getByTestId('member-email')).toHaveCount(4)
    // Every column (Status included) fits at 375px without scrolling the table sideways.
    const container = page.locator('[data-slot="table-container"]')
    const { scrollWidth, clientWidth } = await container.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeInViewport({ ratio: 1 })
    for (const sw of await page.getByTestId('active-switch').all()) await expect(sw).toBeInViewport({ ratio: 1 })
    for (const sel of await page.getByTestId('role-select').all()) await expect(sel).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: `${SHOTS}/team-account-team-mobile.png`, fullPage: true })
    await page.goto('/account')
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.getByTestId('account-email')).toHaveText(USERS.acme.owner)

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.waitForTimeout(500) // let the theme transition settle for the screenshot
    await page.screenshot({ path: `${SHOTS}/team-account-account-dark.png`, fullPage: true })
    await page.emulateMedia({ colorScheme: 'light' })

    const rt = await page.evaluate(() => localStorage.getItem('mkos.rt'))
    await page.getByTestId('account-sign-out').click()
    await expect(page).toHaveURL(/\/login/)
    expect(await page.evaluate(() => localStorage.getItem('mkos.rt'))).toBeNull()
    const refresh = await page.request.post('/api/v1/auth/refresh', { data: { refresh_token: rt } })
    expect(refresh.status()).toBe(401)
  })

  test('operator account page: read-only profile, no team link', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/account')
    await expect(page.getByTestId('account-role')).toHaveText('Operator')
    await expect(page.getByRole('link', { name: 'Manage team' })).toHaveCount(0)
  })
  test('403 on a row whose role changed elsewhere: inline error, row re-read from the server and locked', async ({ page }) => {
    await loginAs(page, USERS.acme.admin, '/team')
    await expect(page.getByTestId('member-email')).toHaveCount(4)
    const op = await member(USERS.acme.operator)
    // Another owner promotes the operator while the admin's page still shows "Operator".
    const promote = await owner.ctx.patch(`/api/v1/members/${op.user_id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: { role: 'owner' },
    })
    expect(promote.status()).toBe(200)

    const r = row(page, USERS.acme.operator)
    await expect(r.getByTestId('role-select')).toHaveText(/Operator/)
    await expect(r.getByTestId('active-switch')).toBeEnabled()
    const patch = page.waitForResponse((res) => res.url().includes('/api/v1/members/') && res.request().method() === 'PATCH')
    const refetch = page.waitForRequest((q) => q.method() === 'GET' && new URL(q.url()).pathname === '/api/v1/members')
    await r.getByTestId('role-select').click()
    await page.getByRole('option', { name: /^Reviewer/ }).click()
    const res = await patch
    expect(res.status()).toBe(403)
    await refetch
    const err = r.getByTestId('member-error')
    await expect(err).toContainText("You can't change this member.")
    await expect(err.getByTestId('error-reference')).toHaveText(res.headers()['x-request-id']!)
    // The row now shows the server's answer and the admin can no longer edit it.
    await expect(r.getByTestId('role-select')).toHaveText(/Owner/)
    await expect(r.getByTestId('role-select')).toBeDisabled()
    await expect(r.getByTestId('active-switch')).toBeDisabled()
    expect((await member(USERS.acme.operator)).role).toBe('owner')
  })

  test('404 on a member PATCH: toast with reference and the list is re-read', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/team')
    await expect(page.getByTestId('member-email')).toHaveCount(4)
    const ref = 'e2e-404-member-ref'
    // The member being removed between load and click cannot be produced through the API (no
    // remove endpoint), so only this PATCH's answer is replaced; everything else is live.
    await page.route('**/api/v1/members/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 404,
            headers: { 'content-type': 'application/json', 'x-request-id': ref },
            body: JSON.stringify({ error: { type: 'NOT_FOUND', message: 'Member not found.', status: 404, correlation_id: ref } }),
          })
        : route.continue(),
    )
    const refetch = page.waitForRequest((q) => q.method() === 'GET' && new URL(q.url()).pathname === '/api/v1/members')
    const r = row(page, USERS.acme.reviewer)
    await r.getByTestId('role-select').click()
    await page.getByRole('option', { name: /^Operator/ }).click()
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'This member is no longer in this brand.' })
    await expect(toast).toBeVisible()
    await expect(toast).toContainText(`Reference: ${ref}`)
    await refetch
    await expect(r.getByTestId('member-error')).toHaveCount(0)
    await expect(r.getByTestId('role-select')).toHaveText(/Reviewer/)
    await page.unroute('**/api/v1/members/*')
  })

  test('one PATCH per row at a time: the other control is disabled while one is saving', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/team')
    const r = row(page, USERS.acme.reviewer)
    await expect(r.getByTestId('active-switch')).toBeEnabled()
    let release!: () => void
    const held = new Promise<void>((res) => (release = res))
    await page.route('**/api/v1/members/*', async (route) => {
      if (route.request().method() === 'PATCH') await held
      await route.continue()
    })
    const patch = page.waitForResponse((res) => res.url().includes('/api/v1/members/') && res.request().method() === 'PATCH')
    await r.getByTestId('role-select').click()
    await page.getByRole('option', { name: /^Operator/ }).click()
    await expect(r.getByLabel('Saving role')).toBeVisible()
    await expect(r.getByTestId('active-switch')).toBeDisabled()
    await expect(r.getByTestId('role-select')).toBeDisabled()
    release()
    expect((await patch).status()).toBe(200)
    await expect(r.getByTestId('role-select')).toHaveText(/Operator/)
    await expect(r.getByTestId('active-switch')).toBeEnabled()
    await expect(r.getByTestId('active-switch')).toBeChecked()
    await page.unroute('**/api/v1/members/*')
    const m = await member(USERS.acme.reviewer)
    expect(m.role).toBe('operator')
    expect(m.is_active).toBe(true)
  })

  test('keyboard: closing a confirm dialog returns focus to the control that opened it', async ({ page }) => {
    await loginAs(page, USERS.acme.admin, '/team')
    const sw = row(page, USERS.acme.admin).getByTestId('active-switch')
    await sw.focus()
    await page.keyboard.press('Space')
    await expect(page.getByRole('alertdialog')).toContainText('Deactivate yourself?')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(sw).toBeFocused()
    await sw.focus()
    await page.keyboard.press('Space')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(sw).toBeFocused()
    expect((await member(USERS.acme.admin)).is_active).toBe(true)
    await page.evaluate(() => localStorage.clear())

    await loginAs(page, USERS.acme.owner, '/team')
    const sel = row(page, USERS.acme.owner).getByTestId('role-select')
    await sel.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('option', { name: /^Admin/ }).click()
    await expect(page.getByRole('alertdialog')).toContainText('Change your own role to Admin?')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(sel).toBeFocused()
    expect((await member(USERS.acme.owner)).role).toBe('owner')
  })

  for (const status of [500, 429, 403] as const) {
    test(`account: brand switch failing with ${status} shows a toast with the reference`, async ({ page }) => {
      // Seeded users belong to one brand, so /auth/me gets a second (real) brand appended to
      // show the Switch button; the switch call's failure is then forced.
      await page.route('**/api/v1/auth/me', async (route) => {
        const res = await route.fetch()
        const body = (await res.json()) as { memberships: { tenant_id: string; tenant_name: string; role: string }[] }
        body.memberships.push({ tenant_id: TENANTS.bharat.id, tenant_name: TENANTS.bharat.name, role: 'operator' })
        await route.fulfill({ response: res, json: body })
      })
      const ref = `e2e-switch-${status}`
      const type = status === 500 ? 'INTERNAL_ERROR' : status === 429 ? 'RATE_LIMITED' : 'PERMISSION_DENIED'
      await page.route('**/api/v1/auth/switch-tenant', (route) =>
        route.fulfill({
          status,
          headers: { 'content-type': 'application/json', 'x-request-id': ref, ...(status === 429 ? { 'retry-after': '30' } : {}) },
          body: JSON.stringify({ error: { type, message: 'Failed.', status, correlation_id: ref } }),
        }),
      )
      await loginAs(page, USERS.acme.owner, '/account')
      const other = page.getByTestId('membership-row').filter({ hasText: TENANTS.bharat.name })
      await other.getByRole('button', { name: 'Switch' }).click()
      const toast = page.locator('[data-sonner-toast]').filter({ hasText: "Couldn't switch brand" })
      await expect(toast).toBeVisible()
      await expect(toast).toContainText(`Reference: ${ref}`)
      await expect(other.getByRole('button', { name: 'Switch' })).toBeEnabled()
      await expect(page).toHaveURL(/\/account/)
    })
  }
})
