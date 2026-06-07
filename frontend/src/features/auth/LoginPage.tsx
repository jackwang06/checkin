import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/authStore'
import { STATUSES, STATUS_STYLE } from '@/lib/status'

export function LoginPage() {
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !password) return
    setBusy(true)
    try {
      const user = await login(id.trim(), password)
      navigate(user.mustChangePassword ? '/change-password' : '/', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2 bg-bg text-text">
      {/* 品牌面板（仿 Aurash BrandPanel：柔光渐变 + 彩色 chip 条） */}
      <div
        className="relative hidden lg:flex flex-col justify-between p-12 border-r border-border"
        style={{
          background:
            'radial-gradient(60% 50% at 20% 20%, rgba(217,115,13,0.07), transparent), ' +
            'radial-gradient(50% 45% at 85% 75%, rgba(11,110,153,0.07), transparent), ' +
            'var(--color-bg-subtle)',
        }}
      >
        <div className="flex items-center gap-2 font-serif text-xl font-semibold">
          <CalendarCheck size={24} strokeWidth={1.75} className="text-link" />
          晚点名
        </div>
        <div>
          <h1 className="font-serif text-3xl font-semibold leading-snug">
            每晚一次点名，
            <br />
            出勤一目了然。
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-fg-muted">
            周一至周四与周日的晚点名记录、假条申请与审批、
            多级出勤统计——全部在线完成，全程留痕。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <span
              key={s}
              className="rounded-md px-2 py-1 text-xs font-medium"
              style={{ color: STATUS_STYLE[s].fg, background: STATUS_STYLE[s].bg }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* 登录表单 */}
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden flex items-center gap-2 font-serif text-xl font-semibold">
            <CalendarCheck size={22} strokeWidth={1.75} className="text-link" />
            晚点名
          </div>
          <div>
            <h2 className="font-serif text-2xl font-semibold">登录</h2>
            <p className="mt-1 text-sm text-fg-muted">
              学生使用学号登录，初始密码为学号
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sid">学号 / 账号</Label>
            <Input
              id="sid"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="如 20231303001"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">密码</Label>
            <Input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy || !id || !password}>
            {busy ? '登录中…' : '登录'}
          </Button>
          <p className="text-xs text-fg-faint">
            忘记密码请联系学院管理员重置。
          </p>
        </form>
      </div>
    </div>
  )
}
