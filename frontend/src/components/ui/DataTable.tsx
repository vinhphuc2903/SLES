import type { ReactNode } from 'react'
import { EmptyState } from '@/components/feedback/EmptyState'

export interface TableColumn<T> { key: string; header: string; render: (row: T) => ReactNode; className?: string }

export function DataTable<T>({ rows, columns, getRowKey, emptyTitle = 'Chưa có dữ liệu', emptyDescription = 'Dữ liệu sẽ xuất hiện tại đây khi có sẵn.' }: { rows: T[]; columns: TableColumn<T>[]; getRowKey: (row: T) => string; emptyTitle?: string; emptyDescription?: string }) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />
  return <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[560px] border-collapse text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{columns.map((column) => <th key={column.key} scope="col" className={`px-4 py-3 font-semibold ${column.className ?? ''}`}>{column.header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 bg-white">{rows.map((row) => <tr key={getRowKey(row)} className="hover:bg-slate-50/70">{columns.map((column) => <td key={column.key} className={`px-4 py-3.5 text-slate-700 ${column.className ?? ''}`}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>
}
