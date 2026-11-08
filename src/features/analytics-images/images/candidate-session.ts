import { useState } from 'react'
import type { Schema } from '@/api/types'

/** State shared by every candidate block on the card (one product). */
export interface CandidateSession {
  /** Failed candidates the seller closed this visit. */
  hidden: ReadonlySet<string>
  hide: (id: string) => void
  /** Show a closed failure again (the cache answered it for a new click). */
  unhide: (id: string) => void
  /** Candidates a create answered from the cache (no new cost). */
  cacheHits: ReadonlySet<string>
  markCacheHit: (id: string) => void
  /** The API refused an AI create because image editing is switched off. */
  aiOff: boolean
  setAiOff: () => void
  /** Images made by a use this visit, with their check job: image id to job id. */
  accepted: ReadonlyMap<string, string>
  markAccepted: (a: Schema<'ImageAccepted'>) => void
}

export function useCandidateSession(): CandidateSession {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [cacheHits, setCacheHits] = useState<ReadonlySet<string>>(new Set())
  const [aiOff, setAiOff] = useState(false)
  const [accepted, setAccepted] = useState<ReadonlyMap<string, string>>(new Map())
  return {
    hidden,
    hide: (id) => setHidden((s) => new Set(s).add(id)),
    unhide: (id) =>
      setHidden((s) => {
        if (!s.has(id)) return s
        const next = new Set(s)
        next.delete(id)
        return next
      }),
    cacheHits,
    markCacheHit: (id) => setCacheHits((s) => new Set(s).add(id)),
    aiOff,
    setAiOff: () => setAiOff(true),
    accepted,
    markAccepted: (a) => setAccepted((m) => new Map(m).set(a.image_id, a.job_id)),
  }
}
