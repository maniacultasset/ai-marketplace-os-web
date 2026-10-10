/**
 * Light / dark / system theme. The class is applied before first paint by the inline script in
 * index.html (same storage key), so there is no flash.
 */
import { Monitor, Moon, Sun } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'
const KEY = 'mkos.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function apply(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && media().matches)
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  return dark ? 'dark' : 'light'
}

interface ThemeCtx {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (t: string) => void
}
const Ctx = createContext<ThemeCtx | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme)
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => apply(readTheme()))

  useEffect(() => {
    const sync = () => setResolved(apply(theme))
    sync()
    const mq = media()
    mq.addEventListener('change', sync)
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setThemeState(readTheme())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      mq.removeEventListener('change', sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [theme])

  const setTheme = useCallback((t: string) => {
    const next: Theme = t === 'light' || t === 'dark' ? t : 'system'
    try {
      if (next === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch {
      /* ignore */
    }
    setThemeState(next)
  }, [])

  const value = useMemo(() => ({ theme, resolvedTheme: resolved, setTheme }), [theme, resolved, setTheme])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme outside ThemeProvider')
  return ctx
}

export const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const
