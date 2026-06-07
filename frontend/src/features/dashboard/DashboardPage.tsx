import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Users } from 'lucide-react'
import * as api from '@/api/endpoints'
import type { StatsRow } from '@/api/types'
import { STATUS_STYLE } from '@/lib/status'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/cn'

type Drill =
  | { level: 'grade' }
  | { level: 'major'; grade: string }
  | { level: 'class'; grade: string; major: string }

export function DashboardPage() {
  const weeks = useQuery({ queryKey: ['weeks'], queryFn: () => api.listWeeks() })
  const [weekKey, setWeekKey] = useState<string>('')   // "term|weekNo"
  const [drill, setDrill] = useState<Drill>({ level: 'grade' })

  // 默认选最新一周
  const effectiveKey = weekKey || (weeks.data?.length
    ? `${weeks.data[weeks.data.length - 1]!.term}|${weeks.data[weeks.data.length - 1]!.weekNo}`
    : '')
  const [term, weekNoStr] = effectiveKey.split('|')
  const weekNo = weekNoStr ? Number(weekNoStr) : undefined

  const overall = useQuery({
    queryKey: ['stats', 'overall', term, weekNo],
    queryFn: () => api.stats({ level: 'overall', term, week_no: weekNo }),
    enabled: !!term,
  })
  const drillQuery = useQuery({
    queryKey: ['stats', drill, term, weekNo],
    queryFn: () =>
      api.stats({
        level: drill.level,
        term,
        week_no: weekNo,
        grade: 'grade' in drill ? drill.grade : undefined,
        major: drill.level === 'class' ? drill.major : undefined,
      }),
    enabled: !!term,
  })

  const o = overall.data?.[0]
  const crumbs = useMemo(() => {
    const items: { label: string; to: Drill }[] = [{ label: '全体', to: { level: 'grade' } }]
    if (drill.level !== 'grade') {
      items.push({ label: `${drill.grade}级`, to: { level: 'major', grade: drill.grade } })
    }
    if (drill.level === 'class') {
      items.push({ label: drill.major, to: drill })
    }
    return items
  }, [drill])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-xl font-semibold">出勤统计</h1>
        <div className="ml-auto w-56">
          <Select value={effectiveKey} onValueChange={setWeekKey}>
            <SelectTrigger><SelectValue placeholder="选择周次" /></SelectTrigger>
            <SelectContent>
              {(weeks.data ?? []).map((w) => (
                <SelectItem key={w.id} value={`${w.term}|${w.weekNo}`}>
                  {w.term} 第 {w.weekNo} 周（{w.startDate}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 总体卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <StatCard label="应到人次" value={o?.total} icon />
        <StatCard label="出勤率" value={o ? `${o.rate}%` : undefined} accent="var(--st-normal)" />
        <StatCard label="无异常" value={o?.normal} accent={STATUS_STYLE['无异常'].fg} />
        <StatCard label="公假" value={o?.publicLeave} accent={STATUS_STYLE['公假'].fg} />
        <StatCard label="事假" value={o?.personalLeave} accent={STATUS_STYLE['事假'].fg} />
        <StatCard label="旷到" value={o?.truant} accent={STATUS_STYLE['旷到'].fg} />
        <StatCard label="失联" value={o?.lost} accent={STATUS_STYLE['失联'].fg} />
      </div>

      {/* 下钻面包屑 */}
      <div className="flex items-center gap-1 text-sm">
        {crumbs.map((c, i) => (
          <span key={c.label} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} className="text-fg-faint" />}
            <button
              onClick={() => setDrill(c.to)}
              className={cn(
                'rounded px-1.5 py-0.5 transition hover:bg-bg-subtle',
                i === crumbs.length - 1 ? 'font-medium' : 'text-fg-muted',
              )}
            >
              {c.label}
            </button>
          </span>
        ))}
        <span className="ml-2 text-xs text-fg-faint">点击行继续下钻 · 口径按学生当前班级归属</span>
      </div>

      {/* 下钻表 */}
      <Card>
        <CardContent className="pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-muted">
                <th className="py-2 pr-3 font-medium">
                  {drill.level === 'grade' ? '年级' : drill.level === 'major' ? '专业' : '班级'}
                </th>
                <th className="px-2 py-2 text-right font-medium">应到</th>
                <th className="px-2 py-2 text-right font-medium">公假</th>
                <th className="px-2 py-2 text-right font-medium">事假</th>
                <th className="px-2 py-2 text-right font-medium">旷到</th>
                <th className="px-2 py-2 text-right font-medium">失联</th>
                <th className="px-2 py-2 text-right font-medium">出勤率</th>
              </tr>
            </thead>
            <tbody>
              {(drillQuery.data ?? []).map((row) => (
                <DrillRow key={rowKey(row)} row={row} drill={drill} onDrill={setDrill} />
              ))}
            </tbody>
          </table>
          {drillQuery.data?.length === 0 && (
            <p className="py-4 text-sm text-fg-muted">该周暂无数据。</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function rowKey(r: StatsRow): string {
  return `${r.grade ?? ''}-${r.major ?? ''}-${r.className ?? ''}-${r.weekNo}`
}

function DrillRow({
  row, drill, onDrill,
}: {
  row: StatsRow
  drill: Drill
  onDrill: (d: Drill) => void
}) {
  const name =
    drill.level === 'grade' ? `${row.grade}级`
    : drill.level === 'major' ? row.major
    : row.className
  const clickable = drill.level !== 'class'
  return (
    <tr
      className={cn(
        'border-b border-border last:border-0 transition',
        clickable && 'cursor-pointer hover:bg-bg-subtle',
      )}
      onClick={() => {
        if (drill.level === 'grade' && row.grade) {
          onDrill({ level: 'major', grade: row.grade })
        } else if (drill.level === 'major' && row.grade && row.major) {
          onDrill({ level: 'class', grade: row.grade, major: row.major })
        }
      }}
    >
      <td className="py-2 pr-3">{name}</td>
      <td className="px-2 py-2 text-right tabular-nums">{row.total}</td>
      <Num v={row.publicLeave} c="公假" />
      <Num v={row.personalLeave} c="事假" />
      <Num v={row.truant} c="旷到" />
      <Num v={row.lost} c="失联" />
      <td className="px-2 py-2 text-right tabular-nums font-medium">{row.rate}%</td>
    </tr>
  )
}

function Num({ v, c }: { v: number; c: '公假' | '事假' | '旷到' | '失联' }) {
  return (
    <td className="px-2 py-2 text-right tabular-nums"
        style={v > 0 ? { color: STATUS_STYLE[c].fg, fontWeight: 500 } : { color: 'var(--fg-faint)' }}>
      {v}
    </td>
  )
}

function StatCard({
  label, value, accent, icon,
}: {
  label: string
  value: number | string | undefined
  accent?: string
  icon?: boolean
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <p className="flex items-center gap-1 text-xs text-fg-muted">
          {icon && <Users size={12} strokeWidth={1.75} />}
          {label}
        </p>
        <p className="mt-1 text-xl font-semibold tabular-nums"
           style={accent ? { color: accent } : undefined}>
          {value ?? '—'}
        </p>
      </CardContent>
    </Card>
  )
}
