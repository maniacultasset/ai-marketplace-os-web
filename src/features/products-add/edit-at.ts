/**
 * `?edit=barcode` on the product page (the review screen's "Add barcode or exemption"): once the
 * page is ready, drop `?edit` from the address, open the editor and move focus to the barcode
 * choice once it renders. Without edit rights the page just opens on Overview.
 */
import { useEffect, useRef } from 'react'
import type { DetailTab, EditTarget } from './detail-tabs'

export function useEditAt({
  edit,
  ready,
  canEdit,
  editing,
  tab,
  start,
  clear,
}: {
  edit: EditTarget | undefined
  /** The variants are loaded, so a style opens with its exemption choice, not an item barcode. */
  ready: boolean
  canEdit: boolean
  editing: boolean
  tab: DetailTab
  start: () => void
  /** Back to plain Overview, which also drops `?edit=` from the address. */
  clear: () => void
}) {
  /** The link's target until the editor opens; then the field to focus once it renders. */
  const openAt = useRef<EditTarget | null>(edit ?? null)
  const focusAt = useRef<EditTarget | null>(null)
  useEffect(() => {
    if (!openAt.current || !ready) return
    openAt.current = null
    clear()
    if (!canEdit) return
    focusAt.current = 'barcode'
    if (!editing) start()
  }, [ready, canEdit]) // eslint-disable-line react-hooks/exhaustive-deps -- once per link
  useEffect(() => {
    if (!focusAt.current || !editing || tab !== 'overview') return
    const t = window.setTimeout(() => {
      const field = document.querySelector<HTMLElement>('[data-barcode-field]')
      if (!field) return
      focusAt.current = null
      // The digits when "Has a barcode" is chosen, else the chosen option of the choice.
      const target = field.querySelector<HTMLElement>('input:not([type="radio"])') ?? field.querySelector<HTMLElement>('input[type="radio"]:checked')
      field.scrollIntoView?.({ block: 'center' })
      target?.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(t)
  }, [editing, tab])
}
