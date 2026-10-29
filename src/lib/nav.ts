/**
 * Navigation registry: one entry per feature (with `capability` for endpoints the backend has
 * not shipped yet). An item appears when (1) its route exists in the generated route tree,
 * (2) the current role holds `action`, and (3) its optional `capability` is BUILT and probed live.
 */
import type { LucideIcon } from 'lucide-react'
import { useRouter } from '@tanstack/react-router'
import { useMemo } from 'react'
import { BUILT, type Capability } from '@/api/capabilities'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import type { IconName } from '@/components/la/icons'
import { useCapabilityProbe } from '@/hooks/use-capabilities'
import { useCan, type Policy } from '@/lib/permissions'

export interface NavItem {
  id: string
  label: string
  to: string
  /** A hi-fi icon name, or a lucide component where the set lacks the concept (docs/DESIGN.md → Icons). */
  icon: IconName | LucideIcon
  /** RBAC action (or 'platform:admin') required to see the item (src/lib/permissions.ts). */
  action: Policy
  /** 'main' = sidebar; 'user' = user menu. Both appear in the command palette. */
  placement: 'main' | 'user'
  /** Pending backend capability; hidden until BUILT and live. */
  capability?: Capability
  /** Only in dev builds. */
  devOnly?: boolean
  /** Extra words for the command palette. */
  keywords?: string[]
  description: string
  /** Sidebar section. 'main' items render without a heading (hi-fi p06). */
  section?: NavSection
  /** Paths (besides `to`) that keep this item highlighted. */
  activeFor?: readonly string[]
}

export type NavSection = 'Main' | 'Platform'
export const NAV_SECTIONS: readonly NavSection[] = ['Main', 'Platform']

/**
 * Sidebar order = hi-fi order: Home, Products, Add products, Inbox, Marketplaces, Activity,
 * Settings; then Platform (platform admins only).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'home',
    section: 'Main',
    label: 'Home',
    to: '/home',
    icon: 'home',
    action: 'tenant:read',
    placement: 'main',
    keywords: ['dashboard', 'overview', 'start'],
    description: 'What is live, in progress and waiting for you',
    activeFor: ['/analytics'],
  },
  {
    id: 'products',
    section: 'Main',
    label: 'Products',
    to: '/products',
    icon: 'box',
    action: 'tenant:read',
    placement: 'main',
    keywords: ['catalog', 'sku', 'listings'],
    description: 'Every product and its marketplace status',
    activeFor: ['/listings', '/runs', '/imports', '/jobs', '/issues'],
  },
  {
    id: 'add',
    section: 'Main',
    label: 'Add products',
    to: '/add',
    icon: 'plus',
    action: 'product:import',
    placement: 'main',
    keywords: ['new', 'create', 'upload', 'csv', 'bulk', 'import'],
    description: 'Guided form or bulk spreadsheet',
    activeFor: ['/products/new', '/imports/new'],
  },
  {
    id: 'inbox',
    section: 'Main',
    label: 'Inbox',
    to: '/inbox',
    icon: 'inbox',
    action: 'tenant:read',
    capability: 'inbox',
    placement: 'main',
    keywords: ['issues', 'tasks', 'questions', 'todo'],
    description: 'Questions and issues that need you',
  },
  {
    id: 'marketplaces',
    section: 'Main',
    label: 'Marketplaces',
    to: '/marketplaces',
    icon: 'store',
    action: 'tenant:read',
    placement: 'main',
    keywords: ['amazon', 'flipkart', 'connect'],
    description: 'Connected seller accounts',
  },
  {
    id: 'activity',
    section: 'Main',
    label: 'Activity',
    to: '/activity',
    icon: 'activity',
    action: 'tenant:read',
    placement: 'main',
    keywords: ['history', 'log', 'agent'],
    description: 'What the agent and your team did',
  },
  {
    id: 'settings',
    section: 'Main',
    label: 'Settings',
    to: '/settings',
    icon: CONCEPT_ICON.settings,
    action: 'tenant:read',
    placement: 'main',
    keywords: ['brand', 'team', 'rules', 'autonomy', 'compliance'],
    description: 'Brand profile, team, rules and approval',
    activeFor: ['/brand', '/team', '/rules', '/setup', '/account'],
  },
  {
    id: 'signups',
    section: 'Platform',
    label: 'Sign-up requests',
    to: '/admin/signups',
    icon: CONCEPT_ICON.signups,
    action: 'platform:admin',
    capability: 'signups',
    placement: 'main',
    keywords: ['admin', 'approve', 'reject', 'onboarding', 'trial'],
    description: 'Approve or reject brand sign-ups',
  },
  {
    id: 'account',
    label: 'Account',
    to: '/account',
    icon: 'user',
    action: 'tenant:read',
    placement: 'user',
    keywords: ['profile', 'brand', 'switch'],
    description: 'Your email, role and brands',
  },
  {
    id: 'about',
    label: 'Diagnostics',
    to: '/about',
    icon: CONCEPT_ICON.diagnostics,
    action: 'settings:manage',
    placement: 'user',
    devOnly: true,
    keywords: ['about', 'health', 'capabilities'],
    description: 'API health and capability probe',
  },
]

/** Length of the longest of `item`'s paths that `pathname` falls under, or -1. */
function matchLength(item: Pick<NavItem, 'to' | 'activeFor'>, pathname: string) {
  let best = -1
  for (const p of [item.to, ...(item.activeFor ?? [])]) {
    if ((pathname === p || pathname.startsWith(`${p}/`)) && p.length > best) best = p.length
  }
  return best
}

/** Whether `pathname` belongs to `item` (its own path or one of `activeFor`). */
export function isNavActive(item: Pick<NavItem, 'to' | 'activeFor'>, pathname: string) {
  return matchLength(item, pathname) >= 0
}

/** The one item to highlight: the most specific match (/products/new → Add products). */
export function activeNavId(items: readonly Pick<NavItem, 'id' | 'to' | 'activeFor'>[], pathname: string): string | null {
  let id: string | null = null
  let best = -1
  for (const i of items) {
    const n = matchLength(i, pathname)
    if (n > best) {
      best = n
      id = i.id
    }
  }
  return id
}

/** Whether a route file exists for `path` in the generated route tree. */
export function useRouteExists() {
  const router = useRouter()
  return useMemo(() => {
    const byPath = router.routesByPath as unknown as Record<string, unknown>
    return (path: string) => path in byPath || `${path}/` in byPath
  }, [router])
}

/** Nav items visible to the current user (route exists + role allows + capability live). */
export function useNavItems(placement?: NavItem['placement']) {
  const can = useCan()
  const exists = useRouteExists()
  const needsProbe = NAV_ITEMS.some((i) => i.capability && BUILT[i.capability])
  const probe = useCapabilityProbe({ enabled: needsProbe })
  const probed = probe.data
  return useMemo(() => {
    const live = (c: Capability) =>
      BUILT[c] && probed?.find((p) => p.capability === c)?.result === 'live'
    return NAV_ITEMS.filter(
        (item) =>
          (!placement || item.placement === placement) &&
          (!item.devOnly || import.meta.env.DEV) &&
          (!item.capability || live(item.capability)) &&
          exists(item.to) &&
        can(item.action),
    )
  }, [can, exists, placement, probed])
}
