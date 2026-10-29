import type { ChipStatus } from '@/components/la/status-chip'
import type { AccountStatus, Marketplace } from './api'

export const MARKETPLACES: readonly Marketplace[] = ['amazon', 'flipkart']

/** Names follow the hi-fi (p04): "Amazon", "Flipkart". */
export const MARKETPLACE_META: Record<
  Marketplace,
  { name: string; short: string; console: string }
> = {
  amazon: { name: 'Amazon', short: 'Amazon', console: 'Seller Central' },
  flipkart: { name: 'Flipkart', short: 'Flipkart', console: 'the Flipkart seller dashboard' },
}

/** Connection health → hi-fi status chip (glyph + word, never colour alone). */
export const STATUS_META: Record<AccountStatus | 'none', { label: string; chip: ChipStatus }> = {
  active: { label: 'Connected', chip: 'live' },
  needs_reconnect: { label: 'Reconnect needed', chip: 'needs-you' },
  revoked: { label: 'Revoked', chip: 'not-listed' },
  none: { label: 'Not connected', chip: 'not-listed' },
}
