import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Tabs as TabsPrimitive } from "radix-ui"

/**
 * Radix tabs in the two hi-fi looks:
 * - variant "line" (hi-fi Tabs): 42px, ink-2 label, active = brand label + 2px brand underline.
 * - variant "default" (hi-fi Segmented control): 34px subtle track, active = white pill with shadow.
 * For route-driven tabs (links) use `RouteTabs` from '@/components/la/tabs'.
 */
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

const tabsListVariants = cva("group/tabs-list inline-flex items-center text-ink-2", {
  variants: {
    variant: {
      default: "h-[34px] w-fit gap-0.5 rounded-[10px] inset-track p-[3px]",
      line: "mb-5 w-full gap-1 overflow-x-auto border-b border-line",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        /* segmented */
        "group-data-[variant=default]/tabs-list:h-7 group-data-[variant=default]/tabs-list:rounded-[7px] group-data-[variant=default]/tabs-list:px-3 group-data-[variant=default]/tabs-list:text-[13px] group-data-[variant=default]/tabs-list:font-semibold group-data-[variant=default]/tabs-list:hover:text-ink group-data-[variant=default]/tabs-list:data-active:bg-surface group-data-[variant=default]/tabs-list:data-active:text-ink group-data-[variant=default]/tabs-list:data-active:shadow-thumb",
        /* line */
        "group-data-[variant=line]/tabs-list:-mb-px group-data-[variant=line]/tabs-list:h-[42px] group-data-[variant=line]/tabs-list:border-b-2 group-data-[variant=line]/tabs-list:border-transparent group-data-[variant=line]/tabs-list:px-3.5 group-data-[variant=line]/tabs-list:font-medium group-data-[variant=line]/tabs-list:hover:text-ink group-data-[variant=line]/tabs-list:data-active:border-brand group-data-[variant=line]/tabs-list:data-active:font-bold group-data-[variant=line]/tabs-list:data-active:text-brand",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
