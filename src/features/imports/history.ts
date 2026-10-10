/**
 * Local upload history. The backend has no "list imports" endpoint, so
 * this browser remembers its own uploads per tenant + user under
 * `mkos.imports.<tenantId>.<userId>` (max 50, newest first). Every read/write is guarded:
 * private windows or blocked storage just yield an empty history.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useSession } from '@/lib/auth'

export interface ImportHistoryEntry {
  import_id: string
  job_id: string
  filename: string
  size: number
  created_at: string
}

const MAX_ENTRIES = 50
const listeners = new Set<() => void>()
const cache = new Map<string, { raw: string | null; entries: ImportHistoryEntry[] }>()
const EMPTY: ImportHistoryEntry[] = []

export const historyKey = (tenantId: string, userId: string) => `mkos.imports.${tenantId}.${userId}`

function isEntry(v: unknown): v is ImportHistoryEntry {
  if (!v || typeof v !== 'object') return false
  const e = v as Record<string, unknown>
  return (
    typeof e.import_id === 'string' &&
    typeof e.job_id === 'string' &&
    typeof e.filename === 'string' &&
    typeof e.size === 'number' &&
    typeof e.created_at === 'string'
  )
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function read(key: string): ImportHistoryEntry[] {
  const raw = readRaw(key)
  const hit = cache.get(key)
  if (hit && hit.raw === raw) return hit.entries
  let entries: ImportHistoryEntry[] = EMPTY
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      entries = Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX_ENTRIES) : EMPTY
    } catch {
      entries = EMPTY
    }
  }
  cache.set(key, { raw, entries })
  return entries
}

function write(key: string, entries: ImportHistoryEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch {
    // Storage unavailable: history is a convenience only.
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith('mkos.imports.')) l()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}

/** History for the signed-in tenant + user, plus mutators. */
export function useImportHistory() {
  const { tenantId, userId } = useSession()
  const key = tenantId && userId ? historyKey(tenantId, userId) : null
  const entries = useSyncExternalStore(
    subscribe,
    () => (key ? read(key) : EMPTY),
    () => EMPTY,
  )

  const add = useCallback(
    (entry: ImportHistoryEntry) => {
      if (!key) return
      write(key, [entry, ...read(key).filter((e) => e.import_id !== entry.import_id)])
    },
    [key],
  )

  const setJob = useCallback(
    (importId: string, jobId: string) => {
      if (!key) return
      const current = read(key)
      if (!current.some((e) => e.import_id === importId && e.job_id !== jobId)) return
      write(
        key,
        current.map((e) => (e.import_id === importId ? { ...e, job_id: jobId } : e)),
      )
    },
    [key],
  )

  const remove = useCallback(
    (importId: string) => {
      if (!key) return
      const current = read(key)
      if (!current.some((e) => e.import_id === importId)) return
      write(
        key,
        current.filter((e) => e.import_id !== importId),
      )
    },
    [key],
  )

  return useMemo(() => ({ entries, add, setJob, remove }), [entries, add, setJob, remove])
}
