import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { myAttendance } from '@/api/endpoints'
import type { AbnormalRow, WeekGridRow } from '@/api/types'
import { StatusChip } from '@/components/StatusChip'
import { visibleDayCols } from '@/lib/status'
import { getUser, guard } from '@/lib/auth'
import './index.scss'

export default function MeAttendance() {
  const [grid, setGrid] = useState<WeekGridRow[]>([])
  const [abnormal, setAbnormal] = useState<AbnormalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notStudent, setNotStudent] = useState(false)
  const user = getUser()

  const load = async () => {
    setLoading(true)
    try {
      const r = await myAttendance()
      setGrid(r.grid)
      setAbnormal(r.abnormal)
    } catch (e: any) {
      if (e?.status === 403 && /学籍/.test(e?.message || '')) setNotStudent(true)
      else Taro.showToast({ title: e?.message || '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => { if (guard()) void load() })
  usePullDownRefresh(async () => { await load(); Taro.stopPullDownRefresh() })

  const cols = visibleDayCols(grid)
  // 最新周置顶（后端按周次升序返回）
  const orderedGrid = [...grid].sort((a, b) =>
    a.term === b.term ? b.weekNo - a.weekNo : (a.term < b.term ? 1 : -1))

  return (
    <View>
      <View className='card'>
        <Text className='h2'>我的考勤</Text>
        <Text className='muted' style={{ display: 'block', marginTop: '6rpx' }}>
          {user?.name} · {user?.className}
        </Text>
      </View>

      {notStudent ? (
        <View className='card'><Text className='muted'>当前账号未关联学生学籍，请用网页版管理功能。</Text></View>
      ) : loading ? (
        <View className='card'><Text className='muted'>加载中…</Text></View>
      ) : grid.length === 0 ? (
        <View className='card'><Text className='muted'>还没有考勤记录（学期尚未开周）。</Text></View>
      ) : (
        <View className='card'>
          <View className='grid-head'>
            <Text className='gcell gweek faint'>周次</Text>
            {cols.map((c) => <Text key={c.key} className='gcell faint'>{c.label}</Text>)}
          </View>
          {orderedGrid.map((row) => (
            <View key={`${row.term}-${row.weekNo}`} className='grid-row'>
              <Text className='gcell gweek muted'>{row.weekNo}周</Text>
              {cols.map((c) => (
                <View key={c.key} className='gcell'>
                  <StatusChip status={row[c.key]} muted />
                </View>
              ))}
            </View>
          ))}
          <Text className='faint' style={{ fontSize: '22rpx', marginTop: '12rpx', display: 'block' }}>
            · 表示无异常；周五/六默认不点名
          </Text>
        </View>
      )}

      {abnormal.length > 0 && (
        <View className='card'>
          <Text className='label'>异常明细</Text>
          {abnormal.map((a) => (
            <View key={a.date} className='row' style={{ gap: '12rpx', marginTop: '12rpx' }}>
              <Text className='muted' style={{ fontSize: '24rpx' }}>{a.date.slice(5)}</Text>
              <StatusChip status={a.status} />
              {a.reason ? <Text className='faint' style={{ fontSize: '22rpx' }}>{a.reason}</Text> : null}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
