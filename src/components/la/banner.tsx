/**
 * Banner (hi-fi Components → Banner). Tone info | success | attention | danger | neutral; optional
 * action on the right. Padding 12 16, radius 10, icon 18. Copy states what happened and the one
 * next action.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { IconTile, type IconName, type TileTone } from './icons'

export type BannerTone = 'info' | 'success' | 'attention' | 'danger' | 'neutral'

const TONE: Record<BannerTone, { box: string; icon: IconName; tile: TileTone }> = {
  info: { box: 'border-brand-line bg-brand-bg text-brand-ink', icon: 'spark', tile: 'brand' },
  success: { box: 'border-success-line bg-success-bg text-success-ink', icon: 'check', tile: 'ok' },
  attention: { box: 'border-attention-line bg-attention-bg text-attention-ink', icon: 'alert', tile: 'warn' },
  danger: { box: 'border-danger-line bg-danger-bg text-danger-ink', icon: 'alert', tile: 'fail' },
  neutral: { box: 'border-line bg-surface text-ink shadow-raised-sm', icon: 'spark', tile: 'neutral' },
}

export function Banner({
  tone = 'info',
  title,
  children,
  action,
  icon,
  className,
  role,
}: {
  tone?: BannerTone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  icon?: IconName | null
  className?: string
  /** 'alert' for errors raised by the user's own action; default is a plain region. */
  role?: 'alert' | 'status'
}) {
  const t = TONE[tone]
  const glyph = icon === undefined ? t.icon : icon
  return (
    <div role={role} className={cn('flex items-start gap-3 rounded-[10px] border px-4 py-3 text-body', t.box, className)}>
      {/* Matte tile on the tinted banner: surface fill, tone glyph. */}
      {glyph ? <IconTile icon={glyph} tone={t.tile} size="sm" className="-my-1 bg-surface" /> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-bold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2 self-center">{action}</div> : null}
    </div>
  )
}
