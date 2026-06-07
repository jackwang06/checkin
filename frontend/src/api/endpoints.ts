/** 全部 API 调用（与 backend 路由一一对应）。 */

import { request, type QueryValue } from './client'
import type {
  AdminUser, AuditItem, ClassGrid, ClassInfo, GradeInfo, LeaveRequest,
  SpecialDate, StatsRow, Status, StudentHit, StudentReport, User, Week,
  WeekGridRow, AbnormalRow,
} from './types'

// ---- auth ----
export const login = (id: string, password: string) =>
  request<{ user: User; token: string }>({
    method: 'POST', path: '/auth/login', body: { id, password },
  })

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<null>({
    method: 'POST', path: '/auth/change-password',
    body: { currentPassword, newPassword },
  })

export const me = () => request<User>({ method: 'GET', path: '/auth/me' })

// ---- me（学生端）----
export const myAttendance = (q: { term?: string } = {}) =>
  request<{ grid: WeekGridRow[]; abnormal: AbnormalRow[] }>({
    method: 'GET', path: '/me/attendance', query: q,
  })

export const myLeaves = () =>
  request<LeaveRequest[]>({ method: 'GET', path: '/me/leave-requests' })

export const submitLeave = (form: FormData) =>
  request<LeaveRequest>({ method: 'POST', path: '/me/leave-requests', body: form })

export const cancelLeave = (id: number) =>
  request<null>({ method: 'DELETE', path: `/me/leave-requests/${id}` })

// ---- weeks ----
export const listWeeks = (term?: string) =>
  request<Week[]>({ method: 'GET', path: '/weeks', query: { term } })

export const createWeek = (term: string, weekNo: number, start: string) =>
  request<Week & {
    inserted: number; total: number; students: number
    backfilledLeaves: { leave_id: number; student_id: string; type: string; dates: string[] }[]
  }>({ method: 'POST', path: '/weeks', body: { term, weekNo, start } })

// ---- stats ----
export const stats = (q: Record<string, QueryValue>) =>
  request<StatsRow[]>({ method: 'GET', path: '/stats', query: q })

// ---- classes / attendance ----
export const listClasses = (q: { grade?: string; major?: string } = {}) =>
  request<ClassInfo[]>({ method: 'GET', path: '/classes', query: q })

export const classGrid = (classId: number, term: string, weekNo: number) =>
  request<ClassGrid>({
    method: 'GET', path: `/classes/${classId}/grid`,
    query: { term, week_no: weekNo },
  })

export type CellPatch = {
  studentId: string
  date: string
  status: Status
  reason?: string
  returnDate?: string
}

export const patchAttendance = (p: CellPatch) =>
  request<{ studentId: string; date: string; old: Status | null; status: Status }>({
    method: 'PATCH', path: '/attendance', body: p,
  })

export const patchAttendanceBatch = (items: CellPatch[]) =>
  request<{ updated: number }>({
    method: 'PATCH', path: '/attendance/batch', body: { items },
  })

// ---- students ----
export const searchStudents = (q: string) =>
  request<StudentHit[]>({ method: 'GET', path: '/students', query: { q } })

export const studentReport = (sid: string, q: Record<string, QueryValue> = {}) =>
  request<StudentReport>({ method: 'GET', path: `/students/${sid}/report`, query: q })

// ---- leaves（管理端）----
export const listLeaves = (q: Record<string, QueryValue>) =>
  request<{ items: LeaveRequest[]; total: number }>({
    method: 'GET', path: '/leave-requests', query: q,
  })

export const reviewLeave = (id: number, decision: 'approved' | 'rejected', comment?: string) =>
  request<LeaveRequest>({
    method: 'POST', path: `/leave-requests/${id}/review`,
    body: { decision, comment },
  })

// ---- transfers / grades / roster ----
export const createTransfer = (studentId: string, toClassFullName: string) =>
  request<{ studentId: string; name: string; kind: string; from: string; to: string; date: string }>({
    method: 'POST', path: '/transfers', body: { studentId, toClassFullName },
  })

export const listGrades = () =>
  request<GradeInfo[]>({ method: 'GET', path: '/grades' })

export const graduateGrade = (name: string) =>
  request<{ name: string; already: boolean; graduated: number; attendanceKept: number }>({
    method: 'POST', path: `/grades/${name}/graduate`,
  })

export const removeGrade = (name: string, confirm: boolean) =>
  request<{ dryRun: boolean; deleted?: boolean; classes: number; students: number; attendance: number }>({
    method: 'DELETE', path: `/grades/${name}`, query: { confirm },
  })

export const importRoster = (form: FormData) =>
  request<{
    added: Record<string, number>
    totals: Record<string, number>
    conflicts: Record<string, string>[]
    log: string[]
    nextSteps: string
  }>({ method: 'POST', path: '/roster/import', body: form })

// ---- admins / audit ----
export const listAdmins = () => request<AdminUser[]>({ method: 'GET', path: '/admins' })

export const appointAdmin = (id: string, name?: string, password?: string) =>
  request<{ id: string; role: string; mode: string }>({
    method: 'POST', path: '/admins', body: { id, name, password },
  })

export const dismissAdmin = (id: string) =>
  request<null>({ method: 'DELETE', path: `/admins/${id}` })

export const auditLog = (q: Record<string, QueryValue>) =>
  request<{ items: AuditItem[]; total: number }>({
    method: 'GET', path: '/audit-log', query: q,
  })

// ---- special dates ----
export const listSpecialDates = (q: { from_date?: string; to_date?: string } = {}) =>
  request<SpecialDate[]>({ method: 'GET', path: '/special-dates', query: q })

export const addSpecialDate = (date: string, kind: 'holiday' | 'makeup', note?: string) =>
  request<Record<string, unknown>>({
    method: 'POST', path: '/special-dates', body: { date, kind, note },
  })

export const removeSpecialDate = (date: string) =>
  request<Record<string, unknown>>({
    method: 'DELETE', path: `/special-dates/${date}`,
  })

// ---- reset password ----
export const resetPassword = (accountId: string) =>
  request<{ id: string; reset: boolean; note: string }>({
    method: 'POST', path: `/users/${accountId}/reset-password`,
  })
