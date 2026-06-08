import { useEffect, useState } from 'react'
import { View, Image, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getUser, isAdmin } from '@/lib/auth'
import './index.scss'

type Item = {
  pagePath: string
  text: string
  icon: string
  active: string
  adminOnly?: boolean
}

const ITEMS: Item[] = [
  { pagePath: '/pages/me/index', text: '我的考勤',
    icon: require('@/assets/tabbar/attendance.png'), active: require('@/assets/tabbar/attendance-active.png') },
  { pagePath: '/pages/leave/list', text: '假条',
    icon: require('@/assets/tabbar/leave.png'), active: require('@/assets/tabbar/leave-active.png') },
  { pagePath: '/pages/admin/rollcall', text: '点名', adminOnly: true,
    icon: require('@/assets/tabbar/rollcall.png'), active: require('@/assets/tabbar/rollcall-active.png') },
  { pagePath: '/pages/profile/index', text: '我的',
    icon: require('@/assets/tabbar/me.png'), active: require('@/assets/tabbar/me-active.png') },
]

function currentPath(): string {
  const ps = Taro.getCurrentPages()
  return ps.length ? `/${ps[ps.length - 1].route}` : '/pages/me/index'
}

export default function CustomTabBar() {
  // 自定义 tabBar 是单实例、切页不重挂载；改由各 tab 页 onShow 广播 'tabbar:change' 来驱动高亮。
  const [cur, setCur] = useState(currentPath())
  useEffect(() => {
    const h = (p: string) => setCur(p)
    Taro.eventCenter.on('tabbar:change', h)
    return () => Taro.eventCenter.off('tabbar:change', h)
  }, [])

  const admin = isAdmin(getUser())
  const items = ITEMS.filter((it) => !it.adminOnly || admin)

  const onTap = (path: string) => {
    if (path === cur) return
    setCur(path) // 立即高亮，避免等待 onShow 广播的视觉延迟
    Taro.switchTab({ url: path })
  }

  return (
    <View className='tabbar'>
      {items.map((it) => {
        const on = cur === it.pagePath
        return (
          <View key={it.pagePath} className='tabbar-item' onClick={() => onTap(it.pagePath)}>
            <Image className='tabbar-icon' src={on ? it.active : it.icon} />
            <Text className='tabbar-text' style={{ color: on ? '#2383e2' : '#787774' }}>{it.text}</Text>
          </View>
        )
      })}
    </View>
  )
}
