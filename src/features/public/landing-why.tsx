/**
 * Why Kuinn (brief section 5): the page's first night band. The heading's second sentence carries
 * the accent ("We get them live."), then a comparison of Kuinn, manual work and other listing tools.
 * The difference the founder wants seen is the end of the line: publishing, diagnosing errors,
 * fixing and resubmitting, with a person approving. Kuinn's column is lit; the others stay quiet.
 * Below md each row becomes a small card with the three marks labelled.
 */
import { Check, Minus } from 'lucide-react'
import { IconGlyph } from '@/components/la/icons'
import { cn } from '@/lib/utils'
import { WHY, WHY_ROWS, type Support } from './landing-content'
import { Accent, SectionHeading, SECTION_Y, WRAP } from './landing-kit'

const SUPPORT_LABEL: Record<Support, string> = { yes: 'Yes', partial: 'Partly', no: 'No' }

function Mark({ value, lead }: { value: Support; lead?: boolean }) {
  return (
    <span className="inline-flex items-center justify-center" title={SUPPORT_LABEL[value]}>
      <span className="sr-only">{SUPPORT_LABEL[value]}</span>
      {value === 'yes' ? (
        <span className={cn('grid size-7 place-items-center rounded-full', lead ? 'bg-brand text-white shadow-[0_0_0_4px_rgb(47_70_214/0.25)]' : 'bg-white/10 text-night-ink')}>
          <IconGlyph icon={Check} size={15} />
        </span>
      ) : value === 'partial' ? (
        <span aria-hidden className="grid size-7 place-items-center rounded-full border border-white/20">
          <span className="size-3 rounded-full bg-[linear-gradient(90deg,var(--night-ink-2)_50%,transparent_50%)] ring-1 ring-night-ink-2" />
        </span>
      ) : (
        <span aria-hidden className="grid size-7 place-items-center rounded-full border border-white/10 text-white/30">
          <IconGlyph icon={Minus} size={14} />
        </span>
      )}
    </span>
  )
}

export function WhySection() {
  return (
    <section id="why" aria-labelledby="why-h" className="night-band overflow-hidden">
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 -z-10" />
      <div className={cn(WRAP, SECTION_Y)}>
        <SectionHeading
          id="why"
          night
          align="center"
          eyebrow={WHY.eyebrow}
          title={
            <>
              {WHY.titleLead}{' '}
              <Accent night>{WHY.titleAccent}</Accent>
            </>
          }
          lede={WHY.body}
          titleClassName="max-w-[18ch]"
        />

        {/* md and up: a table */}
        <div data-reveal className="relative mx-auto mt-14 max-w-[1040px] max-md:hidden">
          {/* Kuinn's lit column, behind the rows */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[46%] w-[18%] rounded-card border border-brand/50 bg-brand/10 shadow-[0_0_60px_-10px_rgb(47_70_214/0.45)]" />
          <table className="relative w-full border-separate border-spacing-0 text-left">
            <caption className="sr-only">Kuinn compared with manual work and other listing tools</caption>
            <thead>
              <tr>
                <th scope="col" className="w-[46%] px-6 pt-5 pb-4 text-small font-semibold text-night-ink-2">
                  Capability
                </th>
                {WHY.columns.map((c, i) => (
                  <th key={c} scope="col" className="w-[18%] px-3 pt-5 pb-4 text-center text-small font-semibold">
                    {i === 0 ? (
                      <span className="inline-flex rounded-pill bg-brand px-3 py-1 text-white shadow-raised-brand">{c}</span>
                    ) : (
                      <span className="text-night-ink-2">{c}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WHY_ROWS.map((r) => (
                <tr key={r.capability} className="group">
                  <th scope="row" className="border-t border-night-line px-6 py-4.5 text-[15px] font-medium text-night-ink group-hover:text-white">
                    {r.capability}
                  </th>
                  {r.cells.map((v, i) => (
                    <td key={i} className="border-t border-night-line px-3 py-4.5 text-center">
                      <Mark value={v} lead={i === 0} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phones: one card per row */}
        <ul data-reveal className="mt-12 flex flex-col gap-3 md:hidden">
          {WHY_ROWS.map((r) => (
            <li key={r.capability} className="rounded-card border border-night-line bg-white/[0.03] p-4">
              <p className="text-[15px] font-semibold text-night-ink">{r.capability}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {r.cells.map((v, i) => (
                  <div key={i} className={cn('flex flex-col items-center gap-1.5 rounded-lg py-2', i === 0 && 'bg-brand/15')}>
                    <Mark value={v} lead={i === 0} />
                    <span className={cn('text-center text-[11px] leading-3.5', i === 0 ? 'font-semibold text-night-ink' : 'text-night-ink-2')}>
                      {i === 0 ? 'Kuinn' : i === 1 ? 'Manual' : 'Other tools'}
                    </span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
