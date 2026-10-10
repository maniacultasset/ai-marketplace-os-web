/**
 * Navigation registry: one entry per feature (with `capability` for endpoints the backend has
 * not shipped yet). An item appears when (1) its route exists in the generated route tree,
 * (2) the current role holds `action`, and (3) its optional `capability` is BUILT and probed live.
 */
import {
  FileUp,
  Gauge,
  ListChecks,
  Package,
  Store,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useRouter } from '@tanstack/react-router'
import { useMemo } from 'react'
import { BUILT, type Capability } from '@/api/capabilities'
import { useCapabilityProbe } from '@/hooks/use-capabilities'
import { useCan, type Action } from '@/lib/permissions'

export interface NavItem {
  id: string
  label: string
  to: string
  icon: LucideIcon
  /** RBAC action required to see the item (src/lib/permissions.ts). */
  action: Action
  /** 'main' = sidebar; 'user' = user menu. Both appear in the command palette. */
  placement: 'main' | 'user'
  /** Pending backend capability; hidden until BUILT and live. */
  capability?: Capability
  /** Only in dev builds. */
  devOnly?: boolean
  /** Extra words for the command palette. */
  keywords?: string[]
  description: string
  /** Sidebar section heading. */
  section?: NavSection
}

export type NavSection = 'Catalog' | 'Channels' | 'Compliance' | 'Organization'
export const NAV_SECTIONS: readonly NavSection[] = ['Catalog', 'Channels', 'Compliance', 'Organization']

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'products',
    section: 'Catalog',
    label: 'Products',
    to: '/products',
    icon: Package,
    action: 'tenant:read',
    placement: 'main',
    keywords: ['catalog', 'sku'],
    description: 'Product catalog',
  },
  {
    id: 'imports',
    section: 'Catalog',
    label: 'Imports',
    to: '/imports',
    icon: FileUp,
    action: 'tenant:read',
    placement: 'main',
    keywords: ['csv', 'upload', 'bulk'],
    description: 'CSV imports and reports',
  },
  {
    id: 'marketplaces',
    section: 'Channels',
    label: 'Marketplaces',
    to: '/marketplaces',
    icon: Store,
    action: 'tenant:read',
    placement: 'main',
    keywords: ['amazon', 'flipkart', 'connect'],
    description: 'Marketplace seller accounts',
  },
  {
    id: 'rules',
    section: 'Compliance',
    label: 'Rules',
    to: '/rules',
    icon: ListChecks,
    action: 'tenant:read',
    placement: 'main',
    keywords: ['validation', 'dry run'],
    description: 'Marketplace listing rules',
  },
  {
    id: 'team',
    section: 'Organization',
    label: 'Team',
    to: '/team',
    icon: Users,
    action: 'team:manage',
    placement: 'main',
    keywords: ['members', 'roles'],
    description: 'Members and roles',
  },
  {
    id: 'account',
    label: 'Account',
    to: '/account',
    icon: UserRound,
    action: 'tenant:read',
    placement: 'user',
    keywords: ['profile', 'brand', 'switch'],
    description: 'Your email, role and brands',
  },
  {
    id: 'about',
    label: 'Diagnostics',
    to: '/about',
    icon: Gauge,
    action: 'settings:manage',
    placement: 'user',
    devOnly: true,
    keywords: ['about', 'health', 'capabilities'],
    description: 'API health and capability probe',
  },
]

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
