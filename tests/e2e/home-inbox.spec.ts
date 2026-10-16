import { apiLogin, expect, loginAs, test, USERS } from './fixtures'

/**
 * Home (/home), Inbox (/inbox) and Issue detail (/issues/:id) against the live backend and demo
 * seed. Every number the UI shows is checked against the same API reads it is computed from. The
 * seed may hold no listings, tasks or issues, so data-dependent checks accept the empty states.
 * Nothing is mutated (dismiss is checked at the contract level only).
 */

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
const NIL = '00000000-0000-4000-8000-000000000000'

type PageBody<T> = { data: T[]; page: { has_more: boolean; next_cursor?: string | null } }

async function getAll<T>(request: import('@playwright/test').APIRequestContext, token: string, path: string, maxPages = 5) {
  const rows: T[] = []
  let cursor: string | null | undefined
  for (let i = 0; i < maxPages; i++) {
    const sep = path.includes('?') ? '&' : '?'
    const res = await request.get(`${path}${sep}limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: auth(token) })
    expect(res.ok()).toBe(true)
    const body = (await res.json()) as PageBody<T>
    rows.push(...body.data)
    if (!body.page.has_more || !body.page.next_cursor) return { rows, complete: true }
    cursor = body.page.next_cursor
  }
  return { rows, complete: false }
}

test.describe('home', () => {
  test('first run or dashboard follows GET /listings, and Live counts only marketplace-confirmed listings', async ({ page }) => {
    const { access_token } = await apiLogin(page.request, USERS.acme.owner)
    const { rows, complete } = await getAll<{ status: string; marketplace_state: string }>(page.request, access_token, '/api/v1/listings')
    await loginAs(page, USERS.acme.owner, '/home')

    if (rows.length === 0) {
      await expect(page.getByRole('heading', { level: 1, name: /^Welcome/ })).toBeVisible()
      await expect(page.getByTestId('setup-card')).toBeVisible()
      await expect(page.getByTestId('setup-compliance')).toContainText('Later')
      // Photo intake has no API: the card is disabled, never selectable.
      await expect(page.getByRole('radio', { name: /Photos and basics/ })).toHaveAttribute('aria-disabled', 'true')
      return
    }
    const live = rows.filter((l) => l.marketplace_state === 'live').length
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible()
    await expect(page.getByTestId('tile-live-value')).toHaveText(complete ? String(live) : new RegExp(`^${live}\\+$`))
  })

  test('Needs you and "Waiting for you" match open tasks and issues', async ({ page }) => {
    const { access_token } = await apiLogin(page.request, USERS.acme.owner)
    const [l, t, i] = await Promise.all([
      page.request.get('/api/v1/listings?limit=1', { headers: auth(access_token) }),
      page.request.get('/api/v1/tasks?limit=50', { headers: auth(access_token) }),
      page.request.get('/api/v1/issues?limit=50', { headers: auth(access_token) }),
    ])
    test.skip(((await l.json()) as PageBody<unknown>).data.length === 0, 'first run: no dashboard tiles')
    const tasks = (await t.json()) as PageBody<unknown>
    const issues = (await i.json()) as PageBody<unknown>
    const n = tasks.data.length + issues.data.length

    await loginAs(page, USERS.acme.owner, '/home')
    const card = page.getByTestId('waiting-card')
    if (n === 0) await expect(card.getByTestId('waiting-empty')).toBeVisible()
    else {
      await expect(card.getByTestId('waiting-title')).toHaveCount(Math.min(3, n))
      const more = tasks.page.has_more || issues.page.has_more
      await expect(card.getByTestId('waiting-view-all')).toHaveText(`View all ${n}${more ? '+' : ''}`)
    }
  })

  test('unsupported marketplaces are honest: Not available, waitlist disabled', async ({ page }) => {
    const { access_token } = await apiLogin(page.request, USERS.acme.owner)
    const l = await page.request.get('/api/v1/listings?limit=1', { headers: auth(access_token) })
    test.skip(((await l.json()) as PageBody<unknown>).data.length === 0, 'first run: no marketplace row')
    await loginAs(page, USERS.acme.owner, '/home')
    for (const id of ['myntra', 'ajio']) {
      const card = page.getByTestId(`home-mp-${id}`)
      await expect(card).toContainText('Not available')
      await expect(card.getByRole('button', { name: 'Join waitlist' })).toHaveAttribute('aria-disabled', 'true')
    }
  })

  test('Add products is hidden for a reviewer', async ({ page }) => {
    await loginAs(page, USERS.acme.reviewer, '/home')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByTestId('home-add-products')).toHaveCount(0)
    await expect(page.getByTestId('first-run-add')).toHaveCount(0)
  })

  test('no horizontal scroll at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, USERS.acme.owner, '/home')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  })
})

test.describe('inbox', () => {
  test('counts and list match GET /tasks and GET /issues', async ({ page }) => {
    const { access_token } = await apiLogin(page.request, USERS.acme.owner)
    const [t, i] = await Promise.all([
      page.request.get('/api/v1/tasks?limit=50', { headers: auth(access_token) }),
      page.request.get('/api/v1/issues?limit=50', { headers: auth(access_token) }),
    ])
    const tasks = (await t.json()) as PageBody<{ id: string }>
    const issues = (await i.json()) as PageBody<{ id: string }>
    const n = tasks.data.length + issues.data.length
    const more = tasks.page.has_more || issues.page.has_more

    await loginAs(page, USERS.acme.owner, '/inbox')
    await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible()
    await expect(page.getByTestId('inbox-open-count')).toHaveText(`${n}${more ? '+' : ''} open`)
    if (n === 0 && !more) await expect(page.getByTestId('inbox-empty')).toBeVisible()
    else await expect(page.getByTestId('inbox-item')).toHaveCount(n)
  })

  test('views and statuses live in the URL and query the API', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/inbox')
    const list = page.getByTestId('inbox-list')
    await list.getByRole('radio', { name: /Issues/ }).click()
    await expect(page).toHaveURL(/view=issues/)
    const req = page.waitForRequest((r) => r.url().includes('/api/v1/issues') && r.url().includes('status=dismissed'))
    await page.getByTestId('inbox-issue-status').click()
    await page.getByRole('option', { name: 'Dismissed' }).click()
    await req
    await expect(page).toHaveURL(/status=dismissed/)

    await list.getByRole('radio', { name: /Questions/ }).click()
    const tReq = page.waitForRequest((r) => r.url().includes('/api/v1/tasks') && r.url().includes('status=answered'))
    await page.getByTestId('inbox-task-status').click()
    await page.getByRole('option', { name: 'Answered' }).click()
    await tReq
    await expect(page).toHaveURL(/tasks=answered/)
  })

  test('junk deep-link params fall back to defaults', async ({ page }) => {
    await loginAs(page, USERS.acme.owner, '/inbox?view=bogus&item=task:12&status=nope')
    await expect(page.getByTestId('inbox-list').getByRole('radio', { name: /All/, checked: true })).toBeVisible()
  })

  test('a question shows its reason, and answering is honestly disabled', async ({ page }) => {
    const { access_token } = await apiLogin(page.request, USERS.acme.owner)
    const res = await page.request.get('/api/v1/tasks?limit=1', { headers: auth(access_token) })
    const task = ((await res.json()) as PageBody<{ id: string; kind: string; question: string; reason: string }>).data[0]
    test.skip(!task, 'the demo seed has no open tasks')

    await loginAs(page, USERS.acme.owner, `/inbox?item=task:${task!.id}`)
    const detail = page.getByTestId('task-detail')
    await expect(detail.getByTestId('task-question')).toHaveText(task!.question)
    await expect(detail.getByTestId('task-reason')).toHaveText(task!.reason)
    if (task!.kind === 'reconnect_account') {
      // The only task kind the backend creates: it closes on reconnect, so no answer controls.
      await expect(detail.getByTestId('reconnect-how')).toBeVisible()
      await expect(detail.getByTestId('task-reconnect')).toBeVisible()
      await expect(detail.getByTestId('task-confirm')).toHaveCount(0)
    } else {
      await expect(detail.getByTestId('answer-soon')).toContainText('Answering from here is coming soon.')
      await expect(detail.getByTestId('task-confirm')).toHaveAttribute('aria-disabled', 'true')
    }
  })

  test('mobile: list first, item with a back link (15b)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, USERS.acme.owner, '/inbox')
    await expect(page.getByTestId('inbox-list')).toBeVisible()
    await expect(page.getByTestId('inbox-detail')).toBeHidden()
    const first = page.getByTestId('inbox-item').first()
    if (await first.count()) {
      await first.click()
      await expect(page.getByTestId('inbox-list')).toBeHidden()
      await expect(page.getByTestId('inbox-detail')).toBeVisible()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  })

  test('dismiss: Idempotency-Key is required, unknown id is 404, operator is 403', async ({ page }) => {
    const owner = await apiLogin(page.request, USERS.acme.owner)
    const noKey = await page.request.post(`/api/v1/issues/${NIL}/dismiss`, { headers: auth(owner.access_token) })
    expect(noKey.status()).toBe(422)
    const unknown = await page.request.post(`/api/v1/issues/${NIL}/dismiss`, {
      headers: { ...auth(owner.access_token), 'Idempotency-Key': `pw-${Date.now()}` },
    })
    expect(unknown.status()).toBe(404)
    const operator = await apiLogin(page.request, USERS.acme.operator)
    const denied = await page.request.post(`/api/v1/issues/${NIL}/dismiss`, {
      headers: { ...auth(operator.access_token), 'Idempotency-Key': `pw-op-${Date.now()}` },
    })
    expect(denied.status()).toBe(403)
    expect((await denied.json()).error.type).toBe('PERMISSION_DENIED')
  })

  test('dismiss is offered to a reviewer on open warnings only, never to an operator', async ({ page }) => {
    const { access_token } = await apiLogin(page.request, USERS.acme.reviewer)
    const res = await page.request.get('/api/v1/issues?limit=50', { headers: auth(access_token) })
    const body = (await res.json()) as PageBody<{ id: string; severity: string }>
    const warning = body.data.find((i) => i.severity === 'warning')
    const error = body.data.find((i) => i.severity === 'error')
    test.skip(!warning && !error, 'the demo seed has no open issues')

    if (warning) {
      await loginAs(page, USERS.acme.reviewer, `/inbox?item=issue:${warning.id}`)
      await expect(page.getByTestId('issue-pane').getByTestId('issue-dismiss')).toBeVisible()
      await loginAs(page, USERS.acme.operator, `/inbox?item=issue:${warning.id}`)
      await expect(page.getByTestId('issue-pane')).toBeVisible()
      await expect(page.getByTestId('issue-dismiss')).toHaveCount(0)
    }
    if (error) {
      await loginAs(page, USERS.acme.reviewer, `/inbox?item=issue:${error.id}`)
      await expect(page.getByTestId('issue-pane')).toBeVisible()
      await expect(page.getByTestId('issue-dismiss')).toHaveCount(0)
    }
  })

  test('sidebar badge matches the first page of open issues and tasks', async ({ page }) => {
    const { access_token } = await apiLogin(page.request, USERS.acme.owner)
    const [i, t] = await Promise.all([
      page.request.get('/api/v1/issues?limit=50', { headers: auth(access_token) }),
      page.request.get('/api/v1/tasks?limit=50', { headers: auth(access_token) }),
    ])
    const issues = (await i.json()) as PageBody<unknown>
    const tasks = (await t.json()) as PageBody<unknown>
    const n = issues.data.length + tasks.data.length
    const more = issues.page.has_more || tasks.page.has_more
    await loginAs(page, USERS.acme.owner, '/products')
    const badge = page.getByTestId('inbox-nav-badge')
    if (n === 0 && !more) await expect(badge).toHaveCount(0)
    else await expect(badge).toHaveText(n > 99 ? '99+' : more ? `${n}+` : String(n))
  })
})

test.describe('issue detail', () => {
  test('shows the raw marketplace text unchanged and the listing’s submissions', async ({ page }) => {
    const { access_token } = await apiLogin(page.request, USERS.acme.owner)
    const res = await page.request.get('/api/v1/issues?limit=1', { headers: auth(access_token) })
    const issue = ((await res.json()) as PageBody<{ id: string; listing_id: string; raw_message?: string | null; message: string }>).data[0]
    test.skip(!issue, 'the demo seed has no open issues')

    await loginAs(page, USERS.acme.owner, `/issues/${issue!.id}?listing=${issue!.listing_id}`)
    const card = page.getByTestId('issue-card')
    await expect(card).toHaveAttribute('data-issue-id', issue!.id)
    await expect(card.getByTestId('issue-raw')).toContainText(issue!.raw_message ?? issue!.message)
    await expect(page.getByTestId('attempts-card')).toBeVisible()
  })

  test('a deep link without ?listing= still finds the issue; an unknown id is not found', async ({ page }) => {
    const { access_token } = await apiLogin(page.request, USERS.acme.owner)
    const res = await page.request.get('/api/v1/issues?limit=1', { headers: auth(access_token) })
    const issue = ((await res.json()) as PageBody<{ id: string }>).data[0]
    if (issue) {
      await loginAs(page, USERS.acme.owner, `/issues/${issue.id}`)
      await expect(page.getByTestId('issue-card')).toHaveAttribute('data-issue-id', issue.id)
    }
    await loginAs(page, USERS.acme.owner, `/issues/${NIL}`)
    await expect(page.getByText('Issue not found')).toBeVisible()
  })
})
