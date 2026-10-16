import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 px-3 py-0 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-small file:font-semibold file:text-ink focus-ring w-full min-w-0 rounded-control border border-line-strong bg-surface text-[14px] leading-5 text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-3 aria-invalid:border-danger aria-invalid:shadow-focus-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
