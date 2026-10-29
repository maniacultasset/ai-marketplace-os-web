import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/*
 * The design system's type scale (src/index.css → --text-*) and matte shadows are custom names.
 * Without telling tailwind-merge about them, `cn('text-h3', 'text-ink')` reads both as text
 * colours and drops the size, so headings lose their size and weight.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "h1", "h2", "h3", "body", "small", "caption"],
      radius: ["control", "card", "pill", "banner", "tile"],
      shadow: [
        "card",
        "raised-sm",
        "raised-md",
        "raised-lg",
        "raised-brand",
        "raised-warn",
        "raised-up",
        "inset-sm",
        "inset-md",
        "pressed",
        "pressed-fill",
        "thumb",
        "pop",
        "primary",
        "focus",
        "focus-danger",
        "selected",
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
