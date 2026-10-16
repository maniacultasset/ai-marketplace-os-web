/**
 * "Save and exit" in the setup frame (SoloShell). A screen with unsaved work registers what must
 * happen first; resolve false to stay on the page (e.g. a validation error):
 *
 *   useSoloExit(() => save())
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react'

export type ExitHandler = () => Promise<boolean> | boolean
export const SoloExitContext = createContext<MutableRefObject<ExitHandler | null> | null>(null)

export function useSoloExit(handler: ExitHandler) {
  const ref = useContext(SoloExitContext)
  const latest = useRef(handler)
  useLayoutEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    if (!ref) return
    const run: ExitHandler = () => latest.current()
    ref.current = run
    return () => {
      if (ref.current === run) ref.current = null
    }
  }, [ref])
}
