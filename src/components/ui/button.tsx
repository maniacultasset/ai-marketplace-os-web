import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/**
 * Button (hi-fi Components → Button).
 * Variant: primary (alias default), secondary (alias outline), ghost, danger (alias destructive),
 * warn (attention fill, e.g. "Open Inbox"), subtle (grey fill), link.
 * Size: md 36 (alias default), sm 30, lg 44, xs 24, icon 36 / icon-sm 30 / icon-xs 24 / icon-lg 40.
 * Radius 8, label 14 semibold, focus = brand border + 3px 18% brand ring. One primary per view.
 */
const buttonVariants = cva(
  "group/button focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-control border font-sans font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-150 select-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "border-brand bg-brand text-white shadow-primary hover:border-brand-hover hover:bg-brand-hover",
        default:
          "border-brand bg-brand text-white shadow-primary hover:border-brand-hover hover:bg-brand-hover",
        secondary:
          "border-line-strong bg-surface text-ink hover:bg-subtle aria-expanded:bg-subtle",
        outline:
          "border-line-strong bg-surface text-ink hover:bg-subtle aria-expanded:bg-subtle",
        ghost:
          "border-transparent bg-transparent text-ink-2 hover:bg-subtle hover:text-ink aria-expanded:bg-subtle aria-expanded:text-ink",
        subtle: "border-transparent bg-subtle text-ink hover:bg-line",
        danger:
          "border-danger-line bg-surface text-danger hover:bg-danger-bg focus-visible:border-danger focus-visible:shadow-focus-danger",
        destructive:
          "border-danger-line bg-surface text-danger hover:bg-danger-bg focus-visible:border-danger focus-visible:shadow-focus-danger",
        warn: "border-attention bg-attention text-white hover:bg-attention-ink hover:border-attention-ink",
        link: "h-auto border-transparent px-0 text-brand underline-offset-4 hover:underline",
      },
      size: {
        md: "h-9 px-4 text-[14px] leading-5",
        default: "h-9 px-4 text-[14px] leading-5",
        sm: "h-[30px] gap-1.5 rounded-[7px] px-3 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 px-[22px] text-[15px]",
        xs: "h-6 gap-1 rounded-[6px] px-2 text-[12px] [&_svg:not([class*='size-'])]:size-3",
        icon: "size-9",
        "icon-sm": "size-[30px] rounded-[7px]",
        "icon-xs": "size-6 rounded-[6px] [&_svg:not([class*='size-'])]:size-3",
        "icon-lg": "size-10",
      },
      full: { true: "w-full" },
    },
    compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "md",
  full,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, full, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
