/** Box and footer classes shared by Dialog and AlertDialog. */

/**
 * One padding for the box and its footer (`--dialog-pad`, change it rather than the padding
 * class), so the footer always bleeds exactly to the inner edge of the 1px border, with the inner
 * radius (14 − 1). A box with a footer drops its bottom padding (a scroll box adds its end padding
 * after the content, so a negative bottom margin cannot cancel it). The box never grows past the screen: a long body scrolls inside it, and the
 * footer stays pinned at the bottom (sticky, opaque) while it does. The single grid column is
 * `minmax(0, 1fr)` so a long unbreakable value (a URL, an id) truncates instead of widening the
 * column past the box (which pushed the footer out over the right edge).
 */
export const DIALOG_BOX =
  "[--dialog-pad:--spacing(4)] grid grid-cols-[minmax(0,1fr)] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-[14px] border p-(--dialog-pad) has-[[data-slot=dialog-footer]]:pb-0 has-[[data-slot=alert-dialog-footer]]:pb-0"
export const DIALOG_FOOTER =
  "sticky bottom-0 z-10 mx-[calc(var(--dialog-pad)*-1)] rounded-b-[13px] border-t border-line bg-[color-mix(in_srgb,var(--muted)_50%,var(--popover))] p-(--dialog-pad)"
