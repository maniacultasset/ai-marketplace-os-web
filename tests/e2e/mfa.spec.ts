/**
 * Login codes (DPP-1, ADR-0021) end to end against a real local backend, through the UI.
 *
 * Which half runs depends on the API's `MFA_ENFORCEMENT`, probed at the start:
 * - `all` (with `MFA_GRACE_UNTIL` in the future): forced enrolment, the code step, recovery codes,
 *   step-up, the grace notice, forced password changes and the lockout;
 * - `off`: the plain password login still works (regression).
 *
 * Every run creates its own tenant and users through the backend's staff CLI, so it needs
 * E2E_BACKEND_DIR, and never touches the demo seed users the other specs rely on. Codes are
 * computed from the setup key the UI shows (RFC 6238).
 */
import type { Page } from '@playwright/test'
import { expect, fillStable, loginViaUi, test } from './fixtures'
import { BACKEND_DIR, resetRateLimits } from './env'
import {
  Authenticator,
  cli,
  enforcementMode,
  lockState,
  markReturningUser,
  readRecoveryCodes,
  readSetupKey,
  signOut,
} from './mfa-support'

const RUN = String(Date.now()).slice(-8)
const SLUG = `mfa-e2e-${RUN}`
const STAFF = 'staff@kuinn.test'
// Staff-set passwords (they meet the rules, so the CLI accepts them). No letters from any email.
const STAFF_PASSWORD = 'Kq7#Vb2!Lm9$Zp'
const NEW_PASSWORD = 'Rt5%Wn8^Hj3&Xc'

const EMAIL = {
  admin: `admin-${RUN}@mfa.test`,
  grace: `grace-${RUN}@mfa.test`,
  expired: `expired-${RUN}@mfa.test`,
  locked: `locked-${RUN}@mfa.test`,
  member: `member-${RUN}@mfa.test`,
  plain: `plain-${RUN}@mfa.test`,
}

const CODE_REJECTED = "That code didn't work. Check it and try again."
const BAD_LOGIN = 'Email or password is incorrect.'

let mode: 'off' | 'all' = 'off'

test.beforeAll(async () => {
  test.skip(!BACKEND_DIR, 'needs E2E_BACKEND_DIR')
  mode = await enforcementMode()
})

test.beforeEach(() => {
  resetRateLimits()
})

/** Wait for the signed-in shell. */
async function expectSignedIn(page: Page) {
  await expect(page.getByTestId('user-menu')).toBeVisible({ timeout: 15_000 })
  await expect(page).not.toHaveURL(/\/login/)
}

/** Fill the new-password form of a forced change and check the live rules as it goes. */
async function chooseNewPassword(page: Page, email: string, password: string) {
  const step = page.getByTestId('password-step')
  await expect(step.getByTestId('step-title')).toHaveText('Choose a new password')
  const rules = step.getByTestId('password-rules')
  // The live checklist: a short password with the email's name in it breaks length and personal.
  const local = email.split('@')[0]!.replace(/[^a-z]/g, '')
  await fillStable(page, 'New password', `${local}A1!`)
  await expect(rules.locator('[data-rule="length"]')).not.toHaveAttribute('data-met', 'true')
  await expect(rules.locator('[data-rule="personal"]')).not.toHaveAttribute('data-met', 'true')
  await expect(rules.locator('[data-rule="upper"]')).toHaveAttribute('data-met', 'true')
  await fillStable(page, 'New password', password)
  for (const rule of ['length', 'upper', 'lower', 'digit', 'symbol', 'personal']) {
    await expect(rules.locator(`[data-rule="${rule}"]`)).toHaveAttribute('data-met', 'true')
  }
  await fillStable(page, 'Type it again', password)
  await step.getByRole('button', { name: 'Save and continue' }).click()
}

