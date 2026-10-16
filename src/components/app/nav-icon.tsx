import { IconGlyph, type IconSource } from '@/components/la/icons'

/** Renders a nav item's icon: a hi-fi icon name or a lucide component, at the shared weight. */
export function NavIcon({ icon, size = 18, className }: { icon: IconSource; size?: number; className?: string }) {
  return <IconGlyph icon={icon} size={size} className={className} />
}
