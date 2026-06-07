import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { changePassword } from '@/api/endpoints'
import { useAuthStore } from '@/stores/authStore'

export function ChangePasswordPage() {
  const navigate = useNavigate()
  const { user, passwordChanged } = useAuthStore()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const forced = user?.mustChangePassword

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next !== confirm) {
      toast.error('两次输入的新密码不一致')
      return
    }
    setBusy(true)
    try {
      await changePassword(current, next)
      passwordChanged()
      toast.success('密码已修改')
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '修改失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-subtle p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-lg border border-border bg-bg p-8 shadow-card"
      >
        <div className="flex items-center gap-2">
          <KeyRound size={20} strokeWidth={1.75} className="text-link" />
          <h1 className="font-serif text-xl font-semibold">修改密码</h1>
        </div>
        {forced && (
          <p className="rounded-md px-3 py-2 text-sm"
             style={{ color: 'var(--st-personal)', background: 'var(--st-personal-bg)' }}>
            首次登录需修改初始密码后才能继续使用。
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="cur">当前密码</Label>
          <Input id="cur" type="password" value={current}
                 onChange={(e) => setCurrent(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="next">新密码（至少 8 位，不能与学号相同）</Label>
          <Input id="next" type="password" value={next}
                 onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cfm">确认新密码</Label>
          <Input id="cfm" type="password" value={confirm}
                 onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <Button type="submit" className="w-full"
                disabled={busy || !current || next.length < 8 || !confirm}>
          {busy ? '提交中…' : '确认修改'}
        </Button>
      </form>
    </div>
  )
}
