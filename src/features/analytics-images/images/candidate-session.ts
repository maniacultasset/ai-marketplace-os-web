import { useState } from 'react'

/** State shared by every candidate block on the card (one product). */
export interface CandidateSession {
  /** Failed candidates the seller closed this visit. */
  hidden: ReadonlySet<string>
  hide: (id: string) => void
  /** Candidates a create answered from the cache (no new cost). */
  cacheHits: ReadonlySet<string>
  markCacheHit: (id: string) => void
  /** The API refused an AI create because image editing is switched off. */
  aiOff: boolean
  setAiOff: () => void
}

export function useCandidateSession(): CandidateSession {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [cacheHits, setCacheHits] = useState<ReadonlySet<string>>(new Set())
  const [aiOff, setAiOff] = useState(false)
  return {
    hidden,
    hide: (id) => setHidden((s) => new Set(s).add(id)),
    cacheHits,
    markCacheHit: (id) => setCacheHits((s) => new Set(s).add(id)),
    aiOff,
    setAiOff: () => setAiOff(true),
  }
}
