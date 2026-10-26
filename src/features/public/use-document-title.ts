import { useEffect } from 'react'

/** "<title> · Kuinn" for public pages (the app shell does this for signed-in routes). */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · Kuinn` : 'Kuinn'
  }, [title])
}
