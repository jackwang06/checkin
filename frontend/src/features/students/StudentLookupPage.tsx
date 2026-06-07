import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { KeyRound, Search } from 'lucide-react'
import { toast } from 'sonner'
import * as api from '@/api/endpoints'
import { StatusChip } from '@/components/StatusChip'
import { visibleDayCols } from '@/lib/grid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/cn'

export function StudentLookupPage() {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const hits = useQuery({
    queryKey: ['studentSearch', q],
    queryFn: () => api.searchStudents(q),
    enabled: q.trim().length >= 2,
  })
  const report = useQuery({
    queryKey: ['studentReport', selected],
    queryFn: () => api.studentReport(selected!),
    enabled: !!selected,
  })

  const reset = useMutation({
    mutationFn: api.resetPassword,
    onSuccess: (r) => toast.success(r.note, { duration: 6000 }),
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl font-semibold">学生查询</h1>
      <div className="relative max-w-md">
        <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
        <Input className="pl-8" placeholder="输入学号或姓名（至少 2 个字符）"
               value={q} onChange={(e) => { setQ(e.target.value); setSelected(null) }} />
      </div>

      {hits.data && !selected && (
        <div className="max-w-md divide-y divide-border rounded-md border border-border shadow-card">
          {hits.data.length === 0 ? (
            <p className="p-3 text-sm text-fg-muted">没有匹配的学生。</p>
          ) : (
            hits.data.map((s) => (
              <button key={s.id}
                      className="flex w-full items-center gap-3 p-3 text-left text-sm transition hover:bg-bg-subtle"
                      onClick={() => setSelected(s.id)}>
                <span className="font-medium">{s.name}</span>
                <span className="font-mono text-xs text-fg-muted">{s.id}</span>
                <span className="ml-auto text-xs text-fg-muted">{s.className}</span>
                {s.status !== 'active' && (
                  <span className="text-xs" style={{ color: 'var(--st-absent)' }}>{s.status}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {selected && report.data && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 font-serif text-lg">
              {report.data.student.name}
              <span className="font-mono text-sm font-normal text-fg-muted">
                {report.data.student.id}
              </span>
              <span className="text-sm font-normal text-fg-muted">
                {report.data.student.grade}级 {report.data.student.major} · {report.data.student.className}
              </span>
              <Button variant="outline" size="sm" className="ml-auto h-7 text-xs"
                      disabled={reset.isPending}
                      onClick={() => {
                        if (window.confirm(
                          `确认重置 ${report.data!.student.name}（${report.data!.student.id}）的密码？\n` +
                          `将重置为学号本身，该生下次登录需改密。`,
                        )) reset.mutate(report.data!.student.id)
                      }}>
                <KeyRound size={12} className="mr-1" /> 重置密码
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const cols = visibleDayCols(report.data.grid)
              return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-fg-muted">
                    <th className="py-2 pr-3 font-medium">周次</th>
                    {cols.map((d) => (
                      <th key={d.key} className="px-2 py-2 font-medium">{d.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.data.grid.map((row) => (
                    <tr key={`${row.term}-${row.weekNo}`}
                        className="border-b border-border last:border-0 hover:bg-bg-subtle transition">
                      <td className="py-2 pr-3 whitespace-nowrap text-fg-muted">
                        第 {row.weekNo} 周
                      </td>
                      {cols.map((d) => (
                        <td key={d.key} className="px-2 py-2">
                          <StatusChip status={row[d.key]} muted />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              )
            })()}
            <div className={cn('mt-4 border-t border-border pt-3',
                               report.data.abnormal.length === 0 && 'text-fg-muted')}>
              {report.data.abnormal.length === 0 ? (
                <p className="text-sm">全勤，无异常记录。</p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-fg-muted">
                    异常明细（{report.data.abnormal.length} 条）
                  </p>
                  {report.data.abnormal.map((a) => (
                    <div key={a.date} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-fg-muted">{a.date}</span>
                      <StatusChip status={a.status} />
                      {a.reason && <span className="text-xs text-fg-muted">{a.reason}</span>}
                      {a.returnDate && (
                        <span className="text-xs text-fg-faint">返校 {a.returnDate}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
