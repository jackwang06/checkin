"use client"

import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

// Force theme="light": the site has no dark mode, and letting sonner fall back
// to "system" resolves to dark in some headless/CI browsers → black toast.
// Background/text/border use this project's tokens (bg-bg / text-text /
// border-border), not shadcn's bg-background / text-foreground, so the surface
// matches the rest of Feiyue (cream-paper, not stark white/black).
// --width 必须是固定 px/rem：sonner 用它做居中定位的 calc，设成 max-content/fit-content
// 会破坏居中（偏移/竖条）。气泡也不能用 w-max（sonner 的 li 是绝对定位，mx-auto 不生效，会偏左）。
// 方案：容器固定 26rem 全宽气泡（sonner 正确居中）+ 文字居中。短文案（账号或密码错误 /
// 已设置：1111 行改为节假日）单行居中显示，超长文案在 26rem 处自然换行。
const TOASTER_STYLE = { "--width": "26rem" } as React.CSSProperties

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={TOASTER_STYLE}
      toastOptions={{
        classNames: {
          toast:
            "group toast justify-center text-center group-[.toaster]:bg-bg group-[.toaster]:text-text group-[.toaster]:border-border group-[.toaster]:shadow-card",
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
