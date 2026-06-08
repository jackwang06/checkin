import { useState } from 'react'
import { View, Text, Picker } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { listWeeks, stats } from '@/api/endpoints'
import type { StatsRow, Week } from '@/api/types'
import { guard } from '@/lib/auth'

type Drill = { level: 'grade' } | { level: 'major'; grade: string } | { level: 'class'; grade: string; major: string }

export default function AdminStats() {
  const [weeks, setWeeks] = useState<Week[]>([])
  const [weekIdx, setWeekIdx] = useState(-1)
  const [overall, setOverall] = useState<StatsRow | null>(null)
  const [drill, setDrill] = useState<Drill>({ level: 'grade' })
  const [rows, setRows] = useState<StatsRow[]>([])

  const reload = async (wi: number, d: Drill) => {
    if (wi < 0) return
    const w = weeks[wi]
    const base = { term: w.term, week_no: w.weekNo }
    try {
      const [ov, list] = await Promise.all([
        stats({ ...base, level: 'overall' }),
        stats({
          ...base, level: d.level,
          grade: 'grade' in d ? d.grade : undefined,
          major: d.level === 'class' ? d.major : undefined,
        }),
      ])
      setOverall(ov[0] || null); setRows(list)
    } catch (e: any) { Taro.showToast({ title: e?.message || '加载失败', icon: 'none' }) }
  }

  useLoad(() => {
    if (!guard()) return
    listWeeks().then((w) => {
      setWeeks(w)
      if (w.length) { const i = w.length - 1; setWeekIdx(i); reload(i, { level: 'grade' }) }
    }).catch((e) => Taro.showToast({ title: e?.message || '加载失败', icon: 'none' }))
  })

  const go = (d: Drill) => { setDrill(d); reload(weekIdx, d) }

  const crumbs = (): { label: string; d: Drill }[] => {
    const items: { label: string; d: Drill }[] = [{ label: '全体', d: { level: 'grade' } }]
    if (drill.level !== 'grade') items.push({ label: `${(drill as any).grade}级`, d: { level: 'major', grade: (drill as any).grade } })
    if (drill.level === 'class') items.push({ label: (drill as any).major, d: drill })
    return items
  }

  const rowName = (r: StatsRow) =>
    drill.level === 'grade' ? `${r.grade}级` : drill.level === 'major' ? r.major : r.className

  const onRow = (r: StatsRow) => {
    if (drill.level === 'grade' && r.grade) go({ level: 'major', grade: r.grade })
    else if (drill.level === 'major' && r.grade && r.major) go({ level: 'class', grade: r.grade, major: r.major })
  }

  return (
    <View>
      <View className='card'>
        <Text className='label'>周次</Text>
        <Picker mode='selector' range={weeks.map((w) => `第${w.weekNo}周 (${w.startDate})`)} value={weekIdx}
                onChange={(e) => { const i = Number(e.detail.value); setWeekIdx(i); reload(i, drill) }}>
          <View className='input'>{weekIdx >= 0 ? `第${weeks[weekIdx].weekNo}周` : '选择周次'}</View>
        </Picker>
      </View>

      {overall && (
        <View className='card'>
          <View className='row' style={{ justifyContent: 'space-between' }}>
            <Text className='muted'>应到 {overall.total}</Text>
            <Text className='h2' style={{ color: '#0f7b6c' }}>出勤率 {overall.rate}%</Text>
          </View>
          <View className='row' style={{ gap: '20rpx', marginTop: '12rpx', flexWrap: 'wrap' }}>
            <Text className='faint'>公假 {overall.publicLeave}</Text>
            <Text className='faint'>事假 {overall.personalLeave}</Text>
            <Text className='faint'>旷到 {overall.truant}</Text>
            <Text className='faint'>失联 {overall.lost}</Text>
          </View>
        </View>
      )}

      <View className='card'>
        <View className='row' style={{ gap: '8rpx', flexWrap: 'wrap', marginBottom: '12rpx' }}>
          {crumbs().map((c, i, arr) => (
            <Text key={c.label} onClick={() => go(c.d)}
                  style={{ color: i === arr.length - 1 ? 'var(--fg)' : 'var(--link)', fontSize: '30rpx' }}>
              {c.label}{i < arr.length - 1 ? ' ›' : ''}
            </Text>
          ))}
          <Text className='faint' style={{ fontSize: '26rpx' }}>（点行下钻）</Text>
        </View>
        {rows.map((r) => (
          <View key={rowName(r)} className='row'
                style={{ justifyContent: 'space-between', padding: '18rpx 0', borderBottom: '1px solid var(--border)' }}
                onClick={() => onRow(r)}>
            <Text>{rowName(r)}</Text>
            <View className='row' style={{ gap: '18rpx' }}>
              <Text className='faint' style={{ fontSize: '28rpx' }}>应{r.total}</Text>
              <Text style={{ color: '#0f7b6c' }}>{r.rate}%</Text>
            </View>
          </View>
        ))}
        {rows.length === 0 ? <Text className='muted'>暂无数据</Text> : null}
      </View>
    </View>
  )
}
