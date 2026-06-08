import { useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { wxLogin, wxBind } from '@/api/endpoints'
import { setToken } from '@/api/client'
import { saveUser } from '@/lib/auth'
import type { User } from '@/api/types'
import './index.scss'

export default function Login() {
  const [needBind, setNeedBind] = useState(false)
  const [code, setCode] = useState('')
  const [sid, setSid] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)

  const onLoggedIn = (user: User, token: string) => {
    setToken(token)
    saveUser(user)
    if (user.mustChangePassword) {
      Taro.redirectTo({ url: '/pages/change-password/index' })
    } else {
      Taro.reLaunch({ url: '/pages/me/index' })
    }
  }

  const doWxLogin = async () => {
    setBusy(true)
    try {
      const { code: c } = await Taro.login()
      setCode(c)
      const r = await wxLogin(c)
      if (r.needBind) {
        setNeedBind(true)
      } else if (r.user && r.token) {
        onLoggedIn(r.user, r.token)
      }
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '登录失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  useLoad(() => { void doWxLogin() })

  const doBind = async () => {
    if (!sid || !pw) return
    setBusy(true)
    try {
      // code 是一次性的，绑定时重新取一个
      const { code: c } = await Taro.login()
      const r = await wxBind(c, sid.trim(), pw)
      onLoggedIn(r.user, r.token)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '绑定失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className='login'>
      <View className='brand'>
        <Text className='brand-title'>晚点名</Text>
        <Text className='brand-sub'>每晚一次点名，出勤一目了然</Text>
      </View>

      {!needBind ? (
        <View className='card'>
          <Text className='muted'>{busy ? '微信登录中…' : '正在为你登录'}</Text>
          <View className='btn' style={{ marginTop: '24rpx' }} onClick={doWxLogin}>
            重新登录
          </View>
        </View>
      ) : (
        <View className='card'>
          <Text className='h2'>首次使用，请绑定学号</Text>
          <Text className='muted' style={{ display: 'block', margin: '12rpx 0 24rpx' }}>
            绑定后下次微信一键登录。初始密码为学号。
          </Text>
          <Text className='label'>学号 / 账号</Text>
          <Input className='input' value={sid} onInput={(e) => setSid(e.detail.value)}
                 placeholder='如 20231303001' />
          <Text className='label' style={{ marginTop: '20rpx' }}>密码</Text>
          <Input className='input' password value={pw} onInput={(e) => setPw(e.detail.value)} />
          <Button className='btn' style={{ marginTop: '28rpx' }} loading={busy}
                  disabled={busy || !sid || !pw} onClick={doBind}>
            绑定并登录
          </Button>
        </View>
      )}
    </View>
  )
}
