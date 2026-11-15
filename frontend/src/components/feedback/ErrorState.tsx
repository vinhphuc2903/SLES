import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function ErrorState({ title = 'Không thể tải dữ liệu', description = 'Đã xảy ra lỗi khi kết nối. Vui lòng thử lại.', onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50/70 px-6 py-10 text-center"><TriangleAlert className="mx-auto size-8 text-rose-600" /><h2 className="mt-3 font-semibold text-slate-900">{title}</h2><p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{description}</p>{onRetry && <Button variant="secondary" className="mt-4" onClick={onRetry}>Thử lại</Button>}</div>
}
