import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as api from '@/api/endpoints'
import type { Cell, ClassGrid, Status } from '@/api/types'
import { StatusChip } from '@/components/StatusChip'
import { STATUSES, STATUS_STYLE } from '@/lib/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/cn'

export function ClassGridPage() {
  const weeks = useQuery({ queryKey: ['weeks'], queryFn: () => api.listWeeks() })
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api.listClasses() })
  const [classId, setClassId] = useState<string>('')
  const [weekKey, setWeekKey] = useState<string>('')

  const effectiveWeek = weekKey || (weeks.data?.length
    ? `${weeks.data[weeks.data.length - 1]!.term}|${weeks.data[weeks.data.length - 1]!.weekNo}`
    : '')
  const [term, weekNoStr] = effectiveWeek.split('|')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-xl font-semibold">班级周表</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <div className="w-56">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="选择班级" /></SelectTrigger>
              <SelectContent>
                {(classes.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.fullName}（{c.studentCount}人）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-52">
            <Select value={effectiveWeek} onValueChange={setWeekKey}>
              <SelectTrigger><SelectValue placeholder="选择周次" /></SelectTrigger>
              <SelectContent>
                {(weeks.data ?? []).map((w) => (
                  <SelectItem key={w.id} value={`${w.term}|${w.weekNo}`}>
                    {w.term} 第 {w.weekNo} 周
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {classId && term && weekNoStr ? (
        <GridTable classId={Number(classId)} term={term} weekNo={Number(weekNoStr)} />
      ) : (
        <p className="text-sm text-fg-muted">请先选择班级和周次。</p>
      )}
    </div>
  )
}

function GridTable({ classId, term, weekNo }: { classId: number; term: string; weekNo: number }) {
  const qc = useQueryClient()
  const key = ['classGrid', classId, term, weekNo]
  const grid = useQuery({ queryKey: key, queryFn: () => api.classGrid(classId, term, weekNo) })

  // 单格乐观更新
  const patch = useMutation({
    mutationFn: api.patchAttendance,
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ClassGrid>(key)
      qc.setQueryData<ClassGrid>(key, (old) => {
        if (!old) return old
        return {
          ...old,
          rows: old.rows.map((r) =>
            r.studentId === p.studentId
              ? {
                  ...r,
                  days: {
                    ...r.days,
                    [p.date]: {
                      status: p.status,
                      reason: p.reason ?? null,
                      returnDate: p.returnDate ?? null,
                    },
                  },
                }
              : r,
          ),
        }
      })
      return { prev }
    },
    onError: (e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(e.message)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })

  // 整列批量
  const batch = useMutation({
    mutationFn: api.patchAttendanceBatch,
    onSuccess: (r) => {
      toast.success(`已批量更新 ${r.updated} 人`)
      void qc.invalidateQueries({ queryKey: key })
    },
    onError: (e) => toast.error(e.message),
  })

  const abnormalCount = useMemo(() => {
    let n = 0
    for (const r of grid.data?.rows ?? []) {
      for (const c of Object.values(r.days)) {
        if (c && c.status !== '无异常') n += 1
      }
    }
    return n
  }, [grid.data])

  if (grid.isLoading) return <p className="text-sm text-fg-muted">加载中…</p>
  if (grid.isError) return <p className="text-sm" style={{ color: 'var(--st-absent)' }}>{grid.error.message}</p>
  if (!grid.data) return null
  const g = grid.data

  return (
    <div className="rounded-lg border border-border shadow-card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border bg-bg-subtle px-4 py-2 text-sm">
        <span className="font-medium">{g.className}</span>
        <span className="text-fg-muted">{g.week.startDate} ~ {g.week.endDate}</span>
        <span className="ml-auto text-xs text-fg-muted">
          {g.rows.length} 人 · 异常 {abnormalCount} 人次 · 点击格子修改状态
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-fg-muted">
              <th className="sticky left-0 bg-bg py-2 pl-4 pr-3 font-medium">学号</th>
              <th className="px-2 py-2 font-medium">姓名</th>
              {g.dates.map((d) => (
                <th key={d.date} className="px-2 py-2 font-medium">
                  <ColumnHeader
                    label={d.label}
                    date={d.date}
                    onBatch={(status, reason) =>
                      batch.mutate(
                        g.rows.map((r) => ({
                          studentId: r.studentId,
                          date: d.date,
                          status,
                          ...(reason ? { reason } : {}),
                        })),
                      )
                    }
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r) => (
              <tr key={r.studentId}
                  className="border-b border-border last:border-0 hover:bg-bg-subtle transition">
                <td className="sticky left-0 bg-bg py-1.5 pl-4 pr-3 font-mono text-xs text-fg-muted">
                  {r.studentId}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.name}</td>
                {g.dates.map((d) => (
                  <td key={d.date} className="px-1 py-1">
                    <CellButton
                      cell={r.days[d.date] ?? null}
                      onChange={(status, reason, returnDate) =>
                        patch.mutate({
                          studentId: r.studentId,
                          date: d.date,
                          status,
                          ...(reason ? { reason } : {}),
                          ...(returnDate ? { returnDate } : {}),
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ColumnHeader({
  label, date, onBatch,
}: {
  label: string
  date: string
  onBatch: (status: Status, reason?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="rounded px-1 py-0.5 transition hover:bg-bg hover:text-text">
        {label}
        <span className="block text-[10px] font-normal text-fg-faint">{date.slice(5)}</span>
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-2" align="start">
        <p className="text-xs font-medium text-fg-muted">整列批量设置（{label}）</p>
        <Input placeholder="备注（如：校运会公假）" value={reason}
               onChange={(e) => setReason(e.target.value)} className="h-8 text-xs" />
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              className="rounded-md px-2 py-1 text-xs font-medium transition hover:opacity-80"
              style={{ color: STATUS_STYLE[s].fg, background: STATUS_STYLE[s].bg }}
              onClick={() => {
                onBatch(s, reason || undefined)
                setOpen(false)
                setReason('')
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CellButton({
  cell, onChange,
}: {
  cell: Cell
  onChange: (status: Status, reason?: string, returnDate?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(cell?.reason ?? '')
  const [returnDate, setReturnDate] = useState(cell?.returnDate ?? '')

  // 节假日：系统状态，不可编辑
  if (cell?.status === '节假日') {
    return (
      <div className="w-full px-1 py-1 text-center" title="节假日不点名">
        <StatusChip status="节假日" />
      </div>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setReason(cell?.reason ?? '')
          setReturnDate(cell?.returnDate ?? '')
        }
      }}
    >
      <PopoverTrigger
        className={cn(
          'w-full rounded-md px-1 py-1 text-center transition hover:ring-1 hover:ring-border',
        )}
        title={cell?.reason ?? undefined}
      >
        <StatusChip status={cell?.status} muted />
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2.5" align="center">
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-medium transition hover:opacity-80',
                cell?.status === s && 'ring-1 ring-current',
              )}
              style={{ color: STATUS_STYLE[s].fg, background: STATUS_STYLE[s].bg }}
              onClick={() => {
                onChange(s, reason || undefined, returnDate || undefined)
                setOpen(false)
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">备注 / 原因</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)}
                 className="h-8 text-xs" placeholder="事假/公假请填写原因" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">返校日期</Label>
          <Input type="date" lang="zh-CN" value={returnDate}
                 onChange={(e) => setReturnDate(e.target.value)} className="h-8 text-xs" />
        </div>
        {cell?.status && cell.status !== '无异常' && (
          <Button variant="outline" size="sm" className="h-7 w-full text-xs"
                  onClick={() => {
                    onChange('无异常')
                    setOpen(false)
                  }}>
            恢复为无异常
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
