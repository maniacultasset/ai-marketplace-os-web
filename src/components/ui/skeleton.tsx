import { cn } from "@/lib/utils"

/** Loading placeholder. Decorative: the wrapper that holds it carries aria-busy. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("skeleton rounded-md bg-subtle", className)}
      {...props}
    />
  )
}

export { Skeleton }
