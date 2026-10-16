import { useEffect } from 'react'

/** "<title> · Listing Agent" for public pages (the app shell does this for signed-in routes). */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · Listing Agent` : 'Listing Agent'
  }, [title])
}
