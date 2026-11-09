import { describe, expect, it, vi } from 'vitest'
import { installChunkReload, type ReloadHost } from './chunk-reload'

function host(href: string) {
  let listener: ((e: Event) => void) | null = null
  const store = new Map<string, string>()
  const h: ReloadHost = {
    addEventListener: (_t, l) => {
      listener = l
    },
    location: { href, reload: vi.fn() },
    sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
  }
  return { h, fire: () => listener!(new Event('vite:preloadError', { cancelable: true })) }
}

describe('installChunkReload (prod QA 9 Nov, item 21)', () => {
  it('reloads once when a route chunk of an old build fails, never in a loop', () => {
    const { h, fire } = host('https://www.kuinn.in/marketplaces')
    installChunkReload(h)
    fire()
    expect(h.location.reload).toHaveBeenCalledTimes(1)
    fire()
    expect(h.location.reload).toHaveBeenCalledTimes(1)
    h.location.href = 'https://www.kuinn.in/home'
    fire()
    expect(h.location.reload).toHaveBeenCalledTimes(2)
  })
})
