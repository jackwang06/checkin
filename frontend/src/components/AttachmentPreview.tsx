import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { fetchBlob } from '@/api/client'

/** 证明材料预览：应用内 Dialog（× / 遮罩 / Esc 都能关，关闭即释放 objectURL）。
 *  scope='me' 用学生端鉴权路径，'admin' 用管理端路径。 */
export function AttachmentPreview({
  leaveId,
  scope,
  open,
  onOpenChange,
}: {
  leaveId: number | null
  scope: 'me' | 'admin'
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [type, setType] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || leaveId == null) return
    let revoked: string | null = null
    let cancelled = false
    setLoading(true)
    const path =
      scope === 'me'
        ? `/me/leave-requests/${leaveId}/attachment`
        : `/leave-requests/${leaveId}/attachment`
    fetchBlob(path)
      .then((blob) => {
        if (cancelled) return
        const u = URL.createObjectURL(blob)
        revoked = u
        setUrl(u)
        setType(blob.type)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('附件获取失败')
          onOpenChange(false)
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
      setUrl(null)
      setType('')
    }
  }, [open, leaveId, scope, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            证明材料
            {url && (
              <a href={url} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1 text-xs font-normal text-link hover:underline">
                <ExternalLink size={12} /> 新标签打开
              </a>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto rounded-md bg-bg-subtle">
          {loading && <p className="p-8 text-center text-sm text-fg-muted">加载中…</p>}
          {!loading && url && type.startsWith('image/') && (
            <img src={url} alt="证明材料" className="mx-auto max-w-full" />
          )}
          {!loading && url && type === 'application/pdf' && (
            <iframe src={url} title="证明材料" className="h-[70vh] w-full" />
          )}
          {!loading && url && !type.startsWith('image/') && type !== 'application/pdf' && (
            <p className="p-8 text-center text-sm">
              <a href={url} download className="text-link hover:underline">下载附件</a>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
