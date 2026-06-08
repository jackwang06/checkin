import { useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { changePassword } from '@/api/endpoints'
import { getUser, saveUser } from '@/lib/auth'

export default function ChangePassword() {
  const user = getUser()
  const forced = !!user?.mustChangePassword
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (next !== confirm) { Taro.showToast({ title: '两次新密码不一致', icon: 'none' }); return }
    if (next.length < 8) { Taro.showToast({ title: '新密码至少 8 位', icon: 'none' }); return }
    setBusy(true)
    try {
      await changePassword(cur, next)
      if (user) saveUser({ ...user, mustChangePassword: false })
      Taro.showToast({ title: '密码已修改', icon: 'success' })
      setTimeout(() => Taro.reLaunch({ url: '/pages/me/index' }), 600)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '修改失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <View>
      <View className='card'>
        <Text className='h2'>修改密码</Text>
        {forced && (
          <Text className='chip' style={{ display: 'block', margin: '16rpx 0', color: '#d9730d',
            background: 'rgba(217,115,13,0.12)', padding: '14rpx 18rpx', borderRadius: '12rpx' }}>
            首次登录需修改初始密码后才能继续使用
          </Text>
        )}
        <Text className='label' style={{ marginTop: '16rpx' }}>当前密码</Text>
        <Input className='input' password value={cur} onInput={(e) => setCur(e.detail.value)} />
        <Text className='label' style={{ marginTop: '20rpx' }}>新密码（至少 8 位，不能与学号相同）</Text>
        <Input className='input' password value={next} onInput={(e) => setNext(e.detail.value)} />
        <Text className='label' style={{ marginTop: '20rpx' }}>确认新密码</Text>
        <Input className='input' password value={confirm} onInput={(e) => setConfirm(e.detail.value)} />
        <Button className='btn' style={{ marginTop: '28rpx' }} loading={busy}
                disabled={busy || !cur || !next || !confirm} onClick={submit}>
          确认修改
        </Button>
        {!forced && (
          <View className='btn-outline' style={{ marginTop: '16rpx' }}
                onClick={() => Taro.navigateBack().catch(() => Taro.reLaunch({ url: '/pages/profile/index' }))}>
            取消
          </View>
        )}
      </View>
    </View>
  )
}
