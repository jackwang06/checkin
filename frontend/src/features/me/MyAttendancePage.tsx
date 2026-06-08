import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Paperclip, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import * as api from '@/api/endpoints'
import type { LeaveRequest } from '@/api/types'
import { StatusChip, TintChip } from '@/components/StatusChip'
import { AttachmentPreview } from '@/components/AttachmentPreview'
import { DateField } from '@/components/DateField'
import { LEAVE_STATUS_LABEL, LEAVE_STATUS_STYLE } from '@/lib/status'
import { visibleDayCols } from '@/lib/grid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import { useAuthStore } from '@/stores/authStore'

export function MyAttendancePage() {
  const user = useAuthStore((s) => s.user)
  const att = useQuery({ queryKey: ['myAttendance'], queryFn: () => api.myAttendance() })
  const leaves = useQuery({ queryKey: ['myLeaves'], queryFn: api.myLeaves })

  if (!user?.studentId) {
    return (
      <p className="text-sm text-fg-muted">
        当前账号未关联学生学籍（管理员账号请使用顶部导航的管理功能）。
      </p>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-lg">
              我的考勤
              <span className="ml-2 text-sm font-normal text-fg-muted">
                {user.className}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {att.isLoading ? (
              <p className="text-sm text-fg-muted">加载中…</p>
            ) : !att.data?.grid.length ? (
              <p className="text-sm text-fg-muted">还没有考勤记录（学期尚未开周）。</p>
            ) : (
              (() => {
                const cols = visibleDayCols(att.data.grid)
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed min-w-[34rem] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-fg-muted">
                          <th className="w-20 py-2 pr-3 font-medium">周次</th>
                          {cols.map((d) => (
                            <th key={d.key} className="px-2 py-2 text-center font-medium">{d.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {att.data.grid.map((row) => (
                          <tr key={`${row.term}-${row.weekNo}`}
                              className="border-b border-border last:border-0 hover:bg-bg-subtle transition">
                            <td className="w-20 py-2 pr-3 whitespace-nowrap text-fg-muted">
                              第 {row.weekNo} 周
                            </td>
                            {cols.map((d) => (
                              <td key={d.key} className="px-2 py-2 text-center">
                                <StatusChip status={row[d.key]} muted />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-xs text-fg-faint">· 表示无异常；周五、周六默认无晚点名（补课除外）</p>
                  </div>
                )
              })()
            )}
            {att.data && att.data.abnormal.length > 0 && (
              <div className="mt-4 space-y-1.5 border-t border-border pt-3">
                <p className="text-xs font-medium text-fg-muted">异常明细</p>
                {att.data.abnormal.map((a) => (
                  <div key={a.date} className="flex items-center gap-2 text-sm">
                    <span className="text-fg-muted">{a.date}</span>
                    <StatusChip status={a.status} />
                    {a.reason && <span className="text-fg-muted text-xs">{a.reason}</span>}
                    {a.returnDate && (
                      <span className="text-fg-faint text-xs">返校 {a.returnDate}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <MyLeaveList leaves={leaves.data ?? []} loading={leaves.isLoading} />
      </div>

      <LeaveForm />
    </div>
  )
}

function MyLeaveList({ leaves, loading }: { leaves: LeaveRequest[]; loading: boolean }) {
  const qc = useQueryClient()
  const [preview, setPreview] = useState<number | null>(null)
  const cancel = useMutation({
    mutationFn: api.cancelLeave,
    onSuccess: () => {
      toast.success('已撤回')
      void qc.invalidateQueries({ queryKey: ['myLeaves'] })
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-lg">我的假条</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-fg-muted">加载中…</p>
        ) : leaves.length === 0 ? (
          <p className="text-sm text-fg-muted">还没有提交过假条。</p>
        ) : (
          leaves.map((l) => {
            const st = LEAVE_STATUS_STYLE[l.status] ?? LEAVE_STATUS_STYLE['cancelled']!
            return (
              <div key={l.id}
                   className="rounded-md border border-border p-3 shadow-card hover:bg-bg-subtle transition">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={l.type} />
                  <span className="text-sm">{l.startDate} ~ {l.endDate}</span>
                  <TintChip label={LEAVE_STATUS_LABEL[l.status] ?? l.status}
                            fg={st.fg} bg={st.bg} />
                  {l.hasAttachment && (
                    <button onClick={() => setPreview(l.id)}
                            className="inline-flex items-center gap-1 text-xs text-link hover:underline">
                      <Paperclip size={12} /> 证明材料
                    </button>
                  )}
                  {l.status === 'pending' && (
                    <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs"
                            disabled={cancel.isPending}
                            onClick={() => cancel.mutate(l.id)}>
                      <Undo2 size={12} className="mr-1" /> 撤回
                    </Button>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-fg-muted">{l.reason}</p>
                {l.reviewComment && (
                  <p className="mt-1 text-xs text-fg-faint">审批意见：{l.reviewComment}</p>
                )}
              </div>
            )
          })
        )}
      </CardContent>
      <AttachmentPreview leaveId={preview} scope="me"
                         open={preview !== null}
                         onOpenChange={(o) => !o && setPreview(null)} />
    </Card>
  )
}

function LeaveForm() {
  const qc = useQueryClient()
  const [type, setType] = useState<'事假' | '公假'>('事假')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [reason, setReason] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const submit = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.set('type', type)
      form.set('startDate', startDate)
      form.set('endDate', endDate)
      form.set('reason', reason)
      if (returnDate) form.set('returnDate', returnDate)
      if (file) form.set('file', file)
      return api.submitLeave(form)
    },
    onSuccess: () => {
      toast.success('假条已提交，等待审批')
      setStartDate(''); setEndDate(''); setReturnDate(''); setReason(''); setFile(null)
      void qc.invalidateQueries({ queryKey: ['myLeaves'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const ok = startDate && endDate && reason.trim() && endDate >= startDate

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <CalendarPlus size={18} strokeWidth={1.75} className="text-link" />
          上传假条
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>类型</Label>
          <Select value={type} onValueChange={(v) => setType(v as '事假' | '公假')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="事假">事假</SelectItem>
              <SelectItem value="公假">公假</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>开始日期</Label>
            <DateField value={startDate} onChange={setStartDate} monthDay />
          </div>
          <div className="space-y-1.5">
            <Label>结束日期</Label>
            <DateField value={endDate} onChange={setEndDate} monthDay />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>预计返校日（可选）</Label>
          <DateField value={returnDate} onChange={setReturnDate} monthDay placeholder="可不填" />
        </div>
        <div className="space-y-1.5">
          <Label>事由</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder="请说明请假原因" />
        </div>
        <div className="space-y-1.5">
          <Label>证明材料（jpg/png/pdf，≤10MB）</Label>
          <Input type="file" accept=".jpg,.jpeg,.png,.pdf"
                 onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <Button className="w-full" disabled={!ok || submit.isPending}
                onClick={() => submit.mutate()}>
          {submit.isPending ? '提交中…' : '提交'}
        </Button>
        <p className="text-xs text-fg-faint">
          通过核查后将自动写入对应日期的考勤记录（节假日不点名，跨假日自动跳过）。
        </p>
      </CardContent>
    </Card>
  )
}
