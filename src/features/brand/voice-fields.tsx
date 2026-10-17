/** Guidelines and glossary list editors (controlled; errors keyed as in profile-model.ts). */
import { Icon } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FieldError } from './field-error'
import {
  fieldLength,
  emptyGlossaryRow,
  emptyGuideline,
  GLOSSARY_MAX,
  GUIDELINE_MAX,
  GUIDELINES_MAX,
  TERM_MAX,
  type GlossaryRow,
  type GuidelineRow,
  type ProfileErrors,
} from './profile-model'

function focusLater(selector: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus())
}

export function GuidelinesEditor({
  rows,
  onChange,
  errors,
  onTouch,
}: {
  rows: GuidelineRow[]
  onChange: (next: GuidelineRow[]) => void
  errors: ProfileErrors
  /** The person left a control (its error key, as in ProfileErrors): errors show from then on. */
  onTouch?: (key: string) => void
}) {
  const filled = rows.filter((r) => r.text.trim()).length
  const full = rows.length >= GUIDELINES_MAX
  const add = () => {
    const row = emptyGuideline()
    onChange([...rows, row])
    focusLater(`[data-row="${row.id}"]`)
  }
  return (
    <div className="space-y-2">
      {rows.length ? (
        <ol className="space-y-2" aria-label="Guidelines">
          {rows.map((r, i) => {
            const err = errors[`guidelines.${r.id}`]
            return (
              <li key={r.id} className="group/row flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-2 w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <Textarea
                    data-row={r.id}
                    aria-label={`Guideline ${i + 1}`}
                    aria-invalid={!!err || undefined}
                    aria-describedby={err ? `g-${r.id}-err` : undefined}
                    value={r.text}
                    rows={1}
                    maxLength={GUIDELINE_MAX * 2}
                    placeholder={i === 0 ? 'e.g. Name the fabric first.' : undefined}
                    className="min-h-9 resize-none py-1.5"
                    name={`guidelines.${i}`}
                    autoComplete="off"
                    onChange={(e) => onChange(rows.map((x) => (x.id === r.id ? { ...x, text: e.target.value } : x)))}
                    onBlur={() => onTouch?.(`guidelines.${r.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && i === rows.length - 1 && !full) {
                        e.preventDefault()
                        add()
                      }
                    }}
                  />
                  <FieldError id={`g-${r.id}-err`} message={err} />
                  {!err && fieldLength(r.text) > GUIDELINE_MAX * 0.9 ? (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {fieldLength(r.text)} / {GUIDELINE_MAX}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="mt-0.5 text-muted-foreground"
                  aria-label={`Remove guideline ${i + 1}`}
                  onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
                >
                  <Icon name="x" size={16} />
                </Button>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
          No guidelines yet. Add the rules every listing should follow.
        </p>
      )}
      <FieldError message={errors.guidelines} />
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={add} disabled={full}>
          <Icon name="plus" size={16} data-icon="inline-start" />
          Add guideline
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {filled} of {GUIDELINES_MAX}
        </span>
      </div>
    </div>
  )
}

export function GlossaryEditor({
  rows,
  onChange,
  errors,
  onTouch,
}: {
  rows: GlossaryRow[]
  onChange: (next: GlossaryRow[]) => void
  errors: ProfileErrors
  onTouch?: (key: string) => void
}) {
  const filled = rows.filter((r) => r.avoid.trim() || r.use.trim()).length
  const full = rows.length >= GLOSSARY_MAX
  const add = () => {
    const row = emptyGlossaryRow()
    onChange([...rows, row])
    focusLater(`[data-row="${row.id}"]`)
  }
  const set = (id: string, patch: Partial<GlossaryRow>) =>
    onChange(rows.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  return (
    <div className="space-y-2">
      {rows.length ? (
        <div role="table" aria-label="Glossary" className="space-y-2">
          <div role="row" className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 sm:grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)_2rem]">
            <span role="columnheader" className="text-xs font-medium text-muted-foreground">
              Avoid
            </span>
            <span aria-hidden className="hidden sm:block" />
            <span role="columnheader" className="text-xs font-medium text-muted-foreground">
              Use instead
            </span>
            <span aria-hidden />
          </div>
          {rows.map((r, i) => {
            const avoidErr = errors[`glossary.${r.id}.avoid`]
            const useErr = errors[`glossary.${r.id}.use`]
            return (
              <div key={r.id} role="row" className="space-y-1">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)_2rem]">
                  <Input
                    role="cell"
                    data-row={r.id}
                    aria-label={`Term to avoid ${i + 1}`}
                    aria-invalid={!!avoidErr || undefined}
                    aria-describedby={avoidErr || useErr ? `t-${r.id}-err` : undefined}
                    name={`glossary.${i}.avoid`}
                    autoComplete="off"
                    value={r.avoid}
                    maxLength={TERM_MAX * 2}
                    placeholder={i === 0 ? 'kurta outfit' : undefined}
                    onChange={(e) => set(r.id, { avoid: e.target.value })}
                    onBlur={() => onTouch?.(`glossary.${r.id}.avoid`)}
                  />
                  <Icon name="arrow" size={16} className="hidden justify-self-center text-muted-foreground sm:block" />
                  <Input
                    role="cell"
                    aria-label={`Use instead ${i + 1}`}
                    aria-invalid={!!useErr || undefined}
                    aria-describedby={avoidErr || useErr ? `t-${r.id}-err` : undefined}
                    name={`glossary.${i}.use`}
                    autoComplete="off"
                    value={r.use}
                    maxLength={TERM_MAX * 2}
                    placeholder={i === 0 ? 'kurta set' : undefined}
                    onChange={(e) => set(r.id, { use: e.target.value })}
                    onBlur={() => onTouch?.(`glossary.${r.id}.use`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && i === rows.length - 1 && !full) {
                        e.preventDefault()
                        add()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    aria-label={`Remove glossary term ${i + 1}`}
                    onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
                  >
                    <Icon name="x" size={16} />
                  </Button>
                </div>
                <FieldError id={`t-${r.id}-err`} message={[avoidErr, useErr].filter(Boolean).join(' ') || undefined} />
              </div>
            )
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
          No glossary terms yet. Map words to avoid to the words the brand prefers.
        </p>
      )}
      <FieldError message={errors.glossary} />
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={add} disabled={full}>
          <Icon name="plus" size={16} data-icon="inline-start" />
          Add term
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {filled} of {GLOSSARY_MAX}
        </span>
      </div>
    </div>
  )
}
