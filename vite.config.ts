/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Preloads the two latin web font files the first screen uses, so they arrive with the CSS instead
 * of after it (index.css also carries size-matched fallbacks). Build only: the hashed names exist
 * once the bundle is written.
 */
function preloadFonts(): Plugin {
  const wanted = [/^dm-sans-latin-opsz-normal/, /^bricolage-grotesque-latin-opsz-normal/]
  return {
    name: 'kuinn-preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.values(ctx.bundle ?? {})
          .map((f) => f.fileName)
          .filter((name) => name.endsWith('.woff2') && wanted.some((re) => re.test(name.split('/').pop() ?? '')))
        return files.map((name) => ({
          tag: 'link',
          attrs: { rel: 'preload', href: `/${name}`, as: 'font', type: 'font/woff2', crossorigin: '' },
          injectTo: 'head' as const,
        }))
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Dev only: where `pnpm dev` forwards /api and /readyz. Set it in .env.local.
  const apiTarget = env.DEV_API_PROXY_TARGET
  const proxy = apiTarget
    ? Object.fromEntries(['/api', '/readyz'].map((p) => [p, { target: apiTarget, changeOrigin: true }]))
    : undefined
  return {
    plugins: [
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      preloadFonts(),
    ],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      // Dates render in the viewer's zone; pin the zone so CI and laptops agree.
      env: { TZ: 'Asia/Kolkata' },
    },
    server: {
      port: 5173,
      strictPort: true,
      // Test output changes during e2e runs; watching it reloads the page mid-test.
      watch: {
        ignored: ['**/test-results/**', '**/playwright-report/**', '**/docs/**'],
      },
      proxy,
    },
  }
})
