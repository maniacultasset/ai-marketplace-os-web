import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * A link shown once (an invite or a reset link): a read-only field with Copy, and one line on
 * how to send it. Kuinn sends no email, so the person who made the link passes it on.
 */
export function OneTimeLink({ url, label, note, testId }: { url: string; label: string; note: string; testId?: string }) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const selectAll = () => inputRef.current?.select()
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(url)
      setState('copied')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), 2500)
    } catch {
      // No clipboard access (an insecure origin or a blocked permission): select it for a manual copy.
      selectAll()
      setState('manual')
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <label htmlFor={id} className="text-small font-bold text-ink">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          ref={inputRef}
          id={id}
          readOnly
          value={url}
          onFocus={selectAll}
          spellCheck={false}
          className="min-w-0 flex-1 font-mono text-small"
          aria-describedby={`${id}-note`}
          data-testid={testId ? `${testId}-url` : undefined}
        />
        <Button type="button" variant="secondary" onClick={() => void copy()} className="shrink-0" data-testid={testId ? `${testId}-copy` : undefined}>
          {state === 'copied' ? <Icon name="check" size={16} className="text-success" /> : <Icon name="copy" size={16} />}
          {state === 'copied' ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      <p id={`${id}-note`} className="text-caption text-ink-2" aria-live="polite">
        {state === 'manual' ? 'Your browser blocked copying. The link is selected: copy it with your keyboard.' : note}
      </p>
    </div>
  )
}
