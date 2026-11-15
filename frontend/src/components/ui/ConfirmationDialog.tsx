import { Button } from './Button'
import { Dialog } from './Dialog'

export function ConfirmationDialog({ open, title, description, confirmLabel = 'Xác nhận', cancelLabel = 'Hủy', destructive = false, busy = false, onConfirm, onCancel }: {
  open: boolean; title: string; description: string; confirmLabel?: string; cancelLabel?: string
  destructive?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return <Dialog open={open} title={title} onClose={onCancel} busy={busy}>
    <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    <div className="mt-6 flex justify-end gap-3">
      <Button variant="secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
      <Button variant={destructive ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  </Dialog>
}
