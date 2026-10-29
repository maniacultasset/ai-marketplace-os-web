import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AlertDialog, AlertDialogContent, AlertDialogFooter, AlertDialogTitle } from './alert-dialog'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './dialog'

/** The classes that keep a footer flush inside the box's border (see dialog-layout.ts). */
function expectFlushFooter(box: HTMLElement, footer: HTMLElement) {
  // One padding variable drives the box and the footer's bleed, so they cannot drift apart.
  expect(box.className).toContain('[--dialog-pad:--spacing(4)]')
  expect(box.className).toContain('p-(--dialog-pad)')
  // One column that may shrink: long content truncates instead of widening the box's column.
  expect(box.className).toContain('grid-cols-[minmax(0,1fr)]')
  // A tall body scrolls inside the box.
  expect(box.className).toContain('overflow-y-auto')
  expect(box.className).toContain('rounded-[14px]')
  expect(footer.className).toContain('mx-[calc(var(--dialog-pad)*-1)]')
  // With a footer the box drops its bottom padding, so the footer meets the bottom border.
  expect(box.className).toMatch(/has-\[\[data-slot=(alert-)?dialog-footer\]\]:pb-0/)
  expect(footer.className).toContain('p-(--dialog-pad)')
  // Inner radius = outer 14 minus the 1px border; pinned while the body scrolls.
  expect(footer.className).toContain('rounded-b-[13px]')
  expect(footer.className).toContain('sticky')
  expect(footer.className).not.toMatch(/(^|\s)-m[xb]-4(\s|$)/)
}

describe('dialog footers', () => {
  afterEach(cleanup)

  it('Dialog: the footer bleeds by the box padding, with the inner radius', () => {
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Workspace created</DialogTitle>
          <DialogFooter>
            <button type="button">Done</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    )
    const box = screen.getByRole('dialog')
    expectFlushFooter(box, box.querySelector<HTMLElement>('[data-slot="dialog-footer"]')!)
  })

  it('AlertDialog: the same footer', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent aria-describedby={undefined}>
          <AlertDialogTitle>Make new recovery codes?</AlertDialogTitle>
          <AlertDialogFooter>
            <button type="button">Cancel</button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    )
    const box = screen.getByRole('alertdialog')
    expectFlushFooter(box, box.querySelector<HTMLElement>('[data-slot="alert-dialog-footer"]')!)
  })
})
