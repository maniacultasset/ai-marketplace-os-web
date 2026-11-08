/**
 * "On this page" for the legal pages. A sticky list beside the text from lg; below lg it starts
 * closed, so the policy itself is the first thing on a phone, and opens on a 44px tap.
 */
import { useState, useSyncExternalStore } from 'react'

const WIDE = '(min-width: 1024px)'

function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const m = window.matchMedia(WIDE)
      m.addEventListener?.('change', cb)
      return () => m.removeEventListener?.('change', cb)
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches,
    () => true,
  )
}

export function LegalContents({ sections, number }: { sections: readonly { id: string; title: string }[]; number: (id: string, i: number) => string | null }) {
  const wide = useWide()
  // Open on wide screens, closed below lg; a person's own toggle holds until the width class changes.
  const [toggled, setToggled] = useState<{ wide: boolean; open: boolean } | null>(null)
  const open = toggled && toggled.wide === wide ? toggled.open : wide
  return (
    <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
      <details
        open={open}
        onToggle={(e) => {
          const next = e.currentTarget.open
          if (next !== open) setToggled({ wide, open: next })
        }}
        className="group rounded-card border border-line bg-surface px-4 py-1 shadow-raised-sm lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
      >
        <summary className="flex min-h-11 cursor-pointer items-center text-small font-bold text-ink lg:pointer-events-none lg:min-h-0 lg:list-none">
          On this page
        </summary>
        <ol className="mt-1 mb-3 flex flex-col text-small lg:mt-3 lg:mb-0 lg:gap-1">
          {sections.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="tactile flex min-h-11 items-center gap-2 rounded-control px-2 py-1.5 text-ink-2 hover:bg-hover hover:text-ink active:bg-pressed lg:min-h-0 lg:items-start"
              >
                <span className="w-6 shrink-0 text-ink-3 tabular-nums">{number(s.id, i)}</span>
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  )
}
