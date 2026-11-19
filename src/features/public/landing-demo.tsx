/**
 * Product demo (brief section 6): the How it works demo (one kurta set travelling import, draft,
 * check, fix, approve and publish, drawn with the app's own kit) framed as the app window it comes
 * from. The founder left the choice of screen to us; this one shows the dashboard flow end to end.
 * A recorded product video can replace the demo later: drop it in as DEMO_VIDEO (muted, looping,
 * with a poster) and the frame stays the same.
 */
import { Lock } from 'lucide-react'
import { IconGlyph } from '@/components/la/icons'
import { cn } from '@/lib/utils'
import { HowItWorksDemo } from './how-it-works-demo'
import { DEMO } from './landing-content'
import { SectionHeading, SECTION_Y, WRAP } from './landing-kit'

export function DemoSection() {
  return (
    <section id="how" aria-labelledby="how-h" className="relative overflow-x-clip">
      <div className={cn(WRAP, SECTION_Y)}>
        <SectionHeading id="how" eyebrow={DEMO.eyebrow} title={DEMO.title} lede={DEMO.body} align="center" />
        <div data-reveal className="relative mx-auto mt-14 max-w-[1120px]">
          {/* One soft brand glow under the window: the page's only glow on a light band. */}
          <div aria-hidden className="pointer-events-none absolute -inset-x-10 -top-10 bottom-10 -z-10 rounded-[48px] bg-[radial-gradient(60%_60%_at_50%_40%,rgb(47_70_214/0.14),transparent_70%)]" />
          <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-raised-lg">
            <div aria-hidden className="flex items-center gap-3 border-b border-line bg-sunken/80 px-4 py-3">
              <span className="flex gap-1.5">
                <span className="size-3 rounded-full bg-[#ff5f57]" />
                <span className="size-3 rounded-full bg-[#febc2e]" />
                <span className="size-3 rounded-full bg-[#28c840]" />
              </span>
              <span className="mx-auto flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1 text-caption text-ink-3">
                <IconGlyph icon={Lock} size={11} /> kuinn.in/products
              </span>
              <span className="w-[54px]" />
            </div>
            <div className="p-3 sm:p-5 md:p-6">
              <HowItWorksDemo />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
