import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { expect, type Page } from '@playwright/test'
import { API_URL, BACKEND_DIR } from './env'

/**
 * Helpers for the login-code spec (mfa.spec.ts): RFC 6238 codes computed from the setup key the
 * UI shows, the backend's staff CLI to create users, and a few SQL updates that put a user in a
 * state the API cannot reach by itself (a returning user, an old password).
 */

// ---- TOTP (RFC 6238: HMAC-SHA1, 6 digits, 30 s steps) --------------------------------------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx < 0) throw new Error(`not base32: ${ch}`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function totpAt(secret: string, step: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(step))
  const mac = createHmac('sha1', base32Decode(secret)).update(msg).digest()
  const offset = mac[mac.length - 1]! & 0x0f
  const bin = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(bin).padStart(6, '0')
}

const stepNow = () => Math.floor(Date.now() / 30_000)

/**
 * One authenticator: each code is accepted once (the server keeps the last used step), so the
 * next code waits for a step after the last one used. It also skips the last 2 s of a step.
 */
export class Authenticator {
  private lastStep = -1
  constructor(readonly secret: string) {}

  async code(): Promise<string> {
    for (;;) {
      const now = Date.now()
      const step = Math.floor(now / 30_000)
      const left = 30_000 - (now % 30_000)
      if (step > this.lastStep && left > 2_000) {
        this.lastStep = step
        return totpAt(this.secret, step)
      }
      await new Promise((r) => setTimeout(r, left + 50))
    }
  }

  /** A 6-digit code that is none of the codes the server accepts right now (one step of skew). */
  wrongCode(): string {
    const s = stepNow()
    const valid = new Set([s - 1, s, s + 1, s + 2].map((x) => totpAt(this.secret, x)))
    let n = Number(totpAt(this.secret, s))
    let c: string
    do {
      n = (n + 7919) % 1_000_000
      c = String(n).padStart(6, '0')
    } while (valid.has(c))
    return c
  }
}

// ---- the local backend ----------------------------------------------------------------------

function requireBackend(): string {
  if (!BACKEND_DIR) throw new Error('[e2e] mfa.spec needs E2E_BACKEND_DIR (a local backend checkout)')
  return BACKEND_DIR
}

/** The backend's staff CLI as the migrator (`python -m app.cli ...`), a password on stdin. */
export function cli(args: string[], stdin = ''): string {
  return execFileSync('uv', ['run', '--frozen', 'python', '-m', 'app.cli', ...args], {
    cwd: requireBackend(),
    input: stdin,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 60_000,
  }).toString()
}

/** One SQL statement as the postgres superuser in this checkout's compose stack. */
export function sql(statement: string): string {
  return execFileSync(
    'bash',
    [
      '-c',
      'eval "$(scripts/ci/worktree_env.sh exports .worktree.env)"; docker compose exec -T postgres psql -U postgres -d marketplace_os -v ON_ERROR_STOP=1 -Atc "$1"',
      'sql',
      statement,
    ],
    { cwd: requireBackend(), stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 },
  )
    .toString()
    .trim()
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`

/** A user who has signed in before and chose the current password (not staff-set). */
export function markReturningUser(email: string, opts: { passwordAgeDays?: number } = {}) {
  const age = opts.passwordAgeDays ?? 0
  sql(
    `UPDATE users SET last_login_at = now(), password_must_change = false, ` +
      `password_changed_at = now() - interval '${age} days' WHERE email = ${quote(email)}`,
  )
}

export function lockState(email: string): { failed: number; locked: boolean } {
  const [failed, locked] = sql(
    `SELECT failed_auth_count, coalesce(locked_until > now(), false) FROM users WHERE email = ${quote(email)}`,
  ).split('|')
  return { failed: Number(failed), locked: locked === 't' }
}

/**
 * The API's enforcement mode: the MFA routes answer 501 under `off` and refuse an unknown
 * challenge with 401 under `all`.
 */
export async function enforcementMode(): Promise<'off' | 'all'> {
  const res = await fetch(`${API_URL}/api/v1/auth/login/mfa`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challenge_token: 'probe', code: '000000' }),
  })
  return res.status === 501 ? 'off' : 'all'
}

// ---- UI steps ------------------------------------------------------------------------------

/** The setup key as shown (groups of four), without spaces. */
export async function readSetupKey(page: Page): Promise<string> {
  const key = page.getByTestId('mfa-secret')
  await expect(key).toBeVisible()
  return (await key.innerText()).replace(/\s+/g, '')
}

export async function readRecoveryCodes(page: Page): Promise<string[]> {
  const items = page.getByTestId('recovery-codes').locator('ol li')
  await expect(items).toHaveCount(10)
  return (await items.allInnerTexts()).map((t) => t.trim())
}

export async function signOut(page: Page) {
  await page.getByTestId('user-menu').click()
  await page.getByTestId('sign-out').click()
  await expect(page).toHaveURL(/\/login/)
}
