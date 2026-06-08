import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as api from '@/api/endpoints'
import { fetchBlob, downloadBlob } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateField } from '@/components/DateField'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/authStore'

export function AdminPage() {
  const role = useAuthStore((s) => s.user?.role)
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl font-semibold">管理</h1>
      <Tabs defaultValue="weeks">
        <TabsList className="flex-wrap">
          <TabsTrigger value="weeks">开周</TabsTrigger>
          <TabsTrigger value="special">特殊日期</TabsTrigger>
          <TabsTrigger value="export">导出</TabsTrigger>
          <TabsTrigger value="transfer">学籍变动</TabsTrigger>
          <TabsTrigger value="grades">年级</TabsTrigger>
          <TabsTrigger value="roster">名单导入</TabsTrigger>
          {role === 'superadmin' && <TabsTrigger value="admins">管理员</TabsTrigger>}
        </TabsList>
        <TabsContent value="weeks"><WeeksTab /></TabsContent>
        <TabsContent value="special"><SpecialDatesTab /></TabsContent>
        <TabsContent value="export"><ExportTab /></TabsContent>
        <TabsContent value="transfer"><TransferTab /></TabsContent>
        <TabsContent value="grades"><GradesTab /></TabsContent>
        <TabsContent value="roster"><RosterTab /></TabsContent>
        {role === 'superadmin' && (
          <TabsContent value="admins"><AdminsTab /></TabsContent>
        )}
      </Tabs>
    </div>
  )
}

/* ---------------- 开周 ---------------- */

