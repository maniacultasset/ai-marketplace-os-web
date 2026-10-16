/**
 * Setup frame (hi-fi 02-04 "solo"): white header with the Listing Agent mark and "Save and exit",
 * body padding 28/64 on canvas. Screens add their own Stepper and FooterBar.
 *
 * A screen with unsaved work registers what "Save and exit" must do first with `useSoloExit`
 * (./solo-exit).
 */
import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Wordmark } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { SoloExitContext, type ExitHandler } from './solo-exit'

export function SoloShell({ title }: { title?: string }) {
  const exitRef = useRef<ExitHandler | null>(null)
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    document.title = title ? `${title} · Listing Agent` : 'Listing Agent'
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
      <div className="flex min-h-svh flex-col bg-canvas">
        <header className="flex items-center justify-between gap-4 border-b border-line bg-surface px-4 py-[18px] md:px-10">
          <Link to="/home" aria-label="Listing Agent home">
            <Wordmark size="lg" />
          </Link>
          <Button variant="ghost" size="sm" onClick={() => void saveAndExit()} disabled={leaving} data-testid="save-and-exit">
            {leaving ? 'Saving…' : 'Save and exit'}
          </Button>
        </header>
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </SoloExitContext.Provider>
  )
}
