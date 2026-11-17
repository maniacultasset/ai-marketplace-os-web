/** "Change category" (SI9): pick the new category; the product's drafts move with it. */
import { useState } from 'react'
import { Banner } from '@/components/la/banner'
import { fieldHintId, LaField } from '@/components/la/field'
import { UnavailableButton } from '@/components/la/unavailable'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/lib/toast'
import { mappingText, pickerChoices, useCatalogCategories } from './catalog-categories'
import { categoryLabel } from './categories'
import { CategoryCombobox } from './category-select'
import { recategorizeRefusal, useRecategorize, type RecategorizeState } from './recategorize'

export function ChangeCategoryButton({ productId, current, state }: { productId: string; current: string; state: RecategorizeState }) {
  const [open, setOpen] = useState(false)
  if (state.kind === 'none') return null
  if (state.kind === 'refused')
    return (
      <UnavailableButton variant="ghost" size="xs" reason={state.reason} data-testid="change-category">
        Change
      </UnavailableButton>
    )
  return (
    <>
      <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(true)} data-testid="change-category">
        Change
      </Button>
      {open ? <ChangeCategoryDialog productId={productId} current={current} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function ChangeCategoryDialog({ productId, current, onClose }: { productId: string; current: string; onClose: () => void }) {
  const catalog = useCatalogCategories()
  // The backend's list once read (client feedback 17 Nov: bottomwear), else the built-in one.
  const choices = pickerChoices(catalog.data?.items ?? null, false).filter((c) => c.value !== current && c.mapped)
  const [value, setValue] = useState(() => choices[0]?.value ?? '')
  const [refusal, setRefusal] = useState<string | null>(null)
  const change = useRecategorize(productId)
  // Client feedback item 5: the product type each marketplace is sent for the new category.
  const mapping = mappingText(catalog.data?.items?.find((c) => c.category === value))

  const submit = () => {
    if (!value) return
    setRefusal(null)
    change.mutate(value, {
      onSuccess: () => {
        toast.success(`Category changed to ${categoryLabel(value)}`, {
          description: 'Its drafts moved too. Generate them again to write them for the new category.',
        })
        onClose()
      },
      onError: (e) => setRefusal(recategorizeRefusal(e)),
    })
  }

  return (
    <AlertDialog open onOpenChange={(o) => !o && !change.isPending && onClose()}>
      <AlertDialogContent data-testid="change-category-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Change the category?</AlertDialogTitle>
          <AlertDialogDescription>
            It is {categoryLabel(current)} now. Its drafts that were not sent to a marketplace move to the new category and
            need to be generated again. Nothing is sent.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {choices.length ? (
          <LaField
            label="New category"
            htmlFor="recategorize"
            hint={mapping ? <span data-testid="change-category-mapping">{mapping}</span> : undefined}
          >
            <CategoryCombobox
              id="recategorize"
              value={value}
              choices={choices}
              onChange={setValue}
              disabled={change.isPending}
              describedBy={fieldHintId('recategorize')}
              placeholder="Choose"
            />
          </LaField>
        ) : (
          <p className="text-body text-ink-2">There is no other category to move it to yet.</p>
        )}
        {refusal ? (
          <Banner tone="danger" role="alert">
            {refusal}
          </Banner>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={change.isPending}>Cancel</AlertDialogCancel>
          <Button onClick={submit} disabled={!value || change.isPending} data-testid="change-category-confirm">
            {change.isPending ? <Spinner data-icon="inline-start" /> : null}
            {change.isPending ? 'Changing…' : 'Change category'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
