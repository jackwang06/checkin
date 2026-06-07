export type Role = 'user' | 'admin' | 'superadmin'

export type User = {
  id: string
  role: Role
  studentId: string | null
  name: string
  className: string | null
  grade: string | null
  major: string | null
  mustChangePassword: boolean
}

export type Week = {
  id: number
  term: string
  weekNo: number
  startDate: string
  endDate: string
}

/** 5 种考勤状态（与后端 status_def 一致） */
export type Status = '无异常' | '公假' | '事假' | '旷到' | '失联'

export type WeekGridRow = {
  term: string
  weekNo: number
  mon: Status | null
  tue: Status | null
  wed: Status | null
  thu: Status | null
  fri: Status | null
  sun: Status | null
}

export type AbnormalRow = {
  date: string
  status: Status
  reason: string | null
  returnDate: string | null
  term: string
  weekNo: number
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type LeaveRequest = {
  id: number
  studentId: string
  studentName?: string
  className?: string
  type: '事假' | '公假'
  startDate: string
  endDate: string
  reason: string
  returnDate: string | null
  hasAttachment: boolean
  status: LeaveStatus
  reviewedBy: string | null
  reviewedAt: string | null
  reviewComment: string | null
  appliedDates: string | null
  createdAt: string
  report?: {
    applied: string[]
    pendingDates: string[]
    overwritten: { date: string; from: string }[]
    reverted: string[]
  }
}

export type StatsRow = {
  term: string
  weekNo: number
  grade?: string
  major?: string
  className?: string
  total: number
  normal: number
  publicLeave: number
  personalLeave: number
  truant: number
  lost: number
  rate: number
}

export type ClassInfo = {
  id: number
  fullName: string
  grade: string
  major: string
  classNo: number
  tag: string | null
  studentCount: number
}

export type Cell = {
  status: Status
  reason: string | null
  returnDate: string | null
} | null

export type ClassGrid = {
  classId: number
  className: string
  week: Week
  dates: { key: string; label: string; date: string }[]
  rows: { studentId: string; name: string; days: Record<string, Cell> }[]
}

export type StudentHit = {
  id: string
  name: string
  status: string
  className: string
  grade: string
  major: string
}

export type StudentReport = {
  student: StudentHit
  grid: WeekGridRow[]
  abnormal: AbnormalRow[]
}

export type GradeInfo = {
  id: number
  name: string
  enrollYear: number
  status: 'active' | 'archived'
  archivedAt: string | null
  classes: number
  activeStudents: number
}

export type AdminUser = {
  id: string
  role: Role
  name: string
  studentId: string | null
  lastLoginAt: string | null
  createdAt: string
}

export type AuditItem = {
  id: number
  userId: string
  operatorName: string
  action: string
  target: string | null
  detail: Record<string, unknown> | null
  ip: string | null
  createdAt: string
}
