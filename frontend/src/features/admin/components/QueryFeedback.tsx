import { ErrorState } from '@/components/feedback/ErrorState'
import { adminError } from '../utils/adminErrors'

export function ListSkeleton() {
  return <div role="status" aria-label="Đang tải dữ liệu" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
    {[1, 2, 3, 4].map((row) => <div key={row} className="h-12 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />)}
    <span className="sr-only">Đang tải dữ liệu...</span>
  </div>
}

export function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  const failure = adminError(error)
  return <ErrorState title={failure.status === 404 ? 'Không tìm thấy bản ghi' : 'Không thể tải dữ liệu'}
    description={failure.message} onRetry={failure.status === 403 || failure.status === 404 ? undefined : retry} />
}
