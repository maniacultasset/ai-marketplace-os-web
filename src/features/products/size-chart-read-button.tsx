/**
 * "Read sizes from your size chart photo" (SI12): starts the read, follows it, and loads the rows
 * into the size chart editor above it with a "Size chart" chip. The seller checks and saves; the
 * read never saves anything. While AI is paused the button explains why it is off (SI10).
 */
import { Banner, Icon, SourceBadge, UnavailableButton } from '@/components/la'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { AI_PAUSED_REASON } from '@/features/ai-credit/model'
import { useAiPaused } from '@/features/ai-credit/use-ai-paused'
import type { ProductDetail } from './api'
import { sizeChartImageId, useSizeChartRead } from './size-chart-read'
import type { SizeChart } from './intake-model'

const LABEL = 'Read sizes from your size chart photo'

export function SizeChartReadButton({
  product,
  onRead,
  loaded,
}: {
  product: ProductDetail
  onRead: (chart: SizeChart, imageId: string) => void
  /** The editor holds rows read from the photo (not saved yet). */
  loaded: boolean
}) {
  const paused = useAiPaused()
  const read = useSizeChartRead(product.id, onRead)
  const imageId = sizeChartImageId(product)
  const busy = read.state.kind === 'reading'

  if (!imageId)
    return (
      <p className="flex items-start gap-1.5 text-caption text-ink-3" data-testid="size-chart-read-none">
        <Icon name="info" size={14} className="mt-[calc((1lh-14px)/2)] shrink-0" />
        Add a size chart photo on the Media tab to read the sizes from it.
      </p>
    )

  return (
    <div className="flex flex-col gap-2.5" data-testid="size-chart-read">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {paused ? (
          <UnavailableButton variant="secondary" size="sm" reason={AI_PAUSED_REASON}>
            <Icon name="spark" size={16} />
            {LABEL}
          </UnavailableButton>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={() => void read.start()} disabled={busy} data-testid="size-chart-read-start">
            {busy ? <Spinner data-icon="inline-start" aria-hidden /> : <Icon name="spark" size={16} />}
            {busy ? 'Reading your size chart…' : loaded ? 'Read the photo again' : LABEL}
          </Button>
        )}
        {loaded ? (
          <span className="flex items-center gap-1.5 text-caption text-ink-2">
            <SourceBadge source={{ kind: 'size-chart' }} />
            Not saved yet. Check each row, then save.
          </span>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {busy ? 'Reading your size chart photo.' : read.state.kind === 'read' ? `${read.state.rows} sizes read. Check them, then save.` : ''}
      </p>
      {read.state.kind === 'unreadable' ? (
        <Banner tone="attention" role="status">
          The sizes on this photo could not be read. Enter them yourself, or add a clearer photo of the chart.
        </Banner>
      ) : read.state.kind === 'failed' ? (
        <Banner tone="attention" role="status">
          Reading the photo did not finish. Try again in a few minutes, or enter the sizes yourself.
        </Banner>
      ) : read.state.kind === 'error' ? (
        <Banner tone={read.state.paused ? 'attention' : 'danger'} role="alert">
          {read.state.message}
        </Banner>
      ) : null}
    </div>
  )
}
