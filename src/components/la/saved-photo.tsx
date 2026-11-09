/**
 * A product photo from a signed link: a calm, fixed-size placeholder that the photo fades into once
 * it has loaded, so nothing moves. A fresh link (the old one expired) loads behind the photo already
 * shown and swaps in only when ready. A link that fails keeps the placeholder and calls `onError`
 * once for it, so the caller can read a fresh link.
 */
import { useState } from 'react'
import { Icon } from '@/components/la/icons'
import { cn } from '@/lib/utils'

export function SavedPhoto({
  src,
  alt,
  className,
  iconSize = 16,
  fit = 'cover',
  onError,
  testId,
}: {
  src?: string | null
  /** The photo's description; empty when the row around it already names it. */
  alt: string
  /** The frame: size, radius and ring. The photo fills it. */
  className?: string
  iconSize?: number
  fit?: 'cover' | 'contain'
  onError?: () => void
  testId?: string
}) {
  const [shown, setShown] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const want = src ?? null
  const loading = want !== null && want !== shown && want !== failed
  const visible = shown !== null && (want === shown || loading)
  const img = 'absolute inset-0 size-full transition-opacity duration-200 motion-reduce:transition-none'
  const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover'
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted text-muted-foreground', className)}
      data-testid={testId}
      data-state={visible && want === shown ? 'shown' : loading ? 'loading' : want && want === failed ? 'failed' : 'empty'}
    >
      <Icon name="image" size={iconSize} aria-hidden className={cn('transition-opacity duration-200 motion-reduce:transition-none', visible && 'opacity-0')} />
      {visible && shown !== want ? <img key={shown} src={shown} alt="" aria-hidden className={cn(img, fitClass)} /> : null}
      {want !== null && want !== failed ? (
        <img
          key={want}
          src={want}
          alt={alt}
          decoding="async"
          onLoad={() => setShown(want)}
          onError={() => {
            setFailed(want)
            onError?.()
          }}
          className={cn(img, fitClass, want === shown ? 'opacity-100' : 'opacity-0')}
        />
      ) : null}
      {want === null || want === failed ? (alt ? <span className="sr-only">{alt}</span> : null) : null}
    </span>
  )
}
