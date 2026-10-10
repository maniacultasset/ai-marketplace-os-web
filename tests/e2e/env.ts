import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * End-to-end settings. The suite runs against a real backend with its demo seed loaded; nothing
 * is mocked. See README "End-to-end tests" for the variables.
 */
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`[e2e] ${name} is not set (see README, "End-to-end tests")`)
  return value.replace(/\/+$/, '')
}

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
export const API_URL = required('E2E_API_URL')
export const PASSWORD = process.env.E2E_PASSWORD ?? 'devpassword123'
/** The backend's fake Amazon/Flipkart OAuth server (marketplace specs only). */
export const FAKE_MARKETPLACE_URL = process.env.E2E_FAKE_MARKETPLACE_URL?.replace(/\/+$/, '') ?? ''
/** Optional local backend checkout: enables the rate-limit reset and the token-refresh test. */
export const BACKEND_DIR = process.env.E2E_BACKEND_DIR ? path.resolve(process.env.E2E_BACKEND_DIR) : ''
export const ARTIFACTS = path.resolve(import.meta.dirname, '../../test-results/artifacts')

/** Empty the backend's local rate limiter. Returns false when no backend checkout is configured. */
export function resetRateLimits(): boolean {
  const script = BACKEND_DIR && path.join(BACKEND_DIR, 'scripts/ci/reset_rate_limits.sh')
  if (process.env.E2E_RESET_RATE_LIMITS === '0' || !script || !existsSync(script)) return false
  try {
    execFileSync(script, [API_URL], { stdio: 'pipe', timeout: 30_000 })
    return true
  } catch {
    return false
  }
}
