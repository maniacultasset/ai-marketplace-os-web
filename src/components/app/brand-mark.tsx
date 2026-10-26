import { LogoMark } from '@/components/la/icons'

/** Kuinn mark (28px). Kept for existing imports; new code uses LogoMark / Wordmark. */
export function BrandMark({ className }: { className?: string }) {
  return <LogoMark className={className} />
}
