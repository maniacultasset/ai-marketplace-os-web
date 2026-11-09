/**
 * Setup frame (hi-fi 02-04 "solo"): white header with the Kuinn mark and "Save and exit",
 * body padding 28/64 on canvas, all inside one 1240px container (SETUP_CONTAINER). Screens add their own Stepper and FooterBar.
 *
 * A screen with unsaved work registers what "Save and exit" must do first with `useSoloExit`
 * (./solo-exit).
 *
 * From 768px the frame is fixed to the viewport like the app shell: the header never moves and
 * only <main> scrolls (see split-layout.tsx). Below 768px the document scrolls as usual.
 */
import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Wordmark } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SoloExitContext, type ExitHandler } from './solo-exit'

/** One content box for the setup header, body and footer: 1240 wide, 16/64 gutters. */
export const SETUP_CONTAINER = 'mx-auto w-full max-w-[1240px] px-4 md:px-16'

export function SoloShell({ title }: { title?: string }) {
  const exitRef = useRef<ExitHandler | null>(null)
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    document.title = title ? `${title} · Kuinn` : 'Kuinn'
  }, [title])

  const saveAndExit = async () => {
    if (leaving) return
    setLeaving(true)
    try {
      const ok = exitRef.current ? await exitRef.current() : true
      if (ok) await navigate({ to: '/home' })
    } finally {
      setLeaving(false)
    }
  }

  return (
    <SoloExitContext.Provider value={exitRef}>
      <div className="flex min-h-svh flex-col bg-canvas md:h-svh md:min-h-0 md:overflow-hidden">
        <header className="shrink-0 border-b border-line bg-surface">
          {/* SETUP_CONTAINER: the logo and "Save and exit" share the body's left and right edges. */}
          <div className={cn(SETUP_CONTAINER, 'flex items-center justify-between gap-4 py-[18px]')}>
            <Link to="/home" aria-label="Kuinn home" className="rounded-control">
              <Wordmark size="lg" />
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void saveAndExit()}
              disabled={leaving}
              aria-busy={leaving || undefined}
              data-testid="save-and-exit"
            >
              {leaving ? 'Saving…' : 'Save and exit'}
            </Button>
          </div>
        </header>
        <main id="main" className="flex min-w-0 flex-1 flex-col md:min-h-0 md:overflow-y-auto md:[scrollbar-gutter:stable] md:scroll-pt-4">
          <Outlet />
        </main>
      </div>
    </SoloExitContext.Provider>
  )
}
