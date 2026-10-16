/**
 * The last job started for a listing in this tab (sessionStorage), so returning to the listing
 * still shows its generation or publish progress. A convenience only: the listing's own status
 * (generating / publishing) is the source of truth, and storage may be unavailable.
 */
const KEY = 'mkos.listing-jobs'
const MAX = 50

type Memory = Record<string, { jobId: string; at: number }>

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function read(s: Storage): Memory {
  try {
    const raw = s.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Memory) : {}
  } catch {
    return {}
  }
}

function write(s: Storage, m: Memory) {
  try {
    s.setItem(KEY, JSON.stringify(m))
  } catch {
    /* quota or blocked storage: progress still shows from the listing status */
  }
}

export function rememberJob(listingId: string, jobId: string, s: Storage | null = storage()) {
  if (!s) return
  const m = read(s)
  m[listingId] = { jobId, at: Date.now() }
  const entries = Object.entries(m).sort((a, b) => b[1].at - a[1].at).slice(0, MAX)
  write(s, Object.fromEntries(entries))
}

export function recallJob(listingId: string, s: Storage | null = storage()): string | null {
  if (!s) return null
  const v = read(s)[listingId]
  return v && typeof v.jobId === 'string' ? v.jobId : null
}

export function forgetJob(listingId: string, s: Storage | null = storage()) {
  if (!s) return
  const m = read(s)
  if (!(listingId in m)) return
  delete m[listingId]
  write(s, m)
}
