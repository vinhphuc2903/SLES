import { Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ListParams } from '../types/contracts'

export function ListToolbar({ params, onFilter, placeholder }: {
  params: ListParams
  onFilter: (search: string, status: string, pageSize: string) => void
  placeholder: string
}) {
  return <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4"
    key={[params.search, params.isActive, params.pageSize].join('|')}
    onSubmit={(event) => {
      event.preventDefault()
      const values = new FormData(event.currentTarget)
      onFilter(String(values.get('search') ?? ''), String(values.get('status') ?? ''), String(values.get('pageSize')))
    }}>
    <label className="min-w-48 flex-1 text-sm font-medium text-slate-700">
      Tìm kiếm
      <input name="search" type="search" defaultValue={params.search ?? ''} placeholder={placeholder}
        className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal focus:outline-brand-500" />
    </label>
    <label className="text-sm font-medium text-slate-700">Trạng thái
      <select name="status" defaultValue={params.isActive === undefined ? '' : String(params.isActive)}
        className="mt-1.5 block min-h-11 rounded-xl border border-slate-200 bg-white px-3">
        <option value="">Tất cả</option><option value="true">Đang hoạt động</option><option value="false">Ngừng hoạt động</option>
      </select>
    </label>
    <label className="text-sm font-medium text-slate-700">Mỗi trang
      <select name="pageSize" defaultValue={params.pageSize} className="mt-1.5 block min-h-11 rounded-xl border border-slate-200 bg-white px-3">
        {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
      </select>
    </label>
    <Button type="submit"><Search className="size-4" />Tìm kiếm</Button>
  </form>
}
