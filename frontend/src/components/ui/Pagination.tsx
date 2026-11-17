import { useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'

export function Pagination({ page, pageSize, totalCount, onPageChange }: { page: number; pageSize: number; totalCount: number; onPageChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(totalCount / pageSize))
  useEffect(() => { if (page > pages) onPageChange(pages) }, [page, pages, onPageChange])
  return <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">{totalCount === 0 ? 'Chưa có kết quả' : `Trang ${page}/${pages} · ${totalCount} kết quả`}</p><div className="flex gap-2"><Button variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft className="size-4" /> Trước</Button><Button variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Sau <ChevronRight className="size-4" /></Button></div></div>
}
