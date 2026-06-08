import Taro from '@tarojs/taro'
import { API_BASE, TOKEN_KEY } from './config'

export class ApiError extends Error {
  constructor(message: string, public status: number, public path: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type QueryValue = string | number | boolean | undefined

export function getToken(): string {
  return Taro.getStorageSync(TOKEN_KEY) || ''
}
export function setToken(t: string): void {
  Taro.setStorageSync(TOKEN_KEY, t)
}
export function clearToken(): void {
  Taro.removeStorageSync(TOKEN_KEY)
}

export function authHeader(): Record<string, string> {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

function qs(query?: Record<string, QueryValue>): string {
  if (!query) return ''
  const parts: string[] = []
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

type Opts = {
  method: HttpMethod
  path: string
  body?: unknown
  query?: Record<string, QueryValue>
}

/** 统一请求：注入 token，错误读 {detail}，401 清 token 跳登录。 */
export async function request<T>(opts: Opts): Promise<T> {
  const url = `${API_BASE}/api${opts.path}${qs(opts.query)}`
  const res = await Taro.request({
    url,
    method: opts.method,
    data: opts.body as any,
    header: { 'Content-Type': 'application/json', ...authHeader() },
  })
  const { statusCode, data } = res
  if (statusCode >= 200 && statusCode < 300) {
    return data as T
  }
  let message = `HTTP ${statusCode}`
  if (data && typeof (data as any).detail === 'string') message = (data as any).detail
  if (statusCode === 401 && !opts.path.startsWith('/auth/login') && !opts.path.startsWith('/wx/')) {
    clearToken()
    Taro.reLaunch({ url: '/pages/login/index' }).catch(() => {})
  }
  throw new ApiError(message, statusCode, opts.path)
}

/** 上传文件（假条附件）：multipart，字段名 file。 */
export async function uploadFile(path: string, filePath: string, formData: Record<string, string>): Promise<any> {
  const res = await Taro.uploadFile({
    url: `${API_BASE}/api${path}`,
    filePath,
    name: 'file',
    formData,
    header: authHeader(),
  })
  let parsed: any = {}
  try { parsed = JSON.parse(res.data) } catch { /* keep */ }
  if (res.statusCode >= 200 && res.statusCode < 300) return parsed
  throw new ApiError(parsed?.detail || `HTTP ${res.statusCode}`, res.statusCode, path)
}