// ================================================================================================
test.describe('login codes under MFA_ENFORCEMENT=all', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(120_000)

  let auth: Authenticator
  let recovery: string[] = []
  let adminPassword = STAFF_PASSWORD

  test.beforeAll(() => {
    test.skip(mode !== 'all', 'the API runs with MFA_ENFORCEMENT=off')
    cli(['tenant', 'create', '--name', `MFA E2E ${RUN}`, '--slug', SLUG, '--owner-email', EMAIL.admin, '--staff-email', STAFF], `${STAFF_PASSWORD}\n`)
    cli(['user', 'make-admin', '--email', EMAIL.admin, '--staff-email', STAFF])
    for (const [email, role] of [
      [EMAIL.grace, 'owner'],
      [EMAIL.expired, 'reviewer'],
      [EMAIL.locked, 'reviewer'],
      [EMAIL.member, 'reviewer'],
    ] as const) {
      cli(['tenant', 'add-member', '--slug', SLUG, '--email', email, '--role', role, '--staff-email', STAFF], `${STAFF_PASSWORD}\n`)
    }
    // Returning users who chose their own password: in grace, no forced change.
    markReturningUser(EMAIL.grace)
    markReturningUser(EMAIL.locked)
    // A returning user whose password is over a year old.
    markReturningUser(EMAIL.expired, { passwordAgeDays: 400 })
  })

  test("a: a platform admin's first login enrols at once, shows the recovery codes once, then a forced password change (staff-set)", async ({ page }) => {
    await page.goto('/login')
    await loginViaUi(page, EMAIL.admin, STAFF_PASSWORD)

    const enroll = page.getByTestId('enroll-step')
    await expect(enroll.getByTestId('step-title')).toHaveText('Set up login codes')
    await enroll.getByTestId('enrol-continue').click()
    await expect(enroll.getByTestId('mfa-qr')).toBeVisible()
    auth = new Authenticator(await readSetupKey(page))
    await enroll.getByTestId('enrol-continue').click()

    // A wrong code first: the generic words, still on the step.
    await enroll.getByTestId('totp-input').fill(auth.wrongCode())
    await enroll.getByRole('button', { name: 'Turn on login codes' }).click()
    await expect(enroll).toContainText(CODE_REJECTED)

    await enroll.getByTestId('totp-input').fill(await auth.code())
    await enroll.getByRole('button', { name: 'Turn on login codes' }).click()

    const rc = page.getByTestId('recovery-step')
    await expect(rc.getByTestId('step-title')).toHaveText('Save your recovery codes')
    recovery = await readRecoveryCodes(page)
    expect(new Set(recovery).size).toBe(10)
    await expect(page.getByTestId('codes-continue')).toBeDisabled()
    await page.getByTestId('codes-saved').click()
    await page.getByTestId('codes-continue').click()

    // Staff-set password: the next step forces a change.
    await chooseNewPassword(page, EMAIL.admin, NEW_PASSWORD)
    adminPassword = NEW_PASSWORD
    await expectSignedIn(page)
    await expect(page.getByTestId('recovery-codes')).toHaveCount(0)

    // Settings > Security says codes are on, with 10 recovery codes left (shown once only).
    await page.goto('/settings/security')
    await expect(page.getByTestId('mfa-status')).toHaveText('On')
    await expect(page.getByTestId('codes-left')).toContainText('10')
    await expect(page.getByText(recovery[0]!)).toHaveCount(0)
  })

  test('b: sign out and back in: password, then a code; a wrong code shows the generic error', async ({ page }) => {
    await page.goto('/login')
    await loginViaUi(page, EMAIL.admin, adminPassword)
    const step = page.getByTestId('mfa-step')
    await expect(step.getByTestId('step-title')).toHaveText('Enter your login code')

    const wrong = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/login/mfa'))
    await step.getByTestId('totp-input').fill(auth.wrongCode())
    await step.getByRole('button', { name: 'Verify' }).click()
    expect((await wrong).status()).toBe(401)
    await expect(step).toContainText(CODE_REJECTED)
    await expect(page).toHaveURL(/\/login/)

    await step.getByTestId('totp-input').fill(await auth.code())
    await step.getByRole('button', { name: 'Verify' }).click()
    await expectSignedIn(page)

    await signOut(page)
    expect(await page.evaluate(() => localStorage.getItem('mkos.rt'))).toBeNull()
  })

  test('c+d: a recovery code signs in; an admin approval then asks for a fresh TOTP code (step-up) and succeeds', async ({ page }) => {
    // A pending sign-up to approve.
    const brand = `MFA Brand ${RUN}`
    const signup = await page.request.post('/api/v1/signup', {
      data: { brand_name: brand, owner_name: 'Asha Rao', email: `brand-${RUN}@mfa.test`, password: 'Yb4@Pd7*Gs2!Qe' },
    })
    expect(signup.status()).toBe(202)

    await page.goto('/login')
    await loginViaUi(page, EMAIL.admin, adminPassword)
    const step = page.getByTestId('mfa-step')
    await step.getByTestId('toggle-recovery').click()
    await step.getByTestId('recovery-input').fill(recovery[0]!)
    await step.getByRole('button', { name: 'Verify' }).click()
    await expectSignedIn(page)

    // A session proven by a recovery code: sign-up approval takes a TOTP code only, so it asks.
    await page.goto('/admin/signups')
    await expect(page.getByRole('heading', { name: 'Sign-up requests' })).toBeVisible()
    await page.getByRole('button', { name: `Approve ${brand}` }).click()
    const dialog = page.getByTestId('approve-dialog')
    const refused = page.waitForResponse((r) => /\/admin\/signup-requests\/[^/]+\/approve$/.test(r.url()))
    await dialog.getByTestId('approve-confirm').click()
    const first = await refused
    expect(first.status()).toBe(403)
    expect((await first.json()).error.type).toBe('MFA_STEP_UP_REQUIRED')

    const stepUp = page.getByTestId('step-up-dialog')
    await expect(stepUp).toBeVisible()
    await expect(stepUp.getByRole('heading', { name: "Confirm it's you" })).toBeVisible()
    // TOTP only: no recovery-code toggle here.
    await expect(stepUp.getByTestId('step-up-toggle')).toHaveCount(0)
    await expect(stepUp).toContainText("recovery codes don't work here")

    // A wrong code keeps the dialog open with an error.
    await stepUp.getByTestId('totp-input').fill(auth.wrongCode())
    await stepUp.getByTestId('step-up-submit').click()
    await expect(stepUp.locator('[aria-invalid="true"]')).toBeVisible()

    const replay = page.waitForResponse(
      (r) => /\/admin\/signup-requests\/[^/]+\/approve$/.test(r.url()) && r.status() !== 403,
    )
    await stepUp.getByTestId('totp-input').fill(await auth.code())
    await stepUp.getByTestId('step-up-submit').click()
    expect((await replay).status()).toBe(200)
    await expect(stepUp).toHaveCount(0)
    await expect(dialog.getByTestId('approve-result')).toBeVisible()
    await dialog.getByTestId('approve-done').click()

    // One recovery code used.
    await page.goto('/settings/security')
    await expect(page.getByTestId('codes-left')).toContainText('9')
    await signOut(page)
  })

  test('c: the same recovery code cannot be used twice', async ({ page }) => {
    await page.goto('/login')
    await loginViaUi(page, EMAIL.admin, adminPassword)
    const step = page.getByTestId('mfa-step')
    await step.getByTestId('toggle-recovery').click()
    const res = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/login/mfa'))
    await step.getByTestId('recovery-input').fill(recovery[0]!)
    await step.getByRole('button', { name: 'Verify' }).click()
    expect((await res).status()).toBe(401)
    await expect(step).toContainText(CODE_REJECTED)
    await expect(page).toHaveURL(/\/login/)
  })

  test('e: a returning tenant user in grace signs in without a code, sees the notice, and enrols from Settings > Security', async ({ page }) => {
    await page.goto('/login')
    const login = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/login'))
    await loginViaUi(page, EMAIL.grace, STAFF_PASSWORD)
    const body = await (await login).json()
    expect(body.status).toBe('signed_in')
    expect(body.mfa_grace_until).toBeTruthy()
    await expectSignedIn(page)

    // The grace notice (a toast with a link to Settings > Security).
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Set up login codes' })
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('Settings > Security')

    await page.goto('/settings/security')
    await expect(page.getByTestId('mfa-status')).toHaveText('Not set up')
    await expect(page.getByTestId('login-codes-card')).toContainText('Set up login codes by')

    // A sensitive action before enrolment: 403 MFA_ENROLLMENT_REQUIRED routes to the setup.
    await page.goto('/team')
    const row = page.getByRole('row').filter({ hasText: EMAIL.member })
    await row.getByTestId('role-select').click()
    const refused = page.waitForResponse((r) => r.url().includes('/api/v1/members/') && r.request().method() === 'PATCH')
    await page.getByRole('option', { name: /^Operator/ }).click()
    const first = await refused
    expect(first.status()).toBe(403)
    expect((await first.json()).error.type).toBe('MFA_ENROLLMENT_REQUIRED')
    await expect(page).toHaveURL(/\/settings\/security\?setup=true/)

    // The setup is already open.
    const setup = page.getByTestId('totp-setup')
    await setup.getByLabel('Current password').fill(STAFF_PASSWORD)
    await setup.getByRole('button', { name: 'Continue' }).click()
    await expect(setup.getByTestId('mfa-qr')).toBeVisible()
    const graceAuth = new Authenticator(await readSetupKey(page))
    await setup.getByTestId('enrol-continue').click()
    await setup.getByTestId('totp-input').fill(await graceAuth.code())
    await setup.getByRole('button', { name: 'Turn on login codes' }).click()
    await expect(setup.getByTestId('recovery-codes').locator('ol li')).toHaveCount(10)
    await setup.getByTestId('codes-saved').click()
    // Done rotates the session once so its access token carries the fresh code.
    const rtBefore = await page.evaluate(() => localStorage.getItem('mkos.rt'))
    const rotated = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/refresh'))
    await setup.getByTestId('codes-continue').click()
    expect((await rotated).status()).toBe(200)
    await expect(page.getByTestId('mfa-status')).toHaveText('On')
    // Reload only once the rotated token is stored (a reload mid-rotation replays the old one).
    await expect.poll(() => page.evaluate(() => localStorage.getItem('mkos.rt'))).not.toBe(rtBefore)

    // The member change now goes through without a second code.
    await page.goto('/team')
    await row.getByTestId('role-select').click()
    const patch = page.waitForResponse((r) => r.url().includes('/api/v1/members/') && r.request().method() === 'PATCH')
    await page.getByRole('option', { name: /^Operator/ }).click()
    expect((await patch).status()).toBe(200)
    await expect(page.getByTestId('step-up-dialog')).toHaveCount(0)
    await expect(row.getByTestId('role-select')).toHaveText(/Operator/)
  })

  test('f: a password over a year old forces a change with the live rules', async ({ page }) => {
    await page.goto('/login')
    await loginViaUi(page, EMAIL.expired, STAFF_PASSWORD)
    // In grace and no factor: straight to the password step.
    await chooseNewPassword(page, EMAIL.expired, NEW_PASSWORD)
    await expectSignedIn(page)
    await signOut(page)

    // The new password works; the old one does not.
    await loginViaUi(page, EMAIL.expired, STAFF_PASSWORD)
    await expect(page.getByTestId('login-error')).toContainText(BAD_LOGIN)
    await loginViaUi(page, EMAIL.expired, NEW_PASSWORD)
    await expectSignedIn(page)
  })

  test('g: ten wrong passwords lock the account behind the same message as a wrong password', async ({ page }) => {
    await page.goto('/login')
    const statuses: number[] = []
    for (let i = 1; i <= 10; i++) {
      if (i % 4 === 0) resetRateLimits() // the login limiter is 5/min per IP and email
      const res = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/login'))
      await loginViaUi(page, EMAIL.locked, `Wrong#Pass${i}word`)
      statuses.push((await res).status())
      await expect(page.getByTestId('login-error')).toContainText(BAD_LOGIN)
    }
    expect(statuses).toEqual(Array(10).fill(401))
    expect(lockState(EMAIL.locked).locked).toBe(true)

    // The right password now: the same 401 and the same words as a wrong one, and as an unknown email.
    resetRateLimits()
    const locked = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/login'))
    await loginViaUi(page, EMAIL.locked, STAFF_PASSWORD)
    const lockedRes = await locked
    expect(lockedRes.status()).toBe(401)
    await expect(page.getByTestId('login-error')).toContainText(BAD_LOGIN)
    const unknown = await page.request.post('/api/v1/auth/login', {
      data: { email: `nobody-${RUN}@mfa.test`, password: STAFF_PASSWORD },
    })
    const strip = (b: { error: Record<string, unknown> }) => {
      const { correlation_id: _c, error_report: _r, ...rest } = b.error
      return rest
    }
    expect(strip(await lockedRes.json())).toEqual(strip(await unknown.json()))

    // Staff unlock (docs/runbooks/MFA-STAFF.md) lets the right password in again.
    cli(['user', 'unlock', '--email', EMAIL.locked, '--staff-email', STAFF])
    expect(lockState(EMAIL.locked)).toEqual({ failed: 0, locked: false })
    resetRateLimits()
    await loginViaUi(page, EMAIL.locked, STAFF_PASSWORD)
    await expectSignedIn(page)
  })
  test('d (slow, E2E_MFA_SLOW=1): a member change more than 10 minutes after the code asks for a step-up, and a recovery code is offered', async ({ page }) => {
    test.skip(process.env.E2E_MFA_SLOW !== '1', 'waits 10 minutes for the code to age; set E2E_MFA_SLOW=1')
    test.setTimeout(15 * 60_000)
    await page.goto('/login')
    await loginViaUi(page, EMAIL.admin, adminPassword)
    const step = page.getByTestId('mfa-step')
    await step.getByTestId('totp-input').fill(await auth.code())
    await step.getByRole('button', { name: 'Verify' }).click()
    await expectSignedIn(page)
    await page.goto('/team')
    const row = page.getByRole('row').filter({ hasText: EMAIL.member })
    await expect(row).toBeVisible()

    // STEP_UP_MAX_AGE_SECONDS is 600; the access token (30 min) outlives it.
    await page.waitForTimeout(605_000)
    await row.getByTestId('role-select').click()
    const refused = page.waitForResponse((r) => r.url().includes('/api/v1/members/') && r.request().method() === 'PATCH')
    await page.getByRole('option', { name: /^Reviewer/ }).click()
    const first = await refused
    expect(first.status()).toBe(403)
    expect((await first.json()).error.type).toBe('MFA_STEP_UP_REQUIRED')

    const stepUp = page.getByTestId('step-up-dialog')
    await expect(stepUp).toBeVisible()
    // Member changes also take a recovery code (a lost phone).
    await expect(stepUp.getByTestId('step-up-toggle')).toBeVisible()
    const replay = page.waitForResponse(
      (r) => r.url().includes('/api/v1/members/') && r.request().method() === 'PATCH' && r.status() !== 403,
    )
    await stepUp.getByTestId('totp-input').fill(await auth.code())
    await stepUp.getByTestId('step-up-submit').click()
    expect((await replay).status()).toBe(200)
    await expect(stepUp).toHaveCount(0)
    await expect(row.getByTestId('role-select')).toHaveText(/Reviewer/)
  })
})

// ================================================================================================
test.describe('plain login under MFA_ENFORCEMENT=off', () => {
  test.beforeAll(() => {
    test.skip(mode !== 'off', 'the API runs with MFA_ENFORCEMENT=all')
  })

  test('h: a staff-created first login signs straight in with a password; no code step, no forced change', async ({ page }) => {
    cli(['tenant', 'create', '--name', `MFA Off ${RUN}`, '--slug', `mfa-off-${RUN}`, '--owner-email', EMAIL.plain, '--staff-email', STAFF], `${STAFF_PASSWORD}\n`)
    await page.goto('/login')
    const login = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/login'))
    await loginViaUi(page, EMAIL.plain, STAFF_PASSWORD)
    const res = await login
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status ?? 'signed_in').toBe('signed_in')
    expect(body.access_token).toBeTruthy()
    await expectSignedIn(page)
    await expect(page.getByTestId('mfa-step')).toHaveCount(0)
    await expect(page.getByTestId('enroll-step')).toHaveCount(0)

    // The security page says login codes are off rather than offering a setup that answers 501.
    await page.goto('/settings/security')
    await expect(page.getByTestId('login-codes-card')).toBeVisible()
    await signOut(page)
  })
})
