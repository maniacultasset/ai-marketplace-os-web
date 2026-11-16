/**
 * SI14 column review for the bulk upload: each sheet header, the field it fills, how it was matched
 * (exact name, known name, close match or Kuinn) and the confidence. A match below 80% waits for the
 * seller to confirm it or pick another field; nothing is imported until every one is answered.
 *
 * `headers` are the sheet's own header cells, read in this browser: each column is shown by the
 * seller's text ("Weight (g)"), and the API's `header_shown` (which names an unusual header by its
 * position) is the fallback when the file is not at hand. `readOnly` is the check step after the
 * upload: what the import used, with nothing left to answer.
 */
import { Fragment } from 'react'
import { Icon } from '@/components/la'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { useSheetPhotos } from '@/features/imports/sheet-photos'
import { duplicatePositions, fieldChoices, headerText, METHOD_LABEL, needsAnswer, resolvedKey, usedColumns, type Answers, type ColumnMap, type ColumnMapEntry } from './column-map'

const SKIP = '__skip'

const pct = (c: number) => `${Math.round(Math.min(1, Math.max(0, c)) * 100)}%`

function UsedField({ entry, answers }: { entry: ColumnMapEntry; answers: Answers }) {
  const key = resolvedKey(entry, answers)
  return key ? <code className="font-mono text-small text-ink">{key}</code> : <span className="text-small text-ink-3">Not imported</span>
}

