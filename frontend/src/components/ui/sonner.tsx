"use client"

import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

// Force theme="light": the site has no dark mode, and letting sonner fall back
// to "system" resolves to dark in some headless/CI browsers → black toast.
// Background/text/border use this project's tokens (bg-bg / text-text /
// border-border), not shadcn's bg-background / text-foreground, so the surface
// matches the rest of Feiyue (cream-paper, not stark white/black).
// sonner 结构：ol 容器宽=var(--width) 居中；li 气泡 position:absolute、left:0、width=var(--width)
// 填满容器。要"贴合内容+居中"：①容器设 90vw（合法长度，居中 calc 仍生效，不能用 max/fit-content
// 否则 calc 失效偏移/竖条）；②li 用 w-max 贴合内容，再 left-0 right-0 mx-auto 在容器内绝对居中，
// max-w-full 封顶 90vw。短文案两侧无多余留白，超长文案才换行。
const TOASTER_STYLE = { "--width": "90vw" } as React.CSSProperties

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={TOASTER_STYLE}
      toastOptions={{
        classNames: {
          toast:
            "group toast !w-max !max-w-full !left-0 !right-0 !mx-auto justify-center text-center group-[.toaster]:bg-bg group-[.toaster]:text-text group-[.toaster]:border-border group-[.toaster]:shadow-card",
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
