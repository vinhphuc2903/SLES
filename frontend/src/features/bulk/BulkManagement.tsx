import { useRef, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useCurrentUser'
import { apiClient } from '@/lib/api/apiClient'
import { managementError } from '@/features/teacher/management/utils'
import { Button } from '@/components/ui/Button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import type { TableColumn } from '@/components/ui/DataTable'

export interface BulkResult { requestedCount: number; successCount: number; failedCount: number; results: { id: string; success: boolean; code?: string; message?: string }[] }
interface Props<T extends { id: string }> {
  rows: T[]; scope: string; endpoint: string; action: string; consequence: string
  selectionLabel?: string; rowSelectionLabel?: string; disabled?: boolean
  extraActions?: (selection: { ids: string[]; busy: boolean }) => ReactNode
  role?: 'ADMIN' | 'TEACHER'; eligible: (row: T) => boolean; label: (row: T) => string
  children: (column: TableColumn<T> | null) => ReactNode
}
export function BulkManagement<T extends { id: string }>({ rows, scope, endpoint, action, consequence, role = 'TEACHER', eligible, label, children, selectionLabel, rowSelectionLabel = 'Chọn xử lý: ', disabled = false, extraActions }: Props<T>) {
  const { user } = useAuth(), client = useQueryClient(), lock = useRef(false)
  const identity = user?.id + ':' + endpoint
  const dataset = identity + ':' + scope + ':' + JSON.stringify(rows)
  const [selection, setSelection] = useState({ dataset, ids: [] as string[] })
  const [open, setOpen] = useState(false), [result, setResult] = useState<{ identity: string; value: BulkResult; labels: Record<string, string> } | null>(null)
  const [error, setError] = useState(''), [processing, setProcessing] = useState(false)
  // Reset synchronously so a changed page/filter cannot submit IDs from an old render.
  if (selection.dataset !== dataset) { setSelection({ dataset, ids: [] }); if (open) setOpen(false) }
  const ids = selection.dataset === dataset ? selection.ids : []
  const candidates = rows.filter(eligible).map(row => row.id)
  const mutation = useMutation({ mutationFn: async (chosen: string[]) => (await apiClient.post<BulkResult>(endpoint, { ids: chosen })).data, retry: false })
  const allowed = user?.role === role
  function select(next: string[]) { setSelection({ dataset, ids: next.slice(0, 100) }) }
  async function submit() {
    if (lock.current || disabled || !ids.length || !allowed) return
    lock.current = true; setProcessing(true); setError('')
    const labels = Object.fromEntries(rows.map(row => [row.id, label(row)]))
    try {
      const value = await mutation.mutateAsync(ids)
      setResult({ identity, value, labels }); select([]); setOpen(false)
      await client.invalidateQueries({ predicate: query => ['teacher', 'admin', 'student'].includes(String(query.queryKey[0])) })
    } catch (failure) { setError(managementError(failure)); setOpen(false) }
    finally { lock.current = false; setProcessing(false) }
  }
  const busy = disabled || processing || mutation.isPending
  const column: TableColumn<T> = {
    key: 'bulk-selection',
    header: <input type="checkbox" aria-label={selectionLabel ?? ('Chọn tất cả trên trang để ' + action.toLowerCase())} checked={candidates.length > 0 && candidates.every(id => ids.includes(id))}
      ref={element => { if (element) element.indeterminate = ids.length > 0 && !candidates.every(id => ids.includes(id)) }}
      disabled={busy || !candidates.length} onChange={event => select(event.target.checked ? candidates : [])} />,
    render: row => <input type="checkbox" aria-label={rowSelectionLabel + label(row)} title={eligible(row) ? 'Chọn bản ghi trên trang hiện tại' : 'Trạng thái không cho phép thao tác hàng loạt này'}
      disabled={busy || !eligible(row)} checked={ids.includes(row.id)} onChange={event => select(event.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id))} />,
  }
  return <div className="space-y-3">
    {allowed && <><div className="flex flex-wrap items-center gap-3" aria-label={'Thao tác hàng loạt: ' + action}>
      {extraActions?.({ ids, busy })}
      <span>Đã chọn: {ids.length} (chỉ trang hiện tại)</span>
      <Button variant="danger" disabled={busy || !ids.length} onClick={() => setOpen(true)}>{action}</Button>
      <Button variant="secondary" disabled={busy || !ids.length} onClick={() => select([])}>Bỏ chọn</Button>
    </div>
    {error && <p role="alert">{error}</p>}
    {result?.identity === identity && <section aria-label="Kết quả xử lý hàng loạt" role="status">
      <p>Thành công: {result.value.successCount} · Thất bại: {result.value.failedCount}</p>
      {result.value.results.filter(row => !row.success).map(row => <p key={row.id}>{result.labels[row.id] ?? row.id} ({row.id}): {row.message ?? row.code}</p>)}
    </section>}
    <ConfirmationDialog open={open} title={action} description={`${action}: ${ids.length} bản ghi. ${consequence} Bản ghi không đủ điều kiện sẽ được báo riêng.`}
      destructive confirmLabel="Xác nhận thao tác" busy={busy} onCancel={() => { if (!lock.current) setOpen(false) }} onConfirm={() => void submit()} />
    </>}
    {children(allowed ? column : null)}
  </div>
}
