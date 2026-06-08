"use client"

import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

// Force theme="light": the site has no dark mode, and letting sonner fall back
// to "system" resolves to dark in some headless/CI browsers → black toast.
// Background/text/border use this project's tokens (bg-bg / text-text /
// border-border), not shadcn's bg-background / text-foreground, so the surface
// matches the rest of Feiyue (cream-paper, not stark white/black).
// 宽度随内容自适应（w-auto/fit-content），居中，上限 90vw：短文案如
// "已设置：1111 行改为节假日" 单行显示，超长文案才在 90vw 处换行。
const TOASTER_STYLE = { "--width": "fit-content" } as React.CSSProperties

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={TOASTER_STYLE}
      toastOptions={{
        classNames: {
          toast:
            "group toast !w-auto max-w-[90vw] mx-auto justify-center text-center group-[.toaster]:bg-bg group-[.toaster]:text-text group-[.toaster]:border-border group-[.toaster]:shadow-card",
          description: "group-[.toast]:text-text-muted",
          actionButton:
            "group-[.toast]:bg-text group-[.toast]:text-bg",
          cancelButton:
            "group-[.toast]:bg-bg-subtle group-[.toast]:text-text-muted",
          // sonner's typed toasts (success/error/...) render an SVG icon
          // inside [data-icon]; the SVG uses currentColor, so tinting the
          // wrapper colors the checkmark.
          success: "[&_[data-icon]]:text-emerald-600",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
