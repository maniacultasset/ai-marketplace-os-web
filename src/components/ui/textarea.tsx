import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[84px] px-3 py-2.5 focus-ring w-full min-w-0 rounded-control border inset-field text-[14px] leading-5 text-ink transition-[border-color,box-shadow,background-color] duration-200 ease-(--ease-tactile) hover:border-edge-hover placeholder:text-ink-3 disabled:cursor-not-allowed disabled:border-dashed disabled:border-line-strong disabled:bg-subtle disabled:text-ink-3 disabled:shadow-none aria-invalid:border-danger aria-invalid:bg-field-invalid aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:shadow-[var(--focus-ring-danger),var(--shadow-inset-sm)]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
