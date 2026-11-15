import { Copy, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'

export interface TemporaryPassword { username: string; password: string }

export function TemporaryPasswordDialog({ secret, onClose }: {
  secret: TemporaryPassword | null; onClose: () => void
}) {
  if (!secret) return null
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret!.password)
      toast.success('Đã sao chép mật khẩu.')
    } catch { toast.error('Không thể sao chép. Vui lòng chọn và sao chép mật khẩu thủ công.') }
  }
  return <Dialog open title="Mật khẩu tạm thời" onClose={onClose}>
    <p className="mt-3 text-sm text-slate-600">Tài khoản: <strong className="text-slate-900">{secret.username}</strong></p>
    <label className="mt-5 block text-sm font-medium text-slate-700">Mật khẩu tạm thời
      <input readOnly autoComplete="off" value={secret.password}
        className="mt-2 w-full rounded-xl border border-brand-200 bg-brand-50 px-3 py-3 font-mono text-base text-slate-900"
        onFocus={(event) => event.target.select()} />
    </label>
    <div className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
      <ShieldCheck className="mt-1 size-4 shrink-0" />
      <p>Mật khẩu chỉ hiển thị lần này. Hãy chia sẻ qua kênh an toàn; người dùng cần đổi mật khẩu khi đăng nhập. Nếu đã sao chép, hãy xóa khỏi clipboard sau khi chia sẻ.</p>
    </div>
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <Button variant="secondary" onClick={copy}><Copy className="size-4" />Sao chép</Button>
      <Button onClick={onClose}>Đã lưu an toàn, đóng</Button>
    </div>
  </Dialog>
}
