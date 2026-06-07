import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore, isAdmin } from '@/stores/authStore'

/** 登录守卫：未登录 → /login；强制改密 → /change-password。 */
export function RequireAuth() {
  const { user, hydrated, hydrateFromToken } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    if (!hydrated) void hydrateFromToken()
  }, [hydrated, hydrateFromToken])

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-fg-muted">
        加载中…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  return <Outlet />
}

/** 管理员守卫（嵌套在 RequireAuth 内层使用）。 */
export function RequireAdmin() {
  const user = useAuthStore((s) => s.user)
  if (!isAdmin(user)) return <Navigate to="/" replace />
  return <Outlet />
}

/** 超管守卫。 */
export function RequireSuperadmin() {
  const user = useAuthStore((s) => s.user)
  if (user?.role !== 'superadmin') return <Navigate to="/" replace />
  return <Outlet />
}
