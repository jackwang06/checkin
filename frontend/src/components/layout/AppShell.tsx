import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  CalendarCheck, ClipboardList, FileCheck, LayoutDashboard, LogOut,
  ScrollText, Search, Settings, UserRound,
} from 'lucide-react'
import { useAuthStore, isAdmin } from '@/stores/authStore'
import { cn } from '@/lib/cn'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const NAV_USER = [{ to: '/', label: '我的考勤', icon: CalendarCheck }]
const NAV_ADMIN = [
  { to: '/dashboard', label: '统计', icon: LayoutDashboard },
  { to: '/classes', label: '班级周表', icon: ClipboardList },
  { to: '/leaves', label: '假条审批', icon: FileCheck },
  { to: '/students', label: '学生查询', icon: Search },
  { to: '/audit', label: '审计日志', icon: ScrollText },
  { to: '/admin', label: '管理', icon: Settings },
]

const ROLE_LABEL: Record<string, string> = {
  user: '学生',
  admin: '管理员',
  superadmin: '超级管理员',
}

export function AppShell() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const items = isAdmin(user) ? [...NAV_USER, ...NAV_ADMIN] : NAV_USER

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text">
      <header className="sticky top-0 z-40 h-14 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-full max-w-7xl items-center gap-4 px-6">
          <NavLink to="/" className="flex items-center gap-2 font-serif text-lg font-semibold">
            <CalendarCheck size={20} strokeWidth={1.75} className="text-link" />
            晚点名
          </NavLink>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-fg-muted',
                    'transition hover:bg-bg-subtle hover:text-text',
                    isActive && 'bg-bg-subtle text-text font-medium',
                  )
                }
              >
                <Icon size={15} strokeWidth={1.75} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-bg-subtle transition">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bg-subtle border border-border">
                  <UserRound size={14} strokeWidth={1.75} />
                </span>
                <span className="hidden sm:block">{user?.name}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <div className="text-sm">{user?.name}</div>
                  <div className="text-xs font-normal text-fg-muted">
                    {ROLE_LABEL[user?.role ?? 'user']}
                    {user?.className ? ` · ${user.className}` : ''}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/change-password')}>
                  修改密码
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    logout()
                    navigate('/login')
                  }}
                >
                  <LogOut size={14} strokeWidth={1.75} className="mr-1.5" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <Outlet />
        </div>
      </main>
      <footer className="border-t border-border py-4 text-center text-xs text-fg-faint">
        晚点名考勤系统 · 统计口径按学生当前班级归属
      </footer>
    </div>
  )
}
