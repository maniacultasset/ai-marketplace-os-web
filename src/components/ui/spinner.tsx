import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"

/**
 * Decorative by default (the button or text beside it says what is happening). Pass `label` (or
 * an `aria-label`) when the spinner stands alone, so screen readers hear it as a status.
 */
function Spinner({ className, label, ...props }: React.ComponentProps<"svg"> & { label?: string }) {
  const name = label ?? props["aria-label"]
  const a11y = name ? { role: "status", "aria-label": name } : { "aria-hidden": true as const }
  return <Loader2Icon data-slot="spinner" {...a11y} className={cn("size-4 animate-spin", className)} {...props} />
}

export { Spinner }
