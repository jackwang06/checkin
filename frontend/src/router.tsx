import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAdmin, RequireAuth } from '@/components/layout/RequireAuth'
import { LoginPage } from '@/features/auth/LoginPage'
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage'
import { MyAttendancePage } from '@/features/me/MyAttendancePage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ClassGridPage } from '@/features/classes/ClassGridPage'
import { LeaveReviewPage } from '@/features/leaves/LeaveReviewPage'
import { StudentLookupPage } from '@/features/students/StudentLookupPage'
import { AuditPage } from '@/features/audit/AuditPage'
import { AdminPage } from '@/features/admin/AdminPage'

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/change-password', element: <ChangePasswordPage /> },
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <MyAttendancePage /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: '/dashboard', element: <DashboardPage /> },
              { path: '/classes', element: <ClassGridPage /> },
              { path: '/leaves', element: <LeaveReviewPage /> },
              { path: '/students', element: <StudentLookupPage /> },
              { path: '/audit', element: <AuditPage /> },
              { path: '/admin', element: <AdminPage /> },
            ],
          },
        ],
      },
    ],
  },
])
