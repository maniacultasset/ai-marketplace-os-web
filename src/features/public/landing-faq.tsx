/**
 * FAQ (brief section 10): the brief's ten questions, plus the pricing answer Amazon's developer
 * website rules ask every listed app to give. Two columns from lg: the heading and a contact card on
 * the left (sticky), the answers on the right. Each answer opens with a height transition (grid rows
 * 0fr to 1fr, no measuring) and the plus turns into a cross. The first answer starts open.
 */
import { Mail, Phone, Plus } from 'lucide-react'
import { useId, useState } from 'react'
import { IconGlyph } from '@/components/la/icons'
import { cn } from '@/lib/utils'
import { COMPANY } from './company'
import { FAQ } from './landing-content'
import { SectionHeading, SECTION_Y, WRAP } from './landing-kit'

function Item({ q, a, defaultOpen }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const id = useId()
  return (
    <li className="border-b border-line">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-a`}
          id={`${id}-q`}
          onClick={() => setOpen((o) => !o)}
          className="group flex w-full items-center gap-4 py-5 text-left text-[16px] leading-6 font-semibold text-ink md:py-6 md:text-[17px]"
        >
          <span className="flex-1 group-hover:text-brand">{q}</span>
          <span
            aria-hidden
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-full border transition-[transform,background-color,border-color] duration-300 ease-[var(--ease-out-calm)]',
              open ? 'rotate-45 border-brand bg-brand text-white' : 'border-line bg-surface text-ink-2',
            )}
          >
            <IconGlyph icon={Plus} size={16} />
          </span>
        </button>
      </h3>
      <div
        id={`${id}-a`}
        role="region"
        aria-labelledby={`${id}-q`}
        className={cn('grid transition-[grid-template-rows] duration-300 ease-[var(--ease-out-calm)] motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
      >
        <div className="overflow-hidden" inert={!open || undefined}>
          <p className="max-w-[64ch] pr-12 pb-6 text-[15px] leading-[1.65] text-ink-2">{a}</p>
        </div>
      </div>
    </li>
  )
}

export function FaqSection() {
  return (
    <section id="faq" aria-labelledby="faq-h" className="bg-surface">
      <div className={cn(WRAP, SECTION_Y, 'grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20')}>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <SectionHeading id="faq" eyebrow={FAQ.eyebrow} title={FAQ.title} lede={FAQ.aside} />
          <div id="contact" data-reveal className="mt-8 flex flex-col gap-3 rounded-stage border border-line bg-canvas p-5">
            <p className="text-small font-semibold text-ink-3">Talk to us</p>
            <a href={`mailto:${COMPANY.email}`} className="hit-area flex items-center gap-3 font-semibold break-all text-ink hover:text-brand">
              <IconGlyph icon={Mail} size={18} className="text-brand" />
              {COMPANY.email}
            </a>
            <a href={COMPANY.phoneHref} className="hit-area flex items-center gap-3 font-semibold text-ink hover:text-brand">
              <IconGlyph icon={Phone} size={18} className="text-brand" />
              {COMPANY.phone}
            </a>
          </div>
        </div>
        <ul data-reveal className="border-t border-line">
          {FAQ.items.map((it, i) => (
            <Item key={it.q} q={it.q} a={it.a} defaultOpen={i === 0} />
          ))}
        </ul>
      </div>
    </section>
  )
}
