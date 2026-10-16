import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 px-3 py-0 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-small file:font-semibold file:text-ink focus-ring w-full min-w-0 rounded-control border inset-field text-[14px] leading-5 text-ink transition-[border-color,box-shadow,background-color] duration-150 hover:border-edge-hover placeholder:text-ink-3 disabled:cursor-not-allowed disabled:border-dashed disabled:border-line-strong disabled:bg-subtle disabled:text-ink-3 disabled:shadow-none aria-invalid:border-danger aria-invalid:shadow-[var(--focus-ring-danger),var(--shadow-inset-sm)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
