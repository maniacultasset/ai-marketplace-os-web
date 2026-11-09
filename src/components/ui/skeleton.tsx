import { cn } from "@/lib/utils"

/**
 * Loading placeholder. Decorative: the wrapper that holds it carries aria-busy. Filled with the
 * hairline tone, not `subtle`: on a white card `subtle` read as an empty box (prod QA 9 Nov, Home).
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("skeleton rounded-md bg-line", className)}
      {...props}
    />
  )
}

export { Skeleton }