function WeeksTab() {
  const qc = useQueryClient()
  const weeks = useQuery({ queryKey: ['weeks'], queryFn: () => api.listWeeks() })
  const last = weeks.data?.[weeks.data.length - 1]
  const [term, setTerm] = useState('')
  const [weekNo, setWeekNo] = useState('')
  const [start, setStart] = useState('')

  const create = useMutation({
    mutationFn: () => api.createWeek(term || last?.term || '', Number(weekNo), start),
    onSuccess: (r) => {
      let msg = `第 ${r.weekNo} 周已开（${r.startDate} ~ ${r.endDate}），预填 ${r.inserted} 行`
      if (r.backfilledLeaves.length) {
        msg += `；自动回填 ${r.backfilledLeaves.length} 张已批假条`
      }
      toast.success(msg, { duration: 6000 })
      void qc.invalidateQueries({ queryKey: ['weeks'] })
      setWeekNo(''); setStart('')
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">开新的一周</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>学期</Label>
            <Input value={term} onChange={(e) => setTerm(e.target.value)}
                   placeholder={last ? `默认 ${last.term}` : '如 2025-2026-2'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>周次（1-57）</Label>
              <Input type="number" min={1} max={57} value={weekNo}
                     onChange={(e) => setWeekNo(e.target.value)}
                     placeholder={last ? `上一周是 ${last.weekNo}` : ''} />
            </div>
            <div className="space-y-1.5">
              <Label>周一日期</Label>
              <DateField value={start} onChange={setStart} placeholder="选择周一" />
            </div>
          </div>
          <Button disabled={!weekNo || !start || create.isPending}
                  onClick={() => create.mutate()}>
            {create.isPending ? '开周中…' : '开周并预填'}
          </Button>
          <p className="text-xs text-fg-faint">
            为全体在读学生预填周一~周四+周日的「无异常」记录（幂等，不覆盖已有状态），
            并自动回填涉及本周的已批假条。
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">已开周次</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {(weeks.data ?? []).slice().reverse().map((w) => (
              <div key={w.id} className="flex justify-between rounded px-2 py-1 hover:bg-bg-subtle">
                <span>{w.term} 第 {w.weekNo} 周</span>
                <span className="text-fg-muted">{w.startDate} ~ {w.endDate}</span>
              </div>
            ))}
            {weeks.data?.length === 0 && <p className="text-fg-muted">还没有开过周。</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ---------------- 特殊日期 ---------------- */

function SpecialDatesTab() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['specialDates'], queryFn: () => api.listSpecialDates() })
  const [date, setDate] = useState('')
  const [kind, setKind] = useState<'holiday' | 'makeup'>('holiday')
  const [note, setNote] = useState('')

  const add = useMutation({
    mutationFn: () => api.addSpecialDate(date, kind, note || undefined),
    onSuccess: (r) => {
      const bits: string[] = []
      if (typeof r['markedHoliday'] === 'number') bits.push(`${r['markedHoliday']} 行改为节假日`)
      if (typeof r['insertedRows'] === 'number') bits.push(`补插 ${r['insertedRows']} 行`)
      const ow = r['overwritten'] as unknown[] | undefined
      if (ow?.length) bits.push(`覆盖 ${ow.length} 条异常标记`)
      toast.success(`已设置${bits.length ? '：' + bits.join('，') : ''}`, { duration: 6000 })
      setDate(''); setNote('')
      void qc.invalidateQueries({ queryKey: ['specialDates'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: api.removeSpecialDate,
    onSuccess: () => {
      toast.success('已撤销')
      void qc.invalidateQueries({ queryKey: ['specialDates'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">新增特殊日期</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>类型</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as 'holiday' | 'makeup')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="holiday">假日（停点，限周一~四/日）</SelectItem>
                <SelectItem value="makeup">补课（加点，限周五/六）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>日期</Label>
            <DateField value={date} onChange={setDate} />
          </div>
          <div className="space-y-1.5">
            <Label>备注</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)}
                   placeholder="如 端午节 / 五一调休补课" />
          </div>
          <Button disabled={!date || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? '处理中…' : '设置'}
          </Button>
          <p className="text-xs text-fg-faint">
            假日：当天已开周的记录改为「节假日」、统计剔除，跨假日的假条自动跳过。
            补课：当天为全体补出勤行、可正常点名。已开周的会即时修复，未开周的开周时自动处理。
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">已设置</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {(list.data ?? []).length === 0 ? (
            <p className="text-sm text-fg-muted">暂无特殊日期。</p>
          ) : (
            (list.data ?? []).map((s) => (
              <div key={s.date}
                   className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-bg-subtle">
                <span className="font-mono">{s.date}</span>
                <span className="rounded-md px-1.5 py-0.5 text-xs font-medium"
                      style={s.kind === 'holiday'
                        ? { color: 'var(--st-absent)', background: 'var(--st-absent-bg)' }
                        : { color: 'var(--st-public)', background: 'var(--st-public-bg)' }}>
                  {s.kind === 'holiday' ? '假日' : '补课'}
                </span>
                {s.note && <span className="text-xs text-fg-muted">{s.note}</span>}
                <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`撤销 ${s.date} 的${s.kind === 'holiday' ? '假日' : '补课'}设置？`)) {
                            remove.mutate(s.date)
                          }
                        }}>
                  撤销
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ---------------- 导出 ---------------- */

function ExportTab() {
  const weeks = useQuery({ queryKey: ['weeks'], queryFn: () => api.listWeeks() })
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api.listClasses() })
  const [scope, setScope] = useState('all')         // all | grade:<g> | class:<name>
  const [weekKey, setWeekKey] = useState('all')     // all | term|weekNo
  const [busy, setBusy] = useState(false)

  const grades = [...new Set((classes.data ?? []).map((c) => c.grade))].sort()

  const run = async () => {
    setBusy(true)
    try {
      const params = new URLSearchParams()
      if (scope.startsWith('grade:')) params.set('grade', scope.slice(6))
      if (scope.startsWith('class:')) params.set('class_name', scope.slice(6))
      if (weekKey !== 'all') {
        const [term, wn] = weekKey.split('|')
        params.set('term', term ?? '')
        params.set('week_no', wn ?? '')
      }
      const blob = await fetchBlob(`/export?${params.toString()}`)
      const scopeName = scope === 'all' ? '全体' : scope.split(':')[1]
      downloadBlob(blob, `晚点名_${scopeName}_${weekKey === 'all' ? '全部周次' : `第${weekKey.split('|')[1]}周`}.csv`)
      toast.success('导出完成')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导出失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader className="pb-3"><CardTitle className="text-base">导出 CSV</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>口径</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全体</SelectItem>
              {grades.map((g) => (
                <SelectItem key={g} value={`grade:${g}`}>{g} 级</SelectItem>
              ))}
              {(classes.data ?? []).map((c) => (
                <SelectItem key={c.id} value={`class:${c.fullName}`}>{c.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>时间范围</Label>
          <Select value={weekKey} onValueChange={setWeekKey}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部周次（长表明细）</SelectItem>
              {(weeks.data ?? []).map((w) => (
                <SelectItem key={w.id} value={`${w.term}|${w.weekNo}`}>
                  {w.term} 第 {w.weekNo} 周（二维表）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button disabled={busy} onClick={() => void run()}>
          {busy ? '导出中…' : '导出'}
        </Button>
        <p className="text-xs text-fg-faint">
          选具体周次输出「学生×星期」二维表；全部周次输出含原因/返校时间的明细长表。
          UTF-8 BOM 编码，Excel 可直接打开。
        </p>
      </CardContent>
    </Card>
  )
}

/* ---------------- 学籍变动 ---------------- */

function TransferTab() {
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api.listClasses() })
  const [sid, setSid] = useState('')
  const [toClass, setToClass] = useState('')

  const transfer = useMutation({
    mutationFn: () => api.createTransfer(sid.trim(), toClass),
    onSuccess: (r) => {
      toast.success(`[${r.kind}] ${r.name}：${r.from} → ${r.to}`, { duration: 6000 })
      setSid('')
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Card className="max-w-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">转班 / 降级 / 转专业</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>学号</Label>
          <Input value={sid} onChange={(e) => setSid(e.target.value)} placeholder="11 位学号" />
        </div>
        <div className="space-y-1.5">
          <Label>目标班级</Label>
          <Select value={toClass} onValueChange={setToClass}>
            <SelectTrigger><SelectValue placeholder="选择班级" /></SelectTrigger>
            <SelectContent>
              {(classes.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.fullName}>{c.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button disabled={!sid || !toClass || transfer.isPending}
                onClick={() => transfer.mutate()}>
          {transfer.isPending ? '执行中…' : '执行变动'}
        </Button>
        <p className="text-xs text-fg-faint">
          班级唯一决定年级+专业，三种变动是同一个操作；历史考勤保留，
          变动轨迹记录在学籍历史中，统计口径自变动日起按新班级归属。
        </p>
      </CardContent>
    </Card>
  )
}

/* ---------------- 年级 ---------------- */

function GradesTab() {
  const qc = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)
  const grades = useQuery({ queryKey: ['grades'], queryFn: api.listGrades })

  const graduate = useMutation({
    mutationFn: api.graduateGrade,
    onSuccess: (r) => {
      toast.success(r.already
        ? `${r.name} 级已是归档状态`
        : `${r.name} 级已毕业归档：${r.graduated} 人标记毕业，${r.attendanceKept} 行历史保留`)
      void qc.invalidateQueries({ queryKey: ['grades'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: ({ name, confirm }: { name: string; confirm: boolean }) =>
      api.removeGrade(name, confirm),
    onSuccess: (r, vars) => {
      if (r.dryRun) {
        if (window.confirm(
          `确认彻底删除 ${vars.name} 级？\n将删除：班级 ${r.classes} 个、学生 ${r.students} 人、` +
          `考勤 ${r.attendance} 行及账号/假条。\n此操作不可恢复！`,
        )) {
          remove.mutate({ name: vars.name, confirm: true })
        }
      } else {
        toast.success(`${vars.name} 级已彻底删除`)
        void qc.invalidateQueries({ queryKey: ['grades'] })
      }
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Card className="max-w-2xl">
      <CardHeader className="pb-3"><CardTitle className="text-base">年级生命周期</CardTitle></CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-fg-muted">
              <th className="py-2 font-medium">年级</th>
              <th className="px-2 py-2 font-medium">状态</th>
              <th className="px-2 py-2 text-right font-medium">班级</th>
              <th className="px-2 py-2 text-right font-medium">在读</th>
              <th className="px-2 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {(grades.data ?? []).map((g) => (
              <tr key={g.id} className="border-b border-border last:border-0">
                <td className="py-2">{g.name} 级（{g.enrollYear}）</td>
                <td className="px-2 py-2">
                  {g.status === 'active' ? (
                    <span style={{ color: 'var(--st-normal)' }}>在读</span>
                  ) : (
                    <span className="text-fg-faint">已归档 {g.archivedAt}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{g.classes}</td>
                <td className="px-2 py-2 text-right tabular-nums">{g.activeStudents}</td>
                <td className="px-2 py-2 text-right">
                  <div className="flex justify-end gap-1.5">
                    {g.status === 'active' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                              disabled={graduate.isPending}
                              onClick={() => {
                                if (window.confirm(
                                  `确认将 ${g.name} 级毕业归档？归档后不再点名、退出统计，历史保留可查。`,
                                )) graduate.mutate(g.name)
                              }}>
                        毕业归档
                      </Button>
                    )}
                    {role === 'superadmin' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                              style={{ color: 'var(--st-absent)' }}
                              disabled={remove.isPending}
                              onClick={() => remove.mutate({ name: g.name, confirm: false })}>
                        删除
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-fg-faint">
          推荐用「毕业归档」（可恢复、历史保留）；「删除」物理清除全部数据，仅超管可用。
        </p>
      </CardContent>
    </Card>
  )
}

/* ---------------- 名单导入 ---------------- */

function RosterTab() {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.importRoster>> | null>(null)

  const imp = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.set('file', file!)
      return api.importRoster(form)
    },
    onSuccess: (r) => {
      setResult(r)
      toast.success(`导入完成：新增学生 ${r.added['students'] ?? 0} 人`)
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Card className="max-w-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">新名单导入（xlsx）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input type="file" accept=".xlsx"
               onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null) }} />
        <Button disabled={!file || imp.isPending} onClick={() => imp.mutate()}>
          {imp.isPending ? '导入中…' : '上传并导入'}
        </Button>
        <p className="text-xs text-fg-faint">
          xlsx 格式与原始名单一致（班级名称/学号/姓名）。幂等导入：已有学生只更新姓名、
          不改班级归属。导入后请到「开周」重开本周补考勤行，并联系运维跑 seed_users 补账号。
        </p>
        {result && (
          <div className="space-y-2 rounded-md border border-border bg-bg-subtle p-3 text-sm">
            <p>
              新增：年级 {result.added['grades']} / 专业 {result.added['majors']} /
              班级 {result.added['classes']} / 学生 {result.added['students']}
              （现共 {result.totals['students']} 人）
            </p>
            {result.conflicts.length > 0 && (
              <div>
                <p className="font-medium" style={{ color: 'var(--st-personal)' }}>
                  ⚠ 学号冲突 {result.conflicts.length} 行（保留首条），请人工裁决：
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-fg-muted">
                  {result.conflicts.map((c, i) => (
                    <li key={i}>
                      {c['student_id']} {c['student_name']} @ {c['class_full_name']} — {c['处理']}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------- 管理员（超管） ---------------- */

function AdminsTab() {
  const qc = useQueryClient()
  const admins = useQuery({ queryKey: ['admins'], queryFn: api.listAdmins })
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')

  const appoint = useMutation({
    mutationFn: () => api.appointAdmin(id.trim(), name || undefined, password || undefined),
    onSuccess: (r) => {
      toast.success(r.mode === 'promoted' ? `已将 ${r.id} 提升为管理员` : `已创建管理员 ${r.id}`)
      setId(''); setName(''); setPassword('')
      void qc.invalidateQueries({ queryKey: ['admins'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const dismiss = useMutation({
    mutationFn: api.dismissAdmin,
    onSuccess: () => {
      toast.success('已解除')
      void qc.invalidateQueries({ queryKey: ['admins'] })
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">任命管理员</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>账号（学生填学号；新建管理员账号用 admin_ 前缀）</Label>
            <Input value={id} onChange={(e) => setId(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>显示名（新账号用）</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>初始密码（仅新账号需要，≥8 位）</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button disabled={!id || appoint.isPending} onClick={() => appoint.mutate()}>
            任命
          </Button>
          <p className="text-xs text-fg-faint">已有学生账号直接升为管理员；解除时自动降回学生。</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">现有管理员</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {(admins.data ?? []).map((a) => (
            <div key={a.id}
                 className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-bg-subtle">
              <span className="font-medium">{a.name}</span>
              <span className="font-mono text-xs text-fg-muted">{a.id}</span>
              <span className="rounded-md px-1.5 py-0.5 text-xs font-medium"
                    style={a.role === 'superadmin'
                      ? { color: 'var(--st-absent)', background: 'var(--st-absent-bg)' }
                      : { color: 'var(--st-public)', background: 'var(--st-public-bg)' }}>
                {a.role === 'superadmin' ? '超管' : '管理员'}
              </span>
              <span className="ml-auto text-xs text-fg-faint">
                {a.lastLoginAt ? `上次登录 ${a.lastLoginAt}` : '从未登录'}
              </span>
              {a.role !== 'superadmin' && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                        disabled={dismiss.isPending}
                        onClick={() => {
                          if (window.confirm(`确认解除 ${a.name}（${a.id}）的管理员权限？`)) {
                            dismiss.mutate(a.id)
                          }
                        }}>
                  解除
                </Button>
              )}
            </div>
          ))}
          {admins.data?.length === 0 && (
            <p className="text-sm text-fg-muted">还没有管理员。</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
