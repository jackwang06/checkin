import { useState } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/cn'

/** 自建日期选择器：显示「YYYY年MM月DD日」，规避原生 input[type=date] 的 locale 显示问题。
 *  value/onChange 用 ISO 字符串 'YYYY-MM-DD'（与后端一致）。 */
export function DateField({
  value,
  onChange,
  placeholder = '选择日期',
  className,
  id,
  monthDay,
}: {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  className?: string
  id?: string
  /** 仅显示「M月D日」（省略年份，省空间）；值仍是完整 ISO。 */
  monthDay?: boolean
}) {
  const [open, setOpen] = useState(false)
  const sel = parseISO(value)
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const base = sel ?? new Date()
    return { y: base.getFullYear(), m: base.getMonth() }
  })

  const display = sel
    ? monthDay
      ? `${sel.getMonth() + 1}月${sel.getDate()}日`
      : `${sel.getFullYear()}年${pad(sel.getMonth() + 1)}月${pad(sel.getDate())}日`
    : ''

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          const base = sel ?? new Date()
          setView({ y: base.getFullYear(), m: base.getMonth() })
        }
      }}
    >
      <PopoverTrigger
        id={id}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition',
          'hover:bg-bg-subtle focus:outline-none focus:ring-1 focus:ring-ring',
          className,
        )}
      >
        <CalendarIcon size={14} strokeWidth={1.75} className="text-fg-faint shrink-0" />
        <span className={cn(!display && 'text-fg-faint')}>{display || placeholder}</span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start" data-datefield-cal>
        <CalendarGrid
          view={view}
          setView={setView}
          selected={sel}
          onPick={(iso) => {
            onChange(iso)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

const WEEK = ['一', '二', '三', '四', '五', '六', '日']

function CalendarGrid({
  view,
  setView,
  selected,
  onPick,
}: {
  view: { y: number; m: number }
  setView: (v: { y: number; m: number }) => void
  selected: Date | null
  onPick: (iso: string) => void
}) {
  const { y, m } = view
  const first = new Date(y, m, 1)
  // 周一为一周起点：JS getDay() 周日=0 → 映射到列索引
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const today = new Date()
  const isToday = (d: number) =>
    today.getFullYear() === y && today.getMonth() === m && today.getDate() === d
  const isSel = (d: number) =>
    !!selected && selected.getFullYear() === y &&
    selected.getMonth() === m && selected.getDate() === d

  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const shift = (delta: number) => {
    const nm = m + delta
    setView({ y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)}
                className="rounded p-1 hover:bg-bg-subtle transition">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium">{y}年{pad(m + 1)}月</span>
        <button type="button" onClick={() => shift(1)}
                className="rounded p-1 hover:bg-bg-subtle transition">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-fg-faint">
        {WEEK.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => (
          <div key={i} className="flex items-center justify-center">
            {d == null ? (
              <span className="h-7 w-7" />
            ) : (
              <button
                type="button"
                onClick={() => onPick(`${y}-${pad(m + 1)}-${pad(d)}`)}
                className={cn(
                  'h-7 w-7 rounded-md text-sm transition hover:bg-bg-subtle',
                  isSel(d) && 'bg-link text-white hover:bg-link',
                  !isSel(d) && isToday(d) && 'font-semibold text-link',
                )}
              >
                {d}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function parseISO(s: string): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  return Number.isNaN(dt.getTime()) ? null : dt
}
