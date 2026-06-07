import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import * as api from '@/api/endpoints'
import type { LeaveRequest } from '@/api/types'
import { StatusChip, TintChip } from '@/components/StatusChip'
import { AttachmentPreview } from '@/components/AttachmentPreview'
import { LEAVE_STATUS_LABEL, LEAVE_STATUS_STYLE } from '@/lib/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function LeaveReviewPage() {
  const [tab, setTab] = useState('pending')
  const qc = useQueryClient()
  const leaves = useQuery({
    queryKey: ['leaves', tab],
    queryFn: () => api.listLeaves({ status: tab === 'all' ? undefined : tab, page_size: 50 }),
  })

  const review = useMutation({
    mutationFn: ({ id, decision, comment }: { id: number; decision: 'approved' | 'rejected'; comment?: string | undefined }) =>
      api.reviewLeave(id, decision, comment),
    onSuccess: (r) => {
      const rep = r.report
      if (r.status === 'approved' && rep) {
        let msg = `已批准，写入 ${rep.applied.length} 天考勤`
        if (rep.pendingDates.length) {
          msg += `；${rep.pendingDates.join('、')} 未开周，开周时自动补写`
        }
        if (rep.overwritten.length) {
          msg += `；覆盖了 ${rep.overwritten.map((o) => `${o.date}(${o.from})`).join('、')}`
        }
        toast.success(msg, { duration: 6000 })
      } else if (rep?.reverted.length) {
        toast.success(`已改判，还原 ${rep.reverted.length} 天考勤为无异常`)
      } else {
        toast.success('已处理')
      }
      void qc.invalidateQueries({ queryKey: ['leaves'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-xl font-semibold">假条核查</h1>
        <Tabs value={tab} onValueChange={setTab} className="ml-auto">
          <TabsList>
            <TabsTrigger value="pending">待审批</TabsTrigger>
            <TabsTrigger value="approved">已批准</TabsTrigger>
            <TabsTrigger value="rejected">已驳回</TabsTrigger>
            <TabsTrigger value="all">全部</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {leaves.isLoading ? (
        <p className="text-sm text-fg-muted">加载中…</p>
      ) : !leaves.data?.items.length ? (
        <p className="text-sm text-fg-muted">没有{LEAVE_STATUS_LABEL[tab] ?? ''}的假条。</p>
      ) : (
        <div className="space-y-3">
          {leaves.data.items.map((l) => (
            <LeaveCard key={l.id} leave={l}
                       busy={review.isPending}
                       onReview={(decision, comment) =>
                         review.mutate({ id: l.id, decision, comment })} />
          ))}
        </div>
      )}
    </div>
  )
}

function LeaveCard({
  leave: l, busy, onReview,
}: {
  leave: LeaveRequest
  busy: boolean
  onReview: (d: 'approved' | 'rejected', comment?: string) => void
}) {
  const [comment, setComment] = useState('')
  const [preview, setPreview] = useState(false)
  const st = LEAVE_STATUS_STYLE[l.status] ?? LEAVE_STATUS_STYLE['cancelled']!

  return (
    <div className="rounded-lg border border-border bg-bg p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{l.studentName}</span>
        <span className="font-mono text-xs text-fg-muted">{l.studentId}</span>
        <span className="text-sm text-fg-muted">{l.className}</span>
        <StatusChip status={l.type} />
        <span className="text-sm">{l.startDate} ~ {l.endDate}</span>
        {l.returnDate && <span className="text-xs text-fg-faint">预计返校 {l.returnDate}</span>}
        <TintChip label={LEAVE_STATUS_LABEL[l.status] ?? l.status} fg={st.fg} bg={st.bg}
                  className="ml-auto" />
      </div>
      <p className="mt-2 text-sm text-fg-muted">{l.reason}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-faint">
        <span>提交于 {l.createdAt}</span>
        {l.hasAttachment && (
          <button onClick={() => setPreview(true)}
                  className="inline-flex items-center gap-1 text-link hover:underline">
            <Paperclip size={12} /> 查看证明材料
          </button>
        )}
        <AttachmentPreview leaveId={preview ? l.id : null} scope="admin"
                           open={preview} onOpenChange={setPreview} />
        {l.reviewedBy && <span>· {l.reviewedBy} 审批于 {l.reviewedAt}</span>}
        {l.reviewComment && <span>· 意见：{l.reviewComment}</span>}
      </div>

      {l.status === 'pending' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Input placeholder="审批意见（可选）" value={comment}
                 onChange={(e) => setComment(e.target.value)}
                 className="h-8 max-w-xs text-xs" />
          <Button size="sm" className="h-8" disabled={busy}
                  onClick={() => onReview('approved', comment || undefined)}>
            <Check size={14} className="mr-1" /> 批准
          </Button>
          <Button size="sm" variant="outline" className="h-8" disabled={busy}
                  onClick={() => onReview('rejected', comment || undefined)}>
            <X size={14} className="mr-1" /> 驳回
          </Button>
        </div>
      )}
      {l.status === 'approved' && (
        <div className="mt-3 border-t border-border pt-3">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
                  onClick={() => onReview('rejected', comment || '改判撤销')}>
            改判驳回（还原已写入的考勤）
          </Button>
        </div>
      )}
    </div>
  )
}
