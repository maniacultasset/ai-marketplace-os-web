import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--ink)",
          "--normal-border": "var(--line)",
          "--success-bg": "var(--surface)",
          "--success-text": "var(--ink)",
          "--success-border": "var(--success-line)",
          "--error-bg": "var(--surface)",
          "--error-text": "var(--ink)",
          "--error-border": "var(--danger-line)",
          "--border-radius": "12px",
          "--width": "360px",
        } as React.CSSProperties
      }
      duration={6000}
      toastOptions={{
        classNames: {
          toast: "cn-toast !shadow-lg !font-sans",
          title: "!font-bold !text-body",
          description: "!text-small !text-ink-2",
          success: "[&_[data-icon]]:!text-success",
          error: "[&_[data-icon]]:!text-danger",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
