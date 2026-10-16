/**
 * Per-route shell metadata, set with `staticData` on a route:
 *
 *   export const Route = createFileRoute('/_app/products/')({
 *     staticData: { title: 'Products', navCollapsed: true },
 *     component: ProductsPage,
 *   })
 *
 * `title` is the top-bar page title (the deepest match that sets one wins).
 * `navCollapsed` starts the sidebar as the 72px icon rail on that screen (hi-fi p07, p15) unless the
 * person has chosen otherwise with the collapse control.
 * `solo` renders the screen in the setup frame (logo header, no sidebar) instead of the app shell.
 */
import { useMatches } from '@tanstack/react-router'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    title?: string
    navCollapsed?: boolean
    /** Render without the app shell: logo header only (setup flow, hi-fi 02-04). */
    solo?: boolean
  }
}

export function useRouteMeta(): { title: string | undefined; navCollapsed: boolean; solo: boolean } {
  const matches = useMatches()
  let title: string | undefined
  let navCollapsed = false
  let solo = false
  for (const m of matches) {
    if (m.staticData?.title) title = m.staticData.title
    if (m.staticData?.navCollapsed) navCollapsed = true
    if (m.staticData?.solo) solo = true
  }
  return { title, navCollapsed, solo }
}
