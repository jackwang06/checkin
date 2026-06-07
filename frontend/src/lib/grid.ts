import type { Status, WeekGridRow } from '@/api/types'

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type DayCol = { key: DayKey; label: string }

const ALL_DAY_COLS: DayCol[] = [
  { key: 'mon', label: '周一' }, { key: 'tue', label: '周二' },
  { key: 'wed', label: '周三' }, { key: 'thu', label: '周四' },
  { key: 'fri', label: '周五' }, { key: 'sat', label: '周六' },
  { key: 'sun', label: '周日' },
]

/** 周五/周六平时无数据 → 隐藏；补课周有值则显示。其余列恒显示。 */
export function visibleDayCols(rows: WeekGridRow[]): DayCol[] {
  const optional = new Set<DayKey>(['fri', 'sat'])
  const hasData = (k: DayKey) => rows.some((r) => r[k] != null)
  return ALL_DAY_COLS.filter((c) => !optional.has(c.key) || hasData(c.key))
}

/** 取某天状态（类型安全）。 */
export function dayStatus(row: WeekGridRow, key: DayKey): Status | null {
  return row[key]
}
