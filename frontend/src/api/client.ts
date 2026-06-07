/**
 * 单一 fetcher（裁剪自 Aurash client.ts）：
 * - 同源 /api 前缀；dev 由 vite proxy 转发到 127.0.0.1:8002
 * - 自动携带 Authorization: Bearer <token>（localStorage）
 * - 错误约定 {detail: string}（FastAPI），抛 ApiError
 * - 401 时清 token 并跳登录页（会话过期统一处理）
 */

export const TOKEN_KEY = 'checkin.token'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export class ApiError extends Error {
  override readonly name = 'ApiError'
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message)
  }
}

export type QueryValue = string | number | boolean | undefined

type RequestOpts = {
  method: HttpMethod
  path: string
  body?: unknown
  query?: Record<string, QueryValue>
}

export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function request<T>(opts: RequestOpts): Promise<T> {
  const url = new URL(`/api${opts.path}`, window.location.origin)
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
    }
  }
  const isFormData = opts.body instanceof FormData
  const init: RequestInit = {
    method: opts.method,
    headers: isFormData
      ? { ...authHeaders() }
      : { 'Content-Type': 'application/json', ...authHeaders() },
  }
  if (opts.body !== undefined) {
    init.body = isFormData ? (opts.body as FormData) : JSON.stringify(opts.body)
  }
  const res = await fetch(url, init)
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { detail?: unknown } | null
      if (body && typeof body.detail === 'string' && body.detail.length > 0) {
        message = body.detail
      }
    } catch {
      /* keep fallback */
    }
    if (res.status === 401 && !opts.path.startsWith('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    throw new ApiError(message, res.status, opts.path)
  }
  return (res.status === 204 ? null : await res.json()) as T
}

/** 受保护文件（附件/CSV）下载：fetch 带 token → Blob。 */
export async function fetchBlob(path: string): Promise<Blob> {
  const res = await fetch(`/api${path}`, { headers: authHeaders() })
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status, path)
  return res.blob()
}

/** 触发浏览器下载。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
