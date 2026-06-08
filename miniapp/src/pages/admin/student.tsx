import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { searchStudents, studentReport, resetPassword } from '@/api/endpoints'
import type { StudentHit, StudentReport } from '@/api/types'
import { StatusChip } from '@/components/StatusChip'
import { visibleDayCols } from '@/lib/status'
import { guard } from '@/lib/auth'

export default function AdminStudent() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<StudentHit[]>([])
  const [report, setReport] = useState<StudentReport | null>(null)
  const [searching, setSearching] = useState(false)

  useLoad(() => { guard() })

  const doSearch = async (v: string) => {
    setQ(v); setReport(null)
    if (v.trim().length < 2) { setHits([]); return }
    setSearching(true)
    try { setHits(await searchStudents(v.trim())) }
    catch (e: any) { Taro.showToast({ title: e?.message || '搜索失败', icon: 'none' }) }
    finally { setSearching(false) }
  }

  const openReport = async (sid: string) => {
    try { setReport(await studentReport(sid)); setHits([]) }
    catch (e: any) { Taro.showToast({ title: e?.message || '加载失败', icon: 'none' }) }
  }

  const doReset = (sid: string, name: string) => {
    Taro.showModal({ title: '重置密码', content: `重置 ${name}(${sid}) 的密码为学号，下次登录需改密？`,
      success: async (r) => {
        if (!r.confirm) return
        try { const res = await resetPassword(sid); Taro.showToast({ title: '已重置', icon: 'success' }); void res }
        catch (e: any) { Taro.showToast({ title: e?.message || '失败', icon: 'none' }) }
      } })
  }

  const cols = report ? visibleDayCols(report.grid) : []

  return (
    <View>
      <View className='card'>
        <Input className='input' value={q} placeholder='输入学号或姓名（≥2 字）'
               onInput={(e) => doSearch(e.detail.value)} />
      </View>

      {!report && hits.map((s) => (
        <View key={s.id} className='card row' style={{ justifyContent: 'space-between' }} onClick={() => openReport(s.id)}>
          <View className='row' style={{ gap: '12rpx' }}>
            <Text>{s.name}</Text>
            <Text className='faint' style={{ fontSize: '22rpx' }}>{s.id}</Text>
          </View>
          <Text className='muted' style={{ fontSize: '24rpx' }}>{s.className}</Text>
        </View>
      ))}
      {!report && !searching && q.trim().length >= 2 && hits.length === 0 ? (
        <View className='card'><Text className='muted'>无匹配学生</Text></View>
      ) : null}

      {report && (
        <View>
          <View className='card'>
            <View className='row' style={{ justifyContent: 'space-between' }}>
              <View>
                <Text className='h2'>{report.student.name}</Text>
                <Text className='muted' style={{ display: 'block', marginTop: '6rpx', fontSize: '24rpx' }}>
                  {report.student.grade}级 {report.student.major} · {report.student.className}
                </Text>
              </View>
              <Text className='btn-outline' style={{ padding: '12rpx 22rpx', fontSize: '24rpx' }}
                    onClick={() => doReset(report.student.id, report.student.name)}>重置密码</Text>
            </View>
          </View>
          <View className='card'>
            {report.grid.length === 0 ? <Text className='muted'>无考勤记录</Text> : (
              <View>
                <View className='row' style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10rpx' }}>
                  <Text className='faint' style={{ flex: '0 0 90rpx', fontSize: '24rpx' }}>周次</Text>
                  {cols.map((c) => <Text key={c.key} className='faint' style={{ flex: 1, textAlign: 'center', fontSize: '24rpx' }}>{c.label}</Text>)}
                </View>
                {report.grid.map((row) => (
                  <View key={`${row.term}-${row.weekNo}`} className='row' style={{ padding: '12rpx 0', borderBottom: '1px solid var(--border)' }}>
                    <Text className='muted' style={{ flex: '0 0 90rpx', fontSize: '24rpx' }}>{row.weekNo}周</Text>
                    {cols.map((c) => (
                      <View key={c.key} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                        <StatusChip status={row[c.key]} muted />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>
          {report.abnormal.length > 0 && (
            <View className='card'>
              <Text className='label'>异常明细</Text>
              {report.abnormal.map((a) => (
                <View key={a.date} className='row' style={{ gap: '12rpx', marginTop: '12rpx' }}>
                  <Text className='muted' style={{ fontSize: '24rpx' }}>{a.date.slice(5)}</Text>
                  <StatusChip status={a.status} />
                  {a.reason ? <Text className='faint' style={{ fontSize: '22rpx' }}>{a.reason}</Text> : null}
                </View>
              ))}
            </View>
          )}
          <View className='card'><Text style={{ color: 'var(--link)' }} onClick={() => setReport(null)}>← 返回搜索</Text></View>
        </View>
      )}
    </View>
  )
}
