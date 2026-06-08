import { useState } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { myLeaves, cancelLeave } from '@/api/endpoints'
import type { LeaveRequest } from '@/api/types'
import { StatusChip } from '@/components/StatusChip'
import { LEAVE_STATUS_LABEL, LEAVE_STATUS_STYLE } from '@/lib/status'
import { API_BASE } from '@/api/config'
import { authHeader } from '@/api/client'
import { guard } from '@/lib/auth'

export default function LeaveList() {
  const [items, setItems] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { setItems(await myLeaves()) }
    catch (e: any) { Taro.showToast({ title: e?.message || '加载失败', icon: 'none' }) }
    finally { setLoading(false) }
  }
  useDidShow(() => { if (guard()) void load() })
  usePullDownRefresh(async () => { await load(); Taro.stopPullDownRefresh() })

  const preview = async (id: number) => {
    // 下载带鉴权的附件到临时文件再预览（图片 previewImage / 其它 openDocument）
    Taro.showLoading({ title: '加载中' })
    try {
      const res = await Taro.downloadFile({
        url: `${API_BASE}/api/me/leave-requests/${id}/attachment`,
        header: authHeader(),
      })
      Taro.hideLoading()
      if (res.statusCode !== 200) { Taro.showToast({ title: '附件获取失败', icon: 'none' }); return }
      const fp = res.tempFilePath
      if (/\.(jpg|jpeg|png|gif)$/i.test(fp)) {
        Taro.previewImage({ urls: [fp] })
      } else {
        Taro.openDocument({ filePath: fp, showMenu: true })
          .catch(() => Taro.previewImage({ urls: [fp] }).catch(() => Taro.showToast({ title: '无法预览', icon: 'none' })))
      }
    } catch {
      Taro.hideLoading(); Taro.showToast({ title: '附件获取失败', icon: 'none' })
    }
  }

  const doCancel = (id: number) => {
    Taro.showModal({ title: '撤回假条', content: '确认撤回这张待审批假条？', success: async (r) => {
      if (!r.confirm) return
      try { await cancelLeave(id); Taro.showToast({ title: '已撤回', icon: 'success' }); void load() }
      catch (e: any) { Taro.showToast({ title: e?.message || '撤回失败', icon: 'none' }) }
    } })
  }

  return (
    <View className='tabbar-pad'>
      <View className='card row' style={{ justifyContent: 'space-between' }}>
        <Text className='h2'>我的假条</Text>
        <Button className='btn' style={{ width: 'auto', padding: '12rpx 28rpx', fontSize: '26rpx' }}
                onClick={() => Taro.navigateTo({ url: '/pages/leave/new' })}>
          上传假条
        </Button>
      </View>

      {loading ? (
        <View className='card'><Text className='muted'>加载中…</Text></View>
      ) : items.length === 0 ? (
        <View className='card'><Text className='muted'>还没有提交过假条。</Text></View>
      ) : items.map((l) => {
        const st = LEAVE_STATUS_STYLE[l.status] || LEAVE_STATUS_STYLE.cancelled
        return (
          <View key={l.id} className='card'>
            <View className='row' style={{ gap: '12rpx', flexWrap: 'wrap' }}>
              <StatusChip status={l.type} />
              <Text>{l.startDate.slice(5)} ~ {l.endDate.slice(5)}</Text>
              <Text className='chip' style={{ color: st.fg, background: st.bg }}>
                {LEAVE_STATUS_LABEL[l.status] || l.status}
              </Text>
            </View>
            <Text className='muted' style={{ display: 'block', marginTop: '12rpx' }}>{l.reason}</Text>
            {l.reviewComment ? (
              <Text className='faint' style={{ display: 'block', marginTop: '8rpx', fontSize: '24rpx' }}>
                审批意见：{l.reviewComment}
              </Text>
            ) : null}
            <View className='row' style={{ gap: '20rpx', marginTop: '16rpx' }}>
              {l.hasAttachment ? (
                <Text style={{ color: 'var(--link)', fontSize: '26rpx' }} onClick={() => preview(l.id)}>
                  查看证明材料
                </Text>
              ) : null}
              {l.status === 'pending' ? (
                <Text style={{ color: 'var(--fg-muted)', fontSize: '26rpx' }} onClick={() => doCancel(l.id)}>
                  撤回
                </Text>
              ) : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}
