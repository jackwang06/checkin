import { useState } from 'react'
import { View, Text, Picker } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { listClasses, listWeeks, classGrid, patchAttendance } from '@/api/endpoints'
import type { ClassInfo, Week, ClassGrid, Status } from '@/api/types'
import { STATUSES, STATUS_STYLE } from '@/lib/status'
import { StatusChip } from '@/components/StatusChip'
import { guard } from '@/lib/auth'

type Row = { studentId: string; name: string; status: Status | null }

export default function Rollcall() {
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [weeks, setWeeks] = useState<Week[]>([])
  const [clsIdx, setClsIdx] = useState(-1)
  const [weekIdx, setWeekIdx] = useState(-1)
  const [grid, setGrid] = useState<ClassGrid | null>(null)
  const [dateIdx, setDateIdx] = useState(0)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  useLoad(() => {
    if (!guard()) return
    Promise.all([listClasses(), listWeeks()])
      .then(([c, w]) => { setClasses(c); setWeeks(w); if (w.length) setWeekIdx(w.length - 1) })
      .catch((e) => Taro.showToast({ title: e?.message || '加载失败', icon: 'none' }))
  })

  const loadGrid = async (ci: number, wi: number, di = 0) => {
    if (ci < 0 || wi < 0) return
    setLoading(true)
    try {
      const g = await classGrid(classes[ci].id, weeks[wi].term, weeks[wi].weekNo)
      setGrid(g); setDateIdx(di)
      const d = g.dates[di]?.date
      setRows(g.rows.map((r) => ({ studentId: r.studentId, name: r.name, status: (r.days[d]?.status ?? null) as Status | null })))
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '加载失败', icon: 'none' }); setGrid(null); setRows([])
    } finally { setLoading(false) }
  }

  const pickDate = (di: number) => {
    if (!grid) return
    setDateIdx(di)
    const d = grid.dates[di].date
    setRows(grid.rows.map((r) => ({ studentId: r.studentId, name: r.name, status: (r.days[d]?.status ?? null) as Status | null })))
  }

  const setStatus = async (studentId: string, s: Status) => {
    if (!grid) return
    const d = grid.dates[dateIdx].date
    try {
      await patchAttendance({ studentId, date: d, status: s })
      setRows((prev) => prev.map((x) => x.studentId === studentId ? { ...x, status: s } : x))
      Taro.showToast({ title: '已记', icon: 'success' })
    } catch (e: any) { Taro.showToast({ title: e?.message || '失败', icon: 'none' }) }
  }

  const curDay = grid?.dates[dateIdx]

  return (
    <View>
      <View className='card'>
        <Text className='label'>班级</Text>
        <Picker mode='selector' range={classes.map((c) => c.fullName)} value={clsIdx}
                onChange={(e) => { const i = Number(e.detail.value); setClsIdx(i); loadGrid(i, weekIdx) }}>
          <View className='input'>{clsIdx >= 0 ? classes[clsIdx].fullName : '选择班级'}</View>
        </Picker>
        <Text className='label' style={{ marginTop: '20rpx' }}>周次</Text>
        <Picker mode='selector' range={weeks.map((w) => `第${w.weekNo}周 (${w.startDate})`)} value={weekIdx}
                onChange={(e) => { const i = Number(e.detail.value); setWeekIdx(i); loadGrid(clsIdx, i) }}>
          <View className='input'>{weekIdx >= 0 ? `第${weeks[weekIdx].weekNo}周` : '选择周次'}</View>
        </Picker>
        {grid && (
          <View className='row' style={{ gap: '10rpx', flexWrap: 'wrap', marginTop: '20rpx' }}>
            {grid.dates.map((d, i) => (
              <Text key={d.date}
                    className='chip'
                    style={{ padding: '10rpx 20rpx',
                      background: i === dateIdx ? 'var(--fg)' : 'var(--bg-subtle)',
                      color: i === dateIdx ? 'var(--bg)' : 'var(--fg-muted)' }}
                    onClick={() => pickDate(i)}>
                {d.label}{d.date.slice(5)}
              </Text>
            ))}
          </View>
        )}
      </View>

      {loading ? (
        <View className='card'><Text className='muted'>加载中…</Text></View>
      ) : !grid ? (
        <View className='card'><Text className='muted'>选择班级与周次后加载名单。</Text></View>
      ) : (
        <View>
          <View className='card'><Text className='muted'>{grid.className} · {curDay?.label}（{curDay?.date}）· {rows.length} 人</Text></View>
          {rows.map((r) => (
            <View key={r.studentId} className='card'>
              <View className='row' style={{ justifyContent: 'space-between' }}>
                <Text>{r.name}</Text>
                <StatusChip status={r.status} muted />
              </View>
              <View className='row' style={{ gap: '10rpx', flexWrap: 'wrap', marginTop: '14rpx' }}>
                {STATUSES.map((s) => (
                  <Text key={s} className='chip'
                        style={{ padding: '10rpx 20rpx', color: STATUS_STYLE[s].fg, background: STATUS_STYLE[s].bg,
                          opacity: r.status === s ? 1 : 0.85,
                          border: r.status === s ? `1px solid ${STATUS_STYLE[s].fg}` : '1px solid transparent' }}
                        onClick={() => setStatus(r.studentId, s)}>
                    {s}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
