/**
 * Product capabilities (brief section 8, "if you feel like"; the voice note asks for AI facts and
 * numbers here). A number band counted from the product itself (landing-content.ts says where each
 * comes from), then a bento: one lead tile for the part no other tool does (fix and resubmit, shown
 * as a before and after), and five supporting tiles for the live features.
 */
import { FileSpreadsheet, History, ImageIcon, PenLine, ScanSearch, ShieldCheck, Wand2 } from 'lucide-react'
import { useRef } from 'react'
import { CountUp } from '@/components/la/count-up'
import { IconGlyph } from '@/components/la/icons'
import { useRevealed } from '@/lib/use-reveal'
import { cn } from '@/lib/utils'
import { CAPABILITIES } from './landing-content'
import { SectionHeading, SECTION_Y, useSpotlight, WRAP } from './landing-kit'

const TILES = [
  { icon: ScanSearch, title: 'Read from your photos', body: 'Colour, fabric, fit, pattern and neckline are suggested from your images. You confirm each one.' },
  { icon: PenLine, title: 'Written in your voice', body: 'Titles, bullets and descriptions follow your tone, your glossary and the words your brand avoids.' },
  { icon: ShieldCheck, title: 'Checked before you approve', body: 'Limits, required fields and banned words are checked for each marketplace as code, not by the model.' },
  { icon: ImageIcon, title: 'A clean white main image', body: 'Your main photo becomes the white-background image marketplaces ask for. You approve it first.' },
  { icon: FileSpreadsheet, title: 'Your whole catalog from one CSV', body: 'Your columns become products and variants, with a report for every row. Rerun only what failed.' },
  { icon: History, title: 'A full history', body: 'Every draft, fix, approval and submission is kept, with who did it and when.' },
] as const

export function CapabilitiesSection() {
  const band = useRef<HTMLDListElement>(null)
  const counted = useRevealed(band)
  const spot = useSpotlight()
  return (
    <section id="capabilities" aria-labelledby="capabilities-h" className="bg-surface">
      <div className={cn(WRAP, SECTION_Y)}>
        <SectionHeading id="capabilities" eyebrow={CAPABILITIES.eyebrow} title={CAPABILITIES.title} lede={CAPABILITIES.body} />

        <dl ref={band} data-reveal className="mt-12 grid grid-cols-2 overflow-hidden rounded-stage border border-line bg-line shadow-card lg:grid-cols-4" style={{ gap: 1 }}>
          {CAPABILITIES.numbers.map((n) => (
            <div key={n.label} className="flex flex-col bg-surface p-5 md:p-7">
              <dt className="order-2 mt-2 text-[15px] font-bold text-ink">{n.label}</dt>
              <dd className="order-1 font-display text-[clamp(2.5rem,2.5vw+1.5rem,4rem)] leading-none font-bold tracking-[-0.04em] text-ink tabular-nums">
                <CountUp value={n.value} start={counted} duration={1200} />
              </dd>
              <dd className="order-3 mt-1 text-small text-ink-3">{n.detail}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {/* Lead tile: fix and resubmit, the step other tools leave to you. */}
          <article
            data-reveal
            onPointerMove={spot}
            className="spotlight edge-gradient flex flex-col rounded-stage bg-surface p-6 shadow-raised-md md:p-8 lg:row-span-3"
          >
            <span className="grid size-11 place-items-center rounded-tile bg-brand text-white shadow-raised-brand">
              <IconGlyph icon={Wand2} size={20} />
            </span>
            <h3 className="mt-6 font-display text-[26px] leading-8 font-bold tracking-[-0.02em] text-ink">Diagnosed, fixed and resubmitted</h3>
            <p className="mt-3 text-[15px] leading-[1.6] text-ink-2">
              When a marketplace rejects a listing, Kuinn reads the error, fixes what it safely can and sends it again. After three failed fixes it stops and
              shows you why.
            </p>
            <div className="mt-6 flex flex-col gap-2 rounded-card border border-line bg-sunken/70 p-4 font-mono text-[12.5px] leading-5">
              <p className="text-danger">
                <span className="mr-2 rounded bg-danger-bg px-1.5 py-0.5 font-semibold">REJECTED</span>Title contains the banned term “best”.
              </p>
              <p className="text-ink-3 line-through decoration-danger/60">Best Women’s Floral Print Cotton Kurta Set…</p>
              <p className="text-success-ink">Women’s Floral Print Cotton Kurta Set…</p>
              <p className="text-success">
                <span className="mr-2 rounded bg-success-bg px-1.5 py-0.5 font-semibold">RESUBMITTED</span>Fixed for you · attempt 1 of 3
              </p>
            </div>
            {/* The loop other tools leave to you, as one timeline. */}
            <ol className="mt-auto flex flex-col pt-7">
              {[
                { t: 'Rejected by the marketplace', d: 'The error code and field are read', tone: 'danger' },
                { t: 'Diagnosed', d: 'Matched to the rule that failed', tone: 'brand' },
                { t: 'Fixed and checked again', d: 'Only supported fixes, every rule rerun', tone: 'brand' },
                { t: 'Resubmitted', d: 'Sent back without anyone retyping it', tone: 'brand' },
                { t: 'Live', d: 'Your team sees every change it made', tone: 'success' },
              ].map((s, i, all) => (
                <li key={s.t} className="relative flex gap-3.5 pb-4 last:pb-0">
                  {i < all.length - 1 ? <span aria-hidden className="absolute top-6 bottom-0 left-[9px] w-px bg-line-strong" /> : null}
                  <span
                    aria-hidden
                    className={cn(
                      'relative mt-1 size-[19px] shrink-0 rounded-full border-[5px]',
                      s.tone === 'danger' ? 'border-danger-bg bg-danger' : s.tone === 'success' ? 'border-success-bg bg-success' : 'border-brand-bg bg-brand',
                    )}
                  />
                  <span className="text-small">
                    <span className="block font-semibold text-ink">{s.t}</span>
                    <span className="text-ink-3">{s.d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </article>
          {TILES.map((t) => (
            <article key={t.title} data-reveal onPointerMove={spot} className="spotlight flex flex-col rounded-stage border border-line bg-surface p-6 shadow-card">
              <span className="grid size-10 place-items-center rounded-tile border border-brand-line/70 bg-brand-bg text-brand">
                <IconGlyph icon={t.icon} size={18} />
              </span>
              <h3 className="mt-5 text-[17px] leading-6 font-bold text-ink">{t.title}</h3>
              <p className="mt-2 text-[14.5px] leading-[1.6] text-ink-2">{t.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
