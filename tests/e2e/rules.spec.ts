import path from 'node:path'
import type { APIRequestContext, Page } from '@playwright/test'
import { ARTIFACTS } from './env'
import { apiLogin, expect, loginAs, test, USERS } from './fixtures'

const LOGS = ARTIFACTS
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(LOGS, `rules-${name}.png`) })

test.use({ viewport: { width: 1440, height: 1000 } })

interface RuleRow {
  id: string
  marketplace: string
  category: string | null
  field: string
  rule_type: string
}

async function apiRules(request: APIRequestContext, token: string, query: string): Promise<RuleRow[]> {
  const out: RuleRow[] = []
  let cursor: string | null = null
  do {
    const res = await request.get(`/api/v1/rules?limit=200&${query}${cursor ? `&cursor=${cursor}` : ''}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { data: RuleRow[]; page: { next_cursor: string | null } }
    out.push(...body.data)
    cursor = body.page.next_cursor
  } while (cursor)
  return out
}

async function pickOption(page: Page, trigger: ReturnType<Page['getByLabel']>, name: string) {
  await trigger.click()
  await page.getByRole('option', { name, exact: true }).click()
}

const table = (page: Page) => page.getByRole('table', { name: 'Rules' })
const bodyRows = (page: Page) => table(page).locator('tbody tr')

test.describe('rules list', () => {
  test('any role lists rules; marketplace filter is server-side, in the URL and survives reload', async ({ page }) => {
    const tokens = await loginAs(page, USERS.acme.reviewer, '/rules')
    const all = await apiRules(page.request, tokens.access_token, '')
    await expect(bodyRows(page)).toHaveCount(Math.min(all.length, 50))
    // Reviewer cannot run dry runs: the action is hidden.
    await expect(page.getByTestId('check-draft')).toHaveCount(0)
    await shot(page, 'list')

    await pickOption(page, page.getByTestId('filter-marketplace'), 'Amazon')
    await expect(page).toHaveURL(/marketplace=amazon/)
    const amazon = await apiRules(page.request, tokens.access_token, 'marketplace=amazon')
    await expect(bodyRows(page)).toHaveCount(Math.min(amazon.length, 50))
    for (const txt of await bodyRows(page).locator('td:first-child').allInnerTexts()) expect(txt).toContain('Amazon')

    await page.reload()
    await expect(page.getByTestId('filter-marketplace')).toContainText('Amazon')
    await expect(bodyRows(page)).toHaveCount(Math.min(amazon.length, 50))
  })

  test('category filter is exact; an invalid slug is caught before sending; empty state', async ({ page }) => {
    const tokens = await loginAs(page, USERS.acme.operator, '/rules')
    await expect(bodyRows(page).first()).toBeVisible()

    const input = page.getByTestId('filter-category')
    await input.fill('ethnic_wear_kurta_sets')
    await input.press('Enter')
    await expect(page).toHaveURL(/category=ethnic_wear_kurta_sets/)
    const kurta = await apiRules(page.request, tokens.access_token, 'category=ethnic_wear_kurta_sets')
    expect(kurta.every((r) => r.category === 'ethnic_wear_kurta_sets')).toBe(true)
    await expect(bodyRows(page)).toHaveCount(kurta.length)
    // Category column is hidden below md; the API already proved the filter. Check row content via the sheet.

    const requests: string[] = []
    page.on('request', (r) => r.url().includes('/api/v1/rules?') && requests.push(r.url()))
    await input.fill('Bad Cat')
    await input.press('Enter')
    await expect(page.getByTestId('category-hint')).toHaveText(/Lowercase letters, digits and underscores/)
    await expect(page).toHaveURL(/category=ethnic_wear_kurta_sets/)
    expect(requests).toHaveLength(0)

    await input.fill('zz_no_such_category')
    await input.press('Enter')
    await expect(page.getByText('No rules match these filters')).toBeVisible()
    await shot(page, 'empty')
    await page.getByRole('button', { name: 'Reset filters' }).first().click()
    await expect(page).not.toHaveURL(/category=/)
  })

  test('row opens the rule definition sheet (deep-linkable)', async ({ page }) => {
    const tokens = await loginAs(page, USERS.acme.operator, '/rules?marketplace=amazon&category=ethnic_wear_kurta_sets')
    const rules = await apiRules(page.request, tokens.access_token, 'marketplace=amazon&category=ethnic_wear_kurta_sets')
    const first = rules[0]
    await bodyRows(page).first().click()
    await expect(page).toHaveURL(new RegExp(`rule=${first.id}`))
    const sheet = page.getByTestId('rule-sheet')
    await expect(sheet).toContainText(first.id)
    await expect(sheet).toContainText(first.field)
    await expect(sheet).toContainText(first.rule_type)
    await expect(sheet.getByTestId('rule-sheet-check')).toBeVisible()
    await shot(page, 'sheet')
    await page.keyboard.press('Escape')
    await expect(page).not.toHaveURL(/rule=/)

    await page.goto(`/rules?rule=${first.id}`)
    await expect(page.getByTestId('rule-sheet')).toContainText(first.id)
  })

  test('"What it checks" never claims a parameter the API does not expose', async ({ page }) => {
    const tokens = await loginAs(page, USERS.acme.operator, '/rules')
    const banned = (await apiRules(page.request, tokens.access_token, '')).find((r) => r.rule_type === 'banned_terms')!
    await page.goto(`/rules?marketplace=${banned.marketplace}&category=${banned.category}&rule=${banned.id}`)
    const check = page.getByTestId('rule-sheet').getByTestId('rule-sheet-what')
    // BannedTerms.match is word, substring or regex; the API does not say which.
    await expect(check).toContainText('whole words, as substrings or as patterns')
    await expect(check).not.toContainText('whole-word match')
  })

  // A server failure (injected 500, the only way to make the live API fail on demand) must read as an
  // error with its reference, not as "Rule not found".
  const fail500 = (requestId: string) => ({
    status: 500,
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
    body: JSON.stringify({
      error: { type: 'INTERNAL_ERROR', status: 500, message: 'Internal error.', correlation_id: requestId },
    }),
  })
  const MISSING_RULE = '11111111-1111-4111-8111-111111111111'

  test('deep-linked sheet shows the list error and reference when GET /rules fails', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/')
    await page.route('**/api/v1/rules?*', (route) => route.fulfill(fail500('req-rules-500')))
    await page.goto(`/rules?rule=${MISSING_RULE}`)
    const sheet = page.getByTestId('rule-sheet')
    await expect(sheet).toContainText("Couldn't load this rule", { timeout: 20_000 })
    await expect(sheet.getByTestId('error-reference')).toHaveText('req-rules-500')
    await expect(sheet).not.toContainText('Rule not found')
    await shot(page, 'sheet-error')

    // Retry against the real API: the rule really is absent, so now it says so.
    await page.unroute('**/api/v1/rules?*')
    await sheet.getByRole('button', { name: 'Retry' }).click()
    await expect(sheet).toContainText('Rule not found')
  })

  test('deep-linked sheet stops loading and shows the error when a later page fails', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/')
    // Page 1 is the real response but claims more pages; the next page then fails.
    await page.route('**/api/v1/rules?*', async (route) => {
      if (route.request().url().includes('cursor=')) return route.fulfill(fail500('req-rules-page2'))
      const res = await route.fetch()
      const body = (await res.json()) as { page: { has_more: boolean; next_cursor: string | null } }
      body.page = { ...body.page, has_more: true, next_cursor: 'next' }
      return route.fulfill({ response: res, json: body })
    })
    await page.goto(`/rules?rule=${MISSING_RULE}`)
    const sheet = page.getByTestId('rule-sheet')
    await expect(sheet).toContainText("Couldn't load this rule", { timeout: 20_000 })
    await expect(sheet.getByTestId('error-reference')).toHaveText('req-rules-page2')
    await page.unroute('**/api/v1/rules?*')
  })
})

test.describe('rules dry run', () => {
  async function fillDraft(page: Page, opts: { marketplace: string; category: string; title: string }) {
    await pickOption(page, page.locator('#marketplace'), opts.marketplace)
    await page.getByLabel('Category').fill(opts.category)
    await page.getByTestId('draft-title').fill(opts.title)
    await page.getByTestId('draft-bullet-0').fill('Soft cotton fabric')
    await page.getByTestId('draft-description').fill('A kurta set.')
  }

  async function addAttr(page: Page, i: number, key: string, value: string) {
    await page.getByTestId('add-attribute').click()
    await page.getByTestId(`attr-key-${i}`).fill(key)
    await page.getByTestId(`attr-value-${i}`).fill(value)
  }

  test('operator: 221-char title fails with exactly FIELD_TOO_LONG on content.title; 200 chars passes', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/rules')
    await page.getByTestId('check-draft').click()
    await expect(page).toHaveURL(/\/rules\/check/)
    await shot(page, 'check-empty')

    await fillDraft(page, { marketplace: 'Amazon', category: 'ethnic_wear_kurta_sets', title: 'A'.repeat(221) })
    await addAttr(page, 0, 'color', 'indigo')
    await addAttr(page, 1, 'fabric_type', 'cotton')

    const resp = page.waitForResponse((r) => r.url().endsWith('/api/v1/rules/dry-run'))
    await page.getByTestId('run-dry-run').click()
    const body = (await (await resp).json()) as { passed: boolean; report: { errors: { error_code: string; field: string }[] } }
    expect(body.passed).toBe(false)
    expect(body.report.errors.map((e) => [e.error_code, e.field])).toEqual([['FIELD_TOO_LONG', 'content.title']])

    await expect(page.getByTestId('dry-run-verdict')).toHaveText('Fail')
    const issues = page.getByTestId('dry-run-issue')
    await expect(issues).toHaveCount(1)
    await expect(issues.first()).toHaveAttribute('data-code', 'FIELD_TOO_LONG')
    await expect(issues.first()).toHaveAttribute('data-field', 'content.title')
    await expect(page.getByTestId('rules-checked')).toBeVisible()
    await shot(page, 'check-fail')

    // Editing marks the result stale; the 200-char title passes.
    await page.getByTestId('draft-title').fill('A'.repeat(200))
    await expect(page.getByText('The draft changed since this check')).toBeVisible()
    await page.getByTestId('run-dry-run').click()
    await expect(page.getByTestId('dry-run-verdict')).toHaveText('Pass')
    await expect(page.getByTestId('dry-run-issue')).toHaveCount(0)
    await shot(page, 'check-pass')

    // Issue rule link -> rules list with that rule open.
    await page.getByTestId('draft-title').fill('A'.repeat(221))
    await page.getByTestId('run-dry-run').click()
    await page.getByTestId('dry-run-issue').getByRole('link').click()
    await expect(page).toHaveURL(/\/rules\?.*rule=/)
    await expect(page.getByTestId('rule-sheet')).toContainText('max_length')
  })

  const FK_KURTA_MAX_V1 = '5eed0000-0000-4000-8000-000200010001'
  const FK_KURTA_MAX_V2 = '5eed0000-0000-4000-8000-000200010007'

  test('rules panel: a replaced older version is not shown as passed; the rule link uses the rule category', async ({
    page,
  }) => {
    const tokens = await loginAs(page, USERS.acme.operator, '/rules/check?marketplace=flipkart&category=ethnic_wear_kurta_sets')
    // Precondition from the live API: v1 and v2 of the same max_length group, both enabled.
    const rules = await apiRules(page.request, tokens.access_token, 'marketplace=flipkart&category=ethnic_wear_kurta_sets')
    const v1 = rules.find((r) => r.id === FK_KURTA_MAX_V1)!
    const v2 = rules.find((r) => r.id === FK_KURTA_MAX_V2)!
    expect([v1.field, v1.rule_type]).toEqual([v2.field, v2.rule_type])

    await page.getByTestId('draft-title').fill('A'.repeat(181))
    await page.getByTestId('draft-bullet-0').fill('Soft cotton fabric')
    await page.getByTestId('draft-description').fill('A kurta set.')
    await page.getByTestId('run-dry-run').click()
    await expect(page.getByTestId('dry-run-verdict')).toHaveText('Fail')

    const row = (id: string) => page.locator(`[data-testid="rule-checked"][data-rule-id="${id}"]`)
    await expect(row(FK_KURTA_MAX_V2)).toHaveAttribute('data-status', 'failed')
    await expect(row(FK_KURTA_MAX_V2)).toContainText('1 issue')
    await expect(row(FK_KURTA_MAX_V1)).toHaveAttribute('data-status', 'replaced')
    await expect(row(FK_KURTA_MAX_V1)).toContainText('Replaced by v2')
    await expect(row(FK_KURTA_MAX_V1)).not.toContainText('No issues')
    await shot(page, 'check-replaced')

    // The issue's rule link filters by the rule's own category (here the same one) and opens it.
    const link = page.locator('[data-testid="dry-run-issue"][data-field="content.title"]').getByTestId('issue-rule-link')
    await expect(link).toHaveAttribute('href', new RegExp(`category=${v2.category}.*rule=${FK_KURTA_MAX_V2}`))
  })

  test('rules panel: types and fields the dry run skips read "Not run"; category-wide rule link drops the category', async ({
    page,
  }) => {
    // The seed has no image, facts.* or category-wide rules, and the API cannot create rules, so the
    // GET /rules response is extended in the test with rows the backend contract allows.
    const extra = [
      { id: '22222222-2222-4222-8222-000000000001', rule_type: 'image_requirement', field: 'images' },
      { id: '22222222-2222-4222-8222-000000000002', rule_type: 'required_attribute', field: 'facts.material' },
    ]
    await page.route('**/api/v1/rules?*', async (route) => {
      const res = await route.fetch()
      const body = (await res.json()) as { data: (RuleRow & Record<string, unknown>)[] }
      const v2 = body.data.find((r) => r.id === FK_KURTA_MAX_V2)
      if (v2) {
        // Make the failing rule category-wide (category null), as list_effective allows.
        v2.category = null
        for (const e of extra) body.data.push({ ...v2, ...e, category: 'ethnic_wear_kurta_sets', version: 1 })
      }
      return route.fulfill({ response: res, json: body })
    })
    await loginAs(page, USERS.acme.operator, '/rules/check?marketplace=flipkart&category=ethnic_wear_kurta_sets')
    await page.getByTestId('draft-title').fill('A'.repeat(181))
    await page.getByTestId('draft-bullet-0').fill('Soft cotton fabric')
    await page.getByTestId('draft-description').fill('A kurta set.')
    await page.getByTestId('run-dry-run').click()
    await expect(page.getByTestId('dry-run-verdict')).toHaveText('Fail')

    for (const e of extra) {
      const row = page.locator(`[data-testid="rule-checked"][data-rule-id="${e.id}"]`)
      await expect(row).toHaveAttribute('data-status', 'not-run')
      await expect(row).toContainText('Not run in a dry run')
    }
    // v2 is now category-wide, so the category row v1 is the one that runs in its group.
    await expect(page.locator(`[data-testid="rule-checked"][data-rule-id="${FK_KURTA_MAX_V2}"]`)).toHaveAttribute(
      'data-status',
      'failed',
    )

    const link = page.getByTestId('issue-rule-link').first()
    await expect(link).toHaveAttribute('href', new RegExp(`rule=${FK_KURTA_MAX_V2}`))
    await expect(link).not.toHaveAttribute('href', /category=/)
    await link.click()
    await expect(page.getByTestId('rule-sheet')).toContainText(FK_KURTA_MAX_V2)
    await expect(page.getByTestId('rule-sheet')).not.toContainText('Rule not found')
  })

  test('JSON editor: the size gauge measures the compact body that is sent, not the indentation', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/rules/check')
    await page.getByTestId('tab-json').click()
    // Short list items: about 4 bytes each compact, about 13 pretty-printed (8 spaces of indent).
    const listing = {
      product_id: crypto.randomUUID(),
      marketplace: 'flipkart',
      category: 'ethnic_wear_kurta_sets',
      content: { title: 'Cotton kurta set', bullets: ['Soft cotton fabric'], description: 'A kurta set.' },
      attributes: { color: 'indigo', fabric_type: 'cotton', tags: Array.from({ length: 22_000 }, () => 'a') },
    }
    const compactBytes = Buffer.byteLength(JSON.stringify({ listing }))
    const prettyBytes = Buffer.byteLength(JSON.stringify({ listing }, null, 2))
    expect(compactBytes).toBeLessThan(262_144)
    expect(prettyBytes).toBeGreaterThan(262_144)

    await page.getByTestId('json-editor').fill(JSON.stringify({ listing }))
    await page.getByRole('button', { name: 'Format' }).click()
    expect(Buffer.byteLength(await page.getByTestId('json-editor').inputValue())).toBeGreaterThan(262_144)
    await expect(page.getByTestId('body-size')).toHaveText(`${(compactBytes / 1024).toFixed(0)} KiB / 256 KiB`)
    await expect(page.getByTestId('body-size')).not.toHaveClass(/text-destructive/)
    await expect(page.getByTestId('run-dry-run')).toBeEnabled()

    const resp = page.waitForResponse((r) => r.url().endsWith('/api/v1/rules/dry-run'))
    await page.getByTestId('run-dry-run').click()
    const r = await resp
    expect(r.status()).not.toBe(413)
    // Chromium drops large bodies from the request record; Content-Length still says what went out.
    expect(Number(await r.request().headerValue('content-length'))).toBe(compactBytes)
  })

  test('client validation blocks bad input without a request', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/rules/check')
    let sent = 0
    page.on('request', (r) => r.url().endsWith('/rules/dry-run') && sent++)
    await page.getByLabel('Category').fill('Bad Cat')
    await page.getByTestId('run-dry-run').click()
    await expect(page.getByTestId('error-marketplace')).toHaveText('Pick a marketplace.')
    await expect(page.getByTestId('error-category')).toContainText('Lowercase letters')
    await expect(page.getByTestId('error-title')).toHaveText("Title can't be blank.")
    // Errors are linked to their inputs, so a screen reader reads them on focus.
    await expect(page.getByTestId('draft-title')).toHaveAccessibleDescription("Title can't be blank.")
    await expect(page.getByLabel('Category')).toHaveAccessibleDescription(/Lowercase letters/)
    await expect(page.getByTestId('draft-bullet-0')).toHaveAccessibleDescription("Bullet can't be blank.")
    await page.getByTestId('add-attribute').click()
    await page.getByTestId('attr-key-0').fill('Bad Key')
    await page.getByTestId('run-dry-run').click()
    await expect(page.getByText('Use a-z, 0-9 and _ (1 to 64).')).toBeVisible()
    await expect(page.getByTestId('attr-key-0')).toHaveAccessibleDescription('Use a-z, 0-9 and _ (1 to 64).')
    await shot(page, 'check-client-errors')
    expect(sent).toBe(0)
  })

  test('no template for flipkart + ethnic_wear_jackets maps the 422 onto the category field', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/rules/check')
    await fillDraft(page, { marketplace: 'Flipkart', category: 'ethnic_wear_jackets', title: 'Linen Nehru jacket' })
    const resp = page.waitForResponse((r) => r.url().endsWith('/api/v1/rules/dry-run'))
    await page.getByTestId('run-dry-run').click()
    expect((await resp).status()).toBe(422)
    await expect(page.getByTestId('error-category')).toHaveText('No rule template for this marketplace and category.')
    await shot(page, 'check-422')
  })

  test('JSON editor: a malformed category shows the backend reason, not "no template"', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/rules/check')
    await page.getByTestId('tab-json').click()
    const listing = {
      product_id: crypto.randomUUID(),
      marketplace: 'amazon',
      category: 'Bad-Cat',
      content: { title: 'Tee', bullets: ['a'], description: 'd' },
    }
    await page.getByTestId('json-editor').fill(JSON.stringify({ listing }))
    const resp = page.waitForResponse((r) => r.url().endsWith('/api/v1/rules/dry-run'))
    await page.getByTestId('run-dry-run').click()
    const r = await resp
    expect(r.status()).toBe(422)
    const detail = ((await r.json()) as { error: { details: { loc: string[]; msg: string }[] } }).error.details.find(
      (d) => d.loc.join('.') === 'body.listing.category',
    )!
    const problem = page.getByTestId('problem-details')
    await expect(problem).toContainText(`listing.category: ${detail.msg}`)
    await expect(problem).not.toContainText('No rule template')
  })

  test('Reset in JSON mode keeps marketplace and category, like the form', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/rules/check?marketplace=amazon&category=ethnic_wear_kurta_sets')
    await page.getByTestId('draft-title').fill('Something')
    await page.getByTestId('tab-json').click()
    await page.getByRole('button', { name: 'Reset' }).click()
    const json = JSON.parse(await page.getByTestId('json-editor').inputValue()) as {
      listing: { marketplace: string; category: string; product_id: string; content: { title: string } }
    }
    expect(json.listing.marketplace).toBe('amazon')
    expect(json.listing.category).toBe('ethnic_wear_kurta_sets')
    expect(json.listing.content.title).toBe('')
    await page.getByRole('tab', { name: 'Form' }).click()
    await expect(page.getByLabel('Category')).toHaveValue('ethnic_wear_kurta_sets')
    await expect(page.locator('#marketplace')).toContainText('Amazon')
    await expect(page.getByLabel('Product ID')).toHaveValue(json.listing.product_id)
  })

  test('lengths count code points like the backend: 300 emoji is a valid title', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/rules/check')
    await fillDraft(page, { marketplace: 'Amazon', category: 'ethnic_wear_kurta_sets', title: '\u{1F642}'.repeat(300) })
    await expect(page.getByText('300 / 500', { exact: true })).toBeVisible()
    const resp = page.waitForResponse((r) => r.url().endsWith('/api/v1/rules/dry-run'))
    await page.getByTestId('run-dry-run').click()
    expect((await resp).status()).toBe(200)
    await expect(page.getByTestId('error-title')).toHaveCount(0)
    await expect(page.getByTestId('dry-run-verdict')).toBeVisible()
  })

  test('category suggestions cover every rule category (all pages)', async ({ page }) => {
    const tokens = await loginAs(page, USERS.acme.operator, '/rules/check')
    const all = await apiRules(page.request, tokens.access_token, '')
    const cats = [...new Set(all.map((r) => r.category).filter((c): c is string => !!c))].sort()
    const listId = await page.getByLabel('Category').getAttribute('list')
    await expect(page.locator(`datalist[id="${listId}"] option`)).toHaveCount(cats.length)
  })

  test('JSON editor: invalid JSON is caught; valid body runs; prefill from a real product', async ({ page }) => {
    const tokens = await loginAs(page, USERS.acme.operator, '/rules/check?marketplace=amazon&category=home_decor_lamps')

    // Prefill from the first real product (GET /products).
    const res = await page.request.get('/api/v1/products?limit=50', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    })
    const products = ((await res.json()) as { data: { id: string; sku: string; title: string; category: string }[] }).data
    if (products.length) {
      const p = products[0]
      await page.getByTestId('product-picker').click()
      await page.getByRole('option').filter({ hasText: p.sku }).first().click()
      await expect(page.getByTestId('draft-title')).toHaveValue(p.title)
      await expect(page.getByLabel('Category')).toHaveValue(p.category)
      await expect(page.getByLabel('Product ID')).toHaveValue(p.id)
    }

    await page.getByTestId('tab-json').click()
    const editor = page.getByTestId('json-editor')
    await editor.fill('{"listing": ')
    await page.getByTestId('run-dry-run').click()
    await expect(page.getByTestId('json-error')).toContainText('Not valid JSON')
    await editor.fill('{"listing": {}, "extra": 1}')
    await page.getByTestId('run-dry-run').click()
    await expect(page.getByTestId('json-error')).toContainText('Only "listing" is allowed')

    const listing = {
      product_id: crypto.randomUUID(),
      marketplace: 'amazon',
      category: 'home_decor_lamps',
      content: { title: 'Brass table lamp with linen shade', bullets: ['Solid brass base'], description: 'A table lamp.' },
      attributes: { color: 'gold' },
    }
    await editor.fill(JSON.stringify({ listing }, null, 2))
    const resp = page.waitForResponse((r) => r.url().endsWith('/api/v1/rules/dry-run'))
    await page.getByTestId('run-dry-run').click()
    const r = await resp
    expect(r.status()).toBe(200)
    const api = (await r.json()) as { passed: boolean; report: { errors: unknown[] } }
    await expect(page.getByTestId('dry-run-verdict')).toHaveText(api.passed ? 'Pass' : 'Fail')
    await expect(page.getByTestId('dry-run-issue')).toHaveCount(api.report.errors.length)
    await shot(page, 'check-json')

    // Back to the form: values carried over.
    await page.getByRole('tab', { name: 'Form' }).click()
    await expect(page.getByTestId('draft-title')).toHaveValue(listing.content.title)
  })

  test('network failure shows an inline error, the draft stays', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/rules/check')
    await fillDraft(page, { marketplace: 'Amazon', category: 'ethnic_wear_kurta_sets', title: 'Cotton kurta set' })
    await page.route('**/api/v1/rules/dry-run', (route) => route.abort('connectionrefused'))
    await page.getByTestId('run-dry-run').click()
    await expect(page.getByTestId('dry-run-problem')).toContainText("Can't reach the server")
    await expect(page.getByTestId('draft-title')).toHaveValue('Cotton kurta set')
    await page.unroute('**/api/v1/rules/dry-run')
  })

  for (const who of ['reviewer', 'admin'] as const) {
    test(`${who}: "Check a draft" hidden and /rules/check is forbidden`, async ({ page }) => {
      await loginAs(page, USERS.acme[who], '/rules')
      await expect(bodyRows(page).first()).toBeVisible()
      await expect(page.getByTestId('check-draft')).toHaveCount(0)
      await page.goto('/rules/check')
      await expect(page.getByText("You don't have access to this page")).toBeVisible()
      if (who === 'reviewer') await shot(page, 'check-forbidden')

      // The server agrees (403), so hiding is not the only guard.
      const t = await apiLogin(page.request, USERS.acme[who])
      const res = await page.request.post('/api/v1/rules/dry-run', {
        headers: { authorization: `Bearer ${t.access_token}` },
        data: { listing: {} },
      })
      expect(res.status()).toBe(403)
    })
  }
})

test.describe('rules responsive', () => {
  test.use({ viewport: { width: 375, height: 812 }, colorScheme: 'dark' })

  test('375px dark: list and dry run fit without horizontal scroll', async ({ page }) => {
    await loginAs(page, USERS.acme.operator, '/rules')
    await expect(bodyRows(page).first()).toBeVisible()
    const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    expect(await noHScroll()).toBe(true)
    await shot(page, 'mobile-list')

    await page.goto('/rules/check?marketplace=amazon&category=ethnic_wear_kurta_sets')
    await page.getByTestId('draft-title').fill('Indigo cotton kurta set with dupatta')
    await page.getByTestId('draft-bullet-0').fill('Soft cotton fabric')
    await page.getByTestId('draft-description').fill('A kurta set.')
    await page.getByTestId('add-attribute').click()
    await page.getByTestId('attr-key-0').fill('color')
    await page.getByTestId('attr-value-0').fill('indigo')
    expect(await noHScroll()).toBe(true)
    await page.getByTestId('run-dry-run').click()
    await expect(page.getByTestId('dry-run-verdict')).toHaveText('Fail')
    await expect(page.getByTestId('dry-run-issue').first()).toHaveAttribute('data-field', 'attributes.fabric_type')
    await page.waitForTimeout(400)
    expect(await noHScroll()).toBe(true)
    await shot(page, 'mobile-check')

    // MISSING_ATTRIBUTE: "Edit field" adds a row with that key and focuses its value.
    const group = page.getByTestId('dry-run-issues').locator('> li').filter({ hasText: 'fabric_type' })
    await group.getByRole('button', { name: 'Edit field' }).click()
    await expect(page.getByTestId('attr-key-1')).toHaveValue('fabric_type')
    await expect(page.getByTestId('attr-value-1')).toBeFocused()
    await page.keyboard.type('cotton')
    await page.getByTestId('run-dry-run').click()
    await expect(page.getByTestId('dry-run-verdict')).toHaveText('Pass')
  })
})
