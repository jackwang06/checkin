/** 5 种考勤状态的 Notion 风格 12% tint 配色与元数据。 */

import type { Status } from '@/api/types'

export const STATUSES: Status[] = ['无异常', '公假', '事假', '旷到', '失联']

export const STATUS_STYLE: Record<Status, { fg: string; bg: string }> = {
  无异常: { fg: 'var(--st-normal)', bg: 'var(--st-normal-bg)' },
  公假: { fg: 'var(--st-public)', bg: 'var(--st-public-bg)' },
  事假: { fg: 'var(--st-personal)', bg: 'var(--st-personal-bg)' },
  旷到: { fg: 'var(--st-absent)', bg: 'var(--st-absent-bg)' },
  失联: { fg: 'var(--st-lost)', bg: 'var(--st-lost-bg)' },
}

export const LEAVE_STATUS_LABEL: Record<string, string> = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已驳回',
  cancelled: '已撤回',
}

export const LEAVE_STATUS_STYLE: Record<string, { fg: string; bg: string }> = {
  pending: { fg: 'var(--st-personal)', bg: 'var(--st-personal-bg)' },
  approved: { fg: 'var(--st-normal)', bg: 'var(--st-normal-bg)' },
  rejected: { fg: 'var(--st-absent)', bg: 'var(--st-absent-bg)' },
  cancelled: { fg: 'var(--color-text-faint)', bg: 'rgba(155, 154, 151, 0.12)' },
}
