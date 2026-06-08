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

export default function CustomTabBar() {
  const admin = isAdmin(getUser())
  const items = ITEMS.filter((it) => !it.adminOnly || admin)

  const pages = Taro.getCurrentPages()
  const cur = pages.length ? `/${pages[pages.length - 1].route}` : '/pages/me/index'

  const onTap = (path: string) => {
    if (path === cur) return
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
