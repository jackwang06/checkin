import type { Status } from '@/api/types'
import { STATUS_STYLE } from '@/lib/status'
import { cn } from '@/lib/cn'

/** Notion 风格 12% tint 状态徽章。 */
export function StatusChip({
  status,
  className,
  muted,
}: {
  status: Status | null | undefined
  className?: string
  /** 无异常以弱化样式显示（表格里大面积出现时降噪） */
  muted?: boolean
}) {
  if (!status) {
    return <span className={cn('text-xs text-fg-faint', className)}>—</span>
  }
  if (muted && status === '无异常') {
    return <span className={cn('text-xs text-fg-faint', className)}>·</span>
  }
  const s = STATUS_STYLE[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
        className,
      )}
      style={{ color: s.fg, background: s.bg }}
    >
      {status}
    </span>
  )
}

export function TintChip({
  label,
  fg,
  bg,
  className,
}: {
  label: string
  fg: string
  bg: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
        className,
      )}
      style={{ color: fg, background: bg }}
    >
      {label}
    </span>
  )
}
