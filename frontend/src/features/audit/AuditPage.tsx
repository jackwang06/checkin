import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import * as api from '@/api/endpoints'
import type { AuditItem } from '@/api/types'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

const ACTION_OPTIONS = [
  { value: 'all', label: '全部动作' },
  { value: 'attendance', label: '考勤修改' },
  { value: 'leave', label: '假条' },
  { value: 'week', label: '开周' },
  { value: 'transfer', label: '学籍变动' },
  { value: 'grade', label: '年级操作' },
  { value: 'roster', label: '名单导入' },
  { value: 'admin', label: '管理员变更' },
  { value: 'auth', label: '账号安全' },
  { value: 'export', label: '导出' },
]

const ACTION_LABEL: Record<string, string> = {
  'attendance.update': '修改考勤',
  'leave.submit': '提交假条',
  'leave.cancel': '撤回假条',
  'leave.approve': '批准假条',
  'leave.reject': '驳回假条',
  'leave.revert': '改判假条',
  'week.create': '开周',
  'transfer': '学籍变动',
  'grade.graduate': '年级归档',
  'grade.remove': '年级删除',
  'roster.import': '名单导入',
  'admin.appoint': '任命管理员',
  'admin.dismiss': '解除管理员',
  'auth.change_password': '修改密码',
  'export.csv': '导出 CSV',
}

export function AuditPage() {
  const [action, setAction] = useState('all')
  const [userId, setUserId] = useState('')
  const [page, setPage] = useState(1)

  const logs = useQuery({
    queryKey: ['audit', action, userId, page],
    queryFn: () =>
      api.auditLog({
        action: action === 'all' ? undefined : action,
        user_id: userId.trim() || undefined,
        page,
        page_size: 50,
      }),
  })

  const totalPages = Math.max(1, Math.ceil((logs.data?.total ?? 0) / 50))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-xl font-semibold">审计日志</h1>
        <span className="text-xs text-fg-faint">所有写操作全量留痕，与业务同事务记录</span>
        <div className="ml-auto flex gap-2">
          <Input placeholder="操作人账号" value={userId}
                 onChange={(e) => { setUserId(e.target.value); setPage(1) }}
                 className="h-9 w-40" />
          <div className="w-36">
            <Select value={action} onValueChange={(v) => { setAction(v); setPage(1) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border shadow-card">
        {logs.isLoading ? (
          <p className="p-4 text-sm text-fg-muted">加载中…</p>
        ) : !logs.data?.items.length ? (
          <p className="p-4 text-sm text-fg-muted">没有匹配的日志。</p>
        ) : (
          logs.data.items.map((item) => <AuditRow key={item.id} item={item} />)
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-fg-muted">
        <span>共 {logs.data?.total ?? 0} 条</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span>{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      </div>
    </div>
  )
}

function AuditRow({ item }: { item: AuditItem }) {
  const [open, setOpen] = useState(false)
  const hasDetail = item.detail && Object.keys(item.detail).length > 0
  return (
    <div className="px-4 py-2.5 text-sm transition hover:bg-bg-subtle">
      <button className="flex w-full flex-wrap items-center gap-2 text-left"
              onClick={() => hasDetail && setOpen(!open)}>
        {hasDetail ? (
          open ? <ChevronDown size={14} className="text-fg-faint" />
               : <ChevronRight size={14} className="text-fg-faint" />
        ) : <span className="w-3.5" />}
        <span className="text-xs tabular-nums text-fg-faint">{item.createdAt}</span>
        <span className="font-medium">{item.operatorName}</span>
        <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-medium')}
              style={{ color: 'var(--color-link)', background: 'rgba(35,131,226,0.1)' }}>
          {ACTION_LABEL[item.action] ?? item.action}
        </span>
        {item.target && <span className="font-mono text-xs text-fg-muted">{item.target}</span>}
        {item.ip && <span className="ml-auto text-xs text-fg-faint">{item.ip}</span>}
      </button>
      {open && hasDetail && (
        <pre className="mt-2 overflow-x-auto rounded-md bg-bg-subtle p-2.5 text-xs text-fg-muted">
          {JSON.stringify(item.detail, null, 2)}
        </pre>
      )}
    </div>
  )
}
