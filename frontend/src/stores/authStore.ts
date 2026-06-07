/** 认证状态（裁剪自 Aurash authStore：删 guest 态，加 role 便捷判断）。 */

import { create } from 'zustand'
import * as api from '@/api/endpoints'
import { TOKEN_KEY } from '@/api/client'
import type { User } from '@/api/types'

export type AuthState = {
  user: User | null
  token: string | null
  /** boot 时从 localStorage 恢复会话是否已完成 */
  hydrated: boolean
  login: (id: string, password: string) => Promise<User>
  logout: () => void
  /** 改密成功后本地清掉强制改密标记 */
  passwordChanged: () => void
  hydrateFromToken: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  hydrated: false,
  login: async (id, password) => {
    const { user, token } = await api.login(id, password)
    localStorage.setItem(TOKEN_KEY, token)
    set({ user, token, hydrated: true })
    return user
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ user: null, token: null })
  },
  passwordChanged: () => {
    const u = get().user
    if (u) set({ user: { ...u, mustChangePassword: false } })
  },
  hydrateFromToken: async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      set({ hydrated: true })
      return
    }
    try {
      const user = await api.me()
      set({ user, token, hydrated: true })
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      set({ user: null, token: null, hydrated: true })
    }
  },
}))

export const isAdmin = (u: User | null): boolean =>
  u?.role === 'admin' || u?.role === 'superadmin'
