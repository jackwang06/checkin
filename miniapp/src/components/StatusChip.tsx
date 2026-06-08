import { Text } from '@tarojs/components'
import type { Status } from '@/api/types'
import { STATUS_STYLE } from '@/lib/status'

/** 状态徽章。muted: 无异常显示「·」降噪。 */
export function StatusChip({ status, muted }: { status?: Status | null; muted?: boolean }) {
  if (!status) return <Text className='faint'>—</Text>
  if (muted && status === '无异常') return <Text className='faint'>·</Text>
  const s = STATUS_STYLE[status]
  return (
    <Text className='chip' style={{ color: s.fg, background: s.bg }}>{status}</Text>
  )
}
