import { PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD } from './env'
import { apiLogin, expect, loginAs, test, USERS } from './fixtures'

/**
 * Cross-cutting contract the screens rely on, against the live demo seed: `is_platform_admin` on
 * /auth/me, the platform-admin gate on the sign-up queue, ETag + If-Match + STALE_VERSION on the
 * brand profile, and the role-gated nav. Nothing here mutates data (the stale PATCH is refused).
 */

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

test('seed users are not platform admins, and the sign-up queue answers them 403', async ({ page }) => {
  const { access_token } = await apiLogin(page.request, USERS.acme.owner)
  const me = await page.request.get('/api/v1/auth/me', { headers: auth(access_token) })
  expect(me.status()).toBe(200)
  expect((await me.json()).is_platform_admin).toBe(false)

  const queue = await page.request.get('/api/v1/admin/signup-requests?limit=1', { headers: auth(access_token) })
  expect(queue.status()).toBe(403)
  expect((await queue.json()).error.type).toBe('PERMISSION_DENIED')

  await loginAs(page, USERS.acme.owner, '/')
  await expect(page.locator('[data-nav-id="signups"]')).toHaveCount(0)
})

test('platform admin sees is_platform_admin and can list the queue', async ({ page }) => {
  test.skip(!PLATFORM_ADMIN_EMAIL, 'E2E_PLATFORM_ADMIN_EMAIL is not set (the demo seed has no platform admin)')
  const { access_token } = await apiLogin(page.request, PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD)
  const me = await page.request.get('/api/v1/auth/me', { headers: auth(access_token) })
  expect((await me.json()).is_platform_admin).toBe(true)
  const queue = await page.request.get('/api/v1/admin/signup-requests?status=pending&limit=5', {
    headers: auth(access_token),
  })
  expect(queue.status()).toBe(200)
  const body = (await queue.json()) as { data: unknown[]; page: { has_more: boolean } }
  expect(Array.isArray(body.data)).toBe(true)
})

test('brand profile: ETag on read, stale If-Match is 409 STALE_VERSION, missing If-Match is 422', async ({ page }) => {
  const { access_token } = await apiLogin(page.request, USERS.acme.owner)
  const read = await page.request.get('/api/v1/tenants/me', { headers: auth(access_token) })
  expect(read.status()).toBe(200)
  expect(read.headers()['etag']).toMatch(/^"[0-9a-f-]{36}"$/)

  const stale = await page.request.patch('/api/v1/tenants/me', {
    headers: { ...auth(access_token), 'If-Match': '"00000000-0000-0000-0000-000000000000"' },
    data: { tone: 'stale-check' },
  })
  expect(stale.status()).toBe(409)
  expect((await stale.json()).error.type).toBe('STALE_VERSION')

  const missing = await page.request.patch('/api/v1/tenants/me', { headers: auth(access_token), data: { tone: 'x' } })
  expect(missing.status()).toBe(422)
})

test('idempotent op without a key is 422', async ({ page }) => {
  const { access_token } = await apiLogin(page.request, USERS.acme.owner)
  const res = await page.request.post('/api/v1/jobs/00000000-0000-0000-0000-000000000000/cancel', {
    headers: auth(access_token),
  })
  expect(res.status()).toBe(422)
})
