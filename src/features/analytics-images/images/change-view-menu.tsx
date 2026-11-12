/**
 * Client feedback 7: move a saved photo to another view (Front, Back, Close-up, Size chart, or a
 * "More photos" kind) without uploading it again. A Radix menu, so the arrow keys, Enter, Escape and
 * typeahead work, and focus returns to the button. Backend: PATCH /images/{image_id}.
 */
import { Icon } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import type { ViewChoice } from './photo-views'

export function ChangeViewMenu({
  label,
  choices,
  onChoose,
  busy = false,
  variant = 'ghost',
  className,
}: {
  /** The photo's view now, for the button's name: "Change view of the back photo". */
  label: string
  choices: readonly ViewChoice[]
  onChoose: (choice: ViewChoice) => void
  /** A move of this photo is on its way. */
  busy?: boolean
  /** `secondary` on a photo tile (it sits over the picture). */
  variant?: 'ghost' | 'secondary'
  className?: string
}) {
  const current = choices.find((c) => c.current)?.key ?? ''
  const tiles = choices.filter((c) => c.group === 'tile')
  const more = choices.filter((c) => c.group === 'more')
  const pick = (key: string) => {
    const choice = choices.find((c) => c.key === key)
    if (choice && !choice.current) onChoose(choice)
  }
  const item = (c: ViewChoice) => (
    <DropdownMenuRadioItem key={c.key} value={c.key} className="items-start" data-testid={`view-choice-${c.key}`}>
      <span className="flex min-w-0 flex-col">
        <span>{c.label}</span>
        {c.swaps ? <span className="text-caption text-ink-3">Swaps with the photo there now</span> : null}
      </span>
    </DropdownMenuRadioItem>
  )
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={busy}>
        <Button
          type="button"
          variant={variant}
          size="icon-sm"
          aria-label={`Change view of the ${label.toLocaleLowerCase('en')} photo`}
          title="Change view"
          aria-busy={busy || undefined}
          className={className}
          data-testid="change-view"
        >
          {busy ? <Spinner className="size-4" aria-hidden /> : <Icon name="more" size={16} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-caption text-ink-3">Change view</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current} onValueChange={pick}>
          {tiles.map(item)}
          {more.length ? <DropdownMenuSeparator /> : null}
          {more.length ? <DropdownMenuLabel className="text-caption text-ink-3">More photos</DropdownMenuLabel> : null}
          {more.map(item)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
