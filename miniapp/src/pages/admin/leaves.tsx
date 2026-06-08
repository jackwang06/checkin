import { useState } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { listLeaves, reviewLeave } from '@/api/endpoints'
import type { LeaveRequest } from '@/api/types'
import { StatusChip } from '@/components/StatusChip'
import { API_BASE } from '@/api/config'
import { authHeader } from '@/api/client'
import { guard } from '@/lib/auth'

const TABS = [
  { k: 'pending', label: '待审批' },
  { k: 'approved', label: '已批准' },
  { k: 'rejected', label: '已驳回' },
]

export default function AdminLeaves() {
  const [tab, setTab] = useState('pending')
  const [items, setItems] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)

  const load = async (status = tab) => {
    setLoading(true)
    try { setItems((await listLeaves({ status, page_size: 50 })).items) }
    catch (e: any) { Taro.showToast({ title: e?.message || '加载失败', icon: 'none' }) }
    finally { setLoading(false) }
  }
  useDidShow(() => { if (guard()) void load() })

  const preview = async (id: number) => {
    Taro.showLoading({ title: '加载中' })
    try {
      const res = await Taro.downloadFile({ url: `${API_BASE}/api/leave-requests/${id}/attachment`, header: authHeader() })
      Taro.hideLoading()
      if (res.statusCode !== 200) { Taro.showToast({ title: '附件获取失败', icon: 'none' }); return }
      const fp = res.tempFilePath
      if (/\.(jpg|jpeg|png|gif)$/i.test(fp)) Taro.previewImage({ urls: [fp] })
      else Taro.openDocument({ filePath: fp, showMenu: true }).catch(() => Taro.previewImage({ urls: [fp] }).catch(() => {}))
    } catch { Taro.hideLoading(); Taro.showToast({ title: '附件获取失败', icon: 'none' }) }
  }

  const review = (l: LeaveRequest, decision: 'approved' | 'rejected') => {
    Taro.showModal({
      title: decision === 'approved' ? '批准假条' : '驳回假条',
      content: `${l.studentName || l.studentId} ${l.type} ${l.startDate}~${l.endDate}`,
      editable: true, placeholderText: '审批意见（可选）',
      success: async (r) => {
        if (!r.confirm) return
        try {
          const res = await reviewLeave(l.id, decision, r.content || undefined)
          const rep = res.report
          let msg = decision === 'approved' ? '已批准' : '已驳回'
          if (rep?.pendingDates?.length) msg += `，${rep.pendingDates.length}天未开周待回填`
          Taro.showToast({ title: msg, icon: 'success' })
          void load()
        } catch (e: any) { Taro.showToast({ title: e?.message || '失败', icon: 'none' }) }
      },
    })
  }

  return (
    <View>
      <View className='card row' style={{ gap: '16rpx' }}>
        {TABS.map((t) => (
          <Text key={t.k} className='chip'
                style={{ padding: '12rpx 24rpx',
                  background: tab === t.k ? 'var(--fg)' : 'var(--bg-subtle)',
                  color: tab === t.k ? 'var(--bg)' : 'var(--fg-muted)' }}
                onClick={() => { setTab(t.k); void load(t.k) }}>
            {t.label}
          </Text>
        ))}
      </View>

      {loading ? (
        <View className='card'><Text className='muted'>加载中…</Text></View>
      ) : items.length === 0 ? (
        <View className='card'><Text className='muted'>没有假条。</Text></View>
      ) : items.map((l) => (
        <View key={l.id} className='card'>
          <View className='row' style={{ gap: '12rpx', flexWrap: 'wrap' }}>
            <Text className='h2' style={{ fontSize: '30rpx' }}>{l.studentName}</Text>
            <Text className='faint' style={{ fontSize: '22rpx' }}>{l.studentId}</Text>
            <StatusChip status={l.type} />
          </View>
          <Text className='muted' style={{ display: 'block', marginTop: '8rpx' }}>{l.className}</Text>
          <Text style={{ display: 'block', marginTop: '8rpx' }}>{l.startDate} ~ {l.endDate}
            {l.returnDate ? ` · 返校 ${l.returnDate}` : ''}</Text>
          <Text className='muted' style={{ display: 'block', marginTop: '8rpx' }}>{l.reason}</Text>
          {l.hasAttachment ? (
            <Text style={{ color: 'var(--link)', display: 'block', marginTop: '10rpx' }} onClick={() => preview(l.id)}>
              查看证明材料
            </Text>
          ) : null}
          {l.status === 'pending' ? (
            <View className='row' style={{ gap: '16rpx', marginTop: '18rpx' }}>
              <Button className='btn' style={{ flex: 1, fontSize: '28rpx', padding: '16rpx' }}
                      onClick={() => review(l, 'approved')}>批准</Button>
              <Button className='btn-outline' style={{ flex: 1 }} onClick={() => review(l, 'rejected')}>驳回</Button>
            </View>
          ) : (
            <Text className='faint' style={{ display: 'block', marginTop: '10rpx', fontSize: '22rpx' }}>
              {l.reviewedBy ? `${l.reviewedBy} 审批` : ''}{l.reviewComment ? ` · ${l.reviewComment}` : ''}
            </Text>
          )}
        </View>
      ))}
    </View>
  )
}
