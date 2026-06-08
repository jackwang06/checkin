import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getUser, isAdmin, clearUser, guard } from '@/lib/auth'
import { clearToken } from '@/api/client'
import type { User } from '@/api/types'

const ROLE_LABEL: Record<string, string> = { user: '学生', admin: '管理员', superadmin: '超级管理员' }

function Item({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <View className='row' style={{ justifyContent: 'space-between', padding: '26rpx 0',
      borderBottom: '1px solid var(--border)' }} onClick={onClick}>
      <Text>{title}</Text>
      <Text className='faint'>›</Text>
    </View>
  )
}

export default function Profile() {
  const [user, setUser] = useState<User | null>(getUser())
  useDidShow(() => { if (guard()) setUser(getUser()) })
  const admin = isAdmin(user)

  const go = (url: string) => Taro.navigateTo({ url })

  const logout = () => {
    Taro.showModal({ title: '退出登录', content: '确认退出？', success: (r) => {
      if (!r.confirm) return
      clearToken(); clearUser()
      Taro.reLaunch({ url: '/pages/login/index' })
    } })
  }

  return (
    <View>
      <View className='card'>
        <Text className='h1'>{user?.name}</Text>
        <Text className='muted' style={{ display: 'block', marginTop: '8rpx' }}>
          {ROLE_LABEL[user?.role || 'user']}{user?.className ? ` · ${user.className}` : ''}
        </Text>
      </View>

      {admin && (
        <View className='card'>
          <Text className='label'>管理</Text>
          <Item title='点名（按日改状态）' onClick={() => go('/pages/admin/rollcall')} />
          <Item title='假条核查' onClick={() => go('/pages/admin/leaves')} />
          <Item title='出勤统计' onClick={() => go('/pages/admin/stats')} />
          <Item title='学生查询 / 重置密码' onClick={() => go('/pages/admin/student')} />
          <Text className='faint' style={{ fontSize: '22rpx', marginTop: '16rpx', display: 'block' }}>
            班级周表批量、名单导入/导出、特殊日期、转班、年级、审计等请用网页版。
          </Text>
        </View>
      )}

      <View className='card'>
        <Item title='修改密码' onClick={() => go('/pages/change-password/index')} />
        <View className='row' style={{ justifyContent: 'space-between', padding: '26rpx 0' }} onClick={logout}>
          <Text style={{ color: '#e03e3e' }}>退出登录</Text>
        </View>
      </View>
    </View>
  )
}
