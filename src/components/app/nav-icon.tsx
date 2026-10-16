import type { LucideIcon } from 'lucide-react'
import { Icon, type IconName } from '@/components/la/icons'

/** Renders a nav item's icon: a hi-fi icon name or a lucide component. */
export function NavIcon({ icon, size = 18 }: { icon: IconName | LucideIcon; size?: number }) {
  if (typeof icon === 'string') return <Icon name={icon} size={size} />
  const L = icon
  return <L size={size} strokeWidth={1.75} aria-hidden />
}
