import { ShoppingBag, ShoppingCart, type LucideIcon } from 'lucide-react'
import type { AccountStatus, Marketplace } from './api'

export const MARKETPLACES: readonly Marketplace[] = ['amazon', 'flipkart']

export const MARKETPLACE_META: Record<
  Marketplace,
  { name: string; short: string; console: string; icon: LucideIcon; tileClass: string }
> = {
  amazon: {
    name: 'Amazon.in',
    short: 'Amazon',
    console: 'Seller Central',
    icon: ShoppingBag,
    tileClass: 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:bg-amber-400/10 dark:text-amber-400 dark:ring-amber-400/20',
  },
  flipkart: {
    name: 'Flipkart',
    short: 'Flipkart',
    console: 'the Flipkart seller dashboard',
    icon: ShoppingCart,
    tileClass: 'bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:bg-sky-400/10 dark:text-sky-400 dark:ring-sky-400/20',
  },
}

export const STATUS_META: Record<AccountStatus, { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  active: { label: 'Active', variant: 'success' },
  needs_reconnect: { label: 'Needs reconnect', variant: 'warning' },
  revoked: { label: 'Revoked', variant: 'muted' },
}
