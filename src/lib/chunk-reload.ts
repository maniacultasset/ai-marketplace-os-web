/**
 * A tab opened before a deploy asks for the old build's route chunks, which the new deploy no
 * longer serves. The router then cannot load the next screen and the previous one stays on
 * screen under the new URL (prod QA 9 Nov, item 21: /marketplaces still showed Settings >
 * Autonomy). Vite reports that as `vite:preloadError`: load the URL again, once per URL in this
 * tab, so a broken deploy can never loop.
 */
const KEY = 'kuinn:chunk-reload'

export interface ReloadHost {
  addEventListener(type: 'vite:preloadError', listener: (e: Event) => void): void
  location: { href: string; reload(): void }
  sessionStorage: Pick<Storage, 'getItem' | 'setItem'>
}

export function installChunkReload(host: ReloadHost): void {
  host.addEventListener('vite:preloadError', (e) => {
    let last: string | null = null
    try {
      last = host.sessionStorage.getItem(KEY)
    } catch {
      // storage blocked: still reload once
    }
    if (last === host.location.href) return // already reloaded for this URL: show the error
    e.preventDefault()
    try {
      host.sessionStorage.setItem(KEY, host.location.href)
    } catch {
      // storage blocked
    }
    host.location.reload()
  })
}
