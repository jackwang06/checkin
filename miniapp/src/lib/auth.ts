import Taro from '@tarojs/taro'
import type { User } from '@/api/types'
import { getToken } from '@/api/client'

const USER_KEY = 'checkin.user'

export function saveUser(u: User): void {
  Taro.setStorageSync(USER_KEY, u)
}
export function getUser(): User | null {
  return (Taro.getStorageSync(USER_KEY) as User) || null
}
export function clearUser(): void {
  Taro.removeStorageSync(USER_KEY)
}
export function isAdmin(u: User | null): boolean {
  return u?.role === 'admin' || u?.role === 'superadmin'
}

/** 页面 onShow 调用：未登录跳登录；强制改密跳改密页。返回 true 表示可继续渲染。 */
export function guard(): boolean {
  if (!getToken()) {
    Taro.reLaunch({ url: '/pages/login/index' })
    return false
  }
  const u = getUser()
  if (u?.mustChangePassword) {
    Taro.redirectTo({ url: '/pages/change-password/index' })
    return false
  }
  return true
}
