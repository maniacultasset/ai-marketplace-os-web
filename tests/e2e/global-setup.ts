import { API_URL, resetRateLimits } from './env'

/** Fail fast unless the backend is ready; start every run with a full rate-limit budget. */
export default async function globalSetup() {
  const deadline = Date.now() + 30_000
  let last = ''
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_URL}/readyz`)
      if (res.ok) break
      last = `HTTP ${res.status}`
    } catch (e) {
      last = String(e)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  if (Date.now() >= deadline) throw new Error(`Backend not ready at ${API_URL}/readyz (${last})`)
  if (!resetRateLimits()) console.warn('[e2e] rate limits not reset (script unavailable); tests will wait on 429s')
}
