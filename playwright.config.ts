import { defineConfig, devices } from '@playwright/test'

// E2E_* settings come from the environment or the git-ignored .env.local.
try {
  process.loadEnvFile('.env.local')
} catch {
  /* no .env.local */
}

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

/**
 * Live e2e against a real, seeded backend (no mocks); see README "End-to-end tests".
 * One worker by default: login is limited to 5/min per IP+email and the tenant to 120 req/min.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS ?? 1),
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
