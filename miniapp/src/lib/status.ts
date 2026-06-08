import type { Status } from '@/api/types'

export const STATUSES: Status[] = ['无异常', '公假', '事假', '旷到', '失联']

// Notion 12% tint 配色（与 web tokens 一致）
export const STATUS_STYLE: Record<Status, { fg: string; bg: string }> = {
  无异常: { fg: '#0f7b6c', bg: 'rgba(15,123,108,0.12)' },
  公假: { fg: '#0b6e99', bg: 'rgba(11,110,153,0.12)' },
  事假: { fg: '#d9730d', bg: 'rgba(217,115,13,0.12)' },
  旷到: { fg: '#e03e3e', bg: 'rgba(224,62,62,0.12)' },
  失联: { fg: '#9065b0', bg: 'rgba(144,101,176,0.12)' },
  节假日: { fg: '#9b9a97', bg: 'rgba(155,154,151,0.14)' },
}

export const LEAVE_STATUS_LABEL: Record<string, string> = {
  pending: '待审批', approved: '已批准', rejected: '已驳回', cancelled: '已撤回',
}
export const LEAVE_STATUS_STYLE: Record<string, { fg: string; bg: string }> = {
  pending: { fg: '#d9730d', bg: 'rgba(217,115,13,0.12)' },
  approved: { fg: '#0f7b6c', bg: 'rgba(15,123,108,0.12)' },
  rejected: { fg: '#e03e3e', bg: 'rgba(224,62,62,0.12)' },
  cancelled: { fg: '#9b9a97', bg: 'rgba(155,154,151,0.12)' },
}

export const DAY_COLS: { key: keyof import('@/api/types').WeekGridRow; label: string }[] = [
  { key: 'mon', label: '一' }, { key: 'tue', label: '二' }, { key: 'wed', label: '三' },
  { key: 'thu', label: '四' }, { key: 'fri', label: '五' }, { key: 'sat', label: '六' },
  { key: 'sun', label: '日' },
]

/** 周五/六无数据则隐藏（补课周才显示）。 */
export function visibleDayCols(rows: import('@/api/types').WeekGridRow[]) {
  const optional = new Set(['fri', 'sat'])
  return DAY_COLS.filter((c) => !optional.has(c.key as string) || rows.some((r) => r[c.key] != null))
}
