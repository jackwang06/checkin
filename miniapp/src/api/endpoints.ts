import { request, uploadFile, type QueryValue } from './client'
import type {
  AdminUser, ClassGrid, ClassInfo, GradeInfo, LeaveRequest, StatsRow, Status,
  StudentHit, StudentReport, User, Week, WeekGridRow, AbnormalRow,
} from './types'

// ---- 微信登录 ----
export const wxLogin = (code: string) =>
  request<{ needBind: boolean; user?: User; token?: string }>({
    method: 'POST', path: '/wx/login', body: { code },
  })

export const wxBind = (code: string, id: string, password: string) =>
  request<{ user: User; token: string }>({
    method: 'POST', path: '/wx/bind', body: { code, id, password },
  })

// ---- auth ----
export const changePassword = (currentPassword: string, newPassword: string) =>
  request<null>({ method: 'POST', path: '/auth/change-password', body: { currentPassword, newPassword } })

export const me = () => request<User>({ method: 'GET', path: '/auth/me' })

// ---- 学生端 ----
export const myAttendance = (q: { term?: string } = {}) =>
  request<{ grid: WeekGridRow[]; abnormal: AbnormalRow[] }>({ method: 'GET', path: '/me/attendance', query: q })

export const myLeaves = () => request<LeaveRequest[]>({ method: 'GET', path: '/me/leave-requests' })

// 小程序端假条必须带证明材料（一张图片/PDF），走 multipart 上传
export const submitLeaveFile = (
  filePath: string,
  form: { type: string; startDate: string; endDate: string; reason: string; returnDate?: string },
) => uploadFile('/me/leave-requests', filePath, { ...form } as Record<string, string>)

export const cancelLeave = (id: number) =>
  request<null>({ method: 'DELETE', path: `/me/leave-requests/${id}` })

// ---- 管理端（轻量）----
export const listWeeks = (term?: string) =>
  request<Week[]>({ method: 'GET', path: '/weeks', query: { term } })

export const stats = (q: Record<string, QueryValue>) =>
  request<StatsRow[]>({ method: 'GET', path: '/stats', query: q })

export const listClasses = (q: { grade?: string; major?: string } = {}) =>
  request<ClassInfo[]>({ method: 'GET', path: '/classes', query: q })

export const classGrid = (classId: number, term: string, weekNo: number) =>
  request<ClassGrid>({ method: 'GET', path: `/classes/${classId}/grid`, query: { term, week_no: weekNo } })

export type CellPatch = {
  studentId: string; date: string; status: Status; reason?: string; returnDate?: string
}
export const patchAttendance = (p: CellPatch) =>
  request<{ studentId: string; date: string; old: Status | null; status: Status }>({
    method: 'PATCH', path: '/attendance', body: p,
  })

export const searchStudents = (q: string) =>
  request<StudentHit[]>({ method: 'GET', path: '/students', query: { q } })

export const studentReport = (sid: string, q: Record<string, QueryValue> = {}) =>
  request<StudentReport>({ method: 'GET', path: `/students/${sid}/report`, query: q })

export const listLeaves = (q: Record<string, QueryValue>) =>
  request<{ items: LeaveRequest[]; total: number }>({ method: 'GET', path: '/leave-requests', query: q })

export const reviewLeave = (id: number, decision: 'approved' | 'rejected', comment?: string) =>
  request<LeaveRequest>({ method: 'POST', path: `/leave-requests/${id}/review`, body: { decision, comment } })

export const resetPassword = (accountId: string) =>
  request<{ id: string; reset: boolean; note: string }>({
    method: 'POST', path: `/users/${accountId}/reset-password`,
  })

export const listGrades = () => request<GradeInfo[]>({ method: 'GET', path: '/grades' })
export const listAdmins = () => request<AdminUser[]>({ method: 'GET', path: '/admins' })