function FieldSelect({ entry, label, answers, onAnswer, invalid }: { entry: ColumnMapEntry; label: string; answers: Answers; onAnswer: (key: string | null) => void; invalid: boolean }) {
  const answered = entry.position in answers
  const waiting = needsAnswer(entry) && !answered
  const current = waiting ? '' : (resolvedKey(entry, answers) ?? SKIP)
  const sheetPhotos = useSheetPhotos()
  const choices = [...fieldChoices({ sheetPhotos })]
  for (const k of [entry.key, answers[entry.position]]) if (k && !choices.includes(k)) choices.push(k)
  return (
    <Select value={current} onValueChange={(v) => onAnswer(v === SKIP ? null : v)}>
      <SelectTrigger
        className={cn('h-9 w-full min-w-0 font-mono text-small', waiting && 'border-attention-line')}
        aria-label={`Field for column ${label}`}
        aria-invalid={invalid || undefined}
        data-testid={`map-field-${entry.position}`}
      >
        <SelectValue placeholder={waiting ? 'Confirm or choose' : 'Choose a field'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SKIP}>Don’t import this column</SelectItem>
        {choices.map((k) => (
          <SelectItem key={k} value={k} className="font-mono">
            {k}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Suggestion({ entry, onUse }: { entry: ColumnMapEntry; onUse: () => void }) {
  if (!entry.key) return <span className="text-caption text-ink-3">No field matched. Choose one, or leave it out.</span>
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-2">
      <span>
        Suggested <code className="font-mono text-ink">{entry.key}</code>
      </span>
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onUse} data-testid={`map-use-${entry.position}`}>
        Use it
      </Button>
    </span>
  )
}

function Confidence({ entry }: { entry: ColumnMapEntry }) {
  if (entry.method === 'none') return <span className="text-ink-3">None</span>
  const low = entry.confidence < 0.8
  return (
    <span className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-right tabular-nums">{pct(entry.confidence)}</span>
      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-subtle shadow-inset-sm lg:block" aria-hidden>
        <span className={cn('block h-full rounded-full', low ? 'bg-attention' : 'bg-brand')} style={{ width: pct(entry.confidence) }} />
      </span>
    </span>
  )
}

export function ColumnMapReview({
  map,
  answers,
  onAnswer,
  headers,
  readOnly,
}: {
  map: ColumnMap
  answers: Answers
  onAnswer?: (position: number, key: string | null) => void
  headers?: readonly string[]
  readOnly?: boolean
}) {
  const dupes = readOnly ? new Set<number>() : duplicatePositions(map, answers)
  const isWaiting = (e: ColumnMapEntry) => !readOnly && needsAnswer(e) && !(e.position in answers)
  const left = map.mappings.filter(isWaiting).length
  const answer = (position: number) => (key: string | null) => onAnswer?.(position, key)
  if (map.status === 'mapping')
    return (
      <p className="flex items-center gap-2 border-t border-line px-4 py-6 text-small text-ink-2" role="status" data-testid="column-map-mapping">
        <Spinner className="size-4" aria-hidden />
        Kuinn is matching the columns it didn’t recognise.
      </p>
    )
  return (
    <div data-testid="column-map-review" data-status={map.status}>
      <p className="border-t border-line px-4 py-2.5 text-small text-ink-2" role="status" data-testid="column-map-summary">
        {readOnly
          ? `The import read ${usedColumns(map, answers)} of ${map.mappings.length} columns as below.`
          : left
            ? `${left} ${left === 1 ? 'column needs' : 'columns need'} your check before the rows are read.`
            : map.status === 'confirmed'
              ? 'Columns confirmed.'
              : 'Every column is matched. Change any that look wrong.'}
        {map.status === 'failed' && !readOnly ? ' Kuinn could not match the rest, so match them by hand.' : ''}
      </p>
      {/* Phones: one card per column. */}
      <ul className="divide-y divide-line border-t border-line md:hidden" aria-label="Column matching">
        {map.mappings.map((e) => (
          <li key={e.position} className={cn('flex flex-col gap-2 px-4 py-3', isWaiting(e) && 'bg-attention-bg/40')} data-testid="column-map-row">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-semibold text-ink" title={headerText(e, headers)}>
                {headerText(e, headers)}
              </span>
              <span className="shrink-0 text-caption text-ink-2">
                {METHOD_LABEL[e.method]}
                {e.method !== 'none' ? ` · ${pct(e.confidence)}` : ''}
              </span>
            </div>
            {readOnly ? (
              <UsedField entry={e} answers={answers} />
            ) : (
              <FieldSelect entry={e} label={headerText(e, headers)} answers={answers} onAnswer={answer(e.position)} invalid={dupes.has(e.position)} />
            )}
            {isWaiting(e) ? <Suggestion entry={e} onUse={() => answer(e.position)(e.key ?? null)} /> : null}
          </li>
        ))}
      </ul>
      {/* Tablet and up: a table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-small" aria-label="Column matching">
          <thead>
            <tr className="h-[38px] bg-sunken text-left text-caption font-bold text-ink-2">
              <th className="px-4">Your column</th>
              <th className="w-5" aria-hidden />
              <th className="px-2">Our field</th>
              <th className="px-3">Matched by</th>
              <th className="px-4">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {map.mappings.map((e) => {
              const waiting = isWaiting(e)
              return (
                <Fragment key={e.position}>
                  <tr className={cn('border-t border-line', waiting && 'bg-attention-bg/40')} data-testid="column-map-row" data-position={e.position} data-review={waiting || undefined}>
                    <td className="max-w-44 truncate px-4 py-2 text-ink" title={headerText(e, headers)}>
                      {headerText(e, headers)}
                    </td>
                    <td aria-hidden className="text-ink-3">
                      <Icon name="arrow" size={14} />
                    </td>
                    <td className="w-[38%] px-2 py-2">
                      {readOnly ? (
                        <UsedField entry={e} answers={answers} />
                      ) : (
                        <FieldSelect entry={e} label={headerText(e, headers)} answers={answers} onAnswer={answer(e.position)} invalid={dupes.has(e.position)} />
                      )}
                      {waiting ? (
                        <div className="mt-1">
                          <Suggestion entry={e} onUse={() => answer(e.position)(e.key ?? null)} />
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink-2" data-testid="column-map-method">
                      {METHOD_LABEL[e.method]}
                    </td>
                    <td className="px-4 py-2 text-ink">
                      <Confidence entry={e} />
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {dupes.size ? (
        <p className="border-t border-line px-4 py-3 text-small font-semibold text-danger" role="alert">
          Two columns fill the same field. Choose a different field for one of them.
        </p>
      ) : null}
    </div>
  )
}
