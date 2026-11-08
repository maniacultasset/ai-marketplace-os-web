import { useEffect } from 'react'

/** The landing page's title; index.html carries the same words for link previews and search. */
export const HOME_TITLE = 'Kuinn | AI listing agent for Indian fashion brands'

/** "<title> · Kuinn" for public pages (the app shell does this for signed-in routes); null is the landing page. */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · Kuinn` : HOME_TITLE
  }, [title])
}
