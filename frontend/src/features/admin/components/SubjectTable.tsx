import { Link } from 'react-router'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { Subject } from '../types/contracts'
import { formatDate } from '../utils/adminErrors'

export function SubjectTable({ rows, onStatus }: { rows: Subject[]; onStatus: (subject: Subject) => void }) {
  return <DataTable rows={rows} getRowKey={(row) => row.id} emptyTitle="Không tìm thấy môn học"
    emptyDescription="Hãy điều chỉnh bộ lọc hoặc thêm môn học mới." columns={[
      { key: 'code', header: 'Mã môn học', render: (row) => <Link className="font-semibold text-brand-700 hover:underline" to={'/admin/subjects/' + row.id}>{row.code}</Link> },
      { key: 'name', header: 'Tên môn học', render: (row) => row.name },
      { key: 'status', header: 'Trạng thái', render: (row) => <Badge tone={row.isActive ? 'success' : 'neutral'}>{row.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'}</Badge> },
      { key: 'created', header: 'Ngày tạo', render: (row) => formatDate(row.createdAt) },
      { key: 'actions', header: 'Thao tác', render: (row) => <div className="flex flex-wrap gap-1">
        <Link to={'/admin/subjects/' + row.id} className="rounded-lg px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">Chi tiết / sửa</Link>
        <Button variant="ghost" className="min-h-9 px-3 text-xs" aria-label={(row.isActive ? 'Ngừng hoạt động: ' : 'Kích hoạt: ') + row.name}
          onClick={() => onStatus(row)}>{row.isActive ? 'Ngừng hoạt động' : 'Kích hoạt'}</Button>
      </div> },
    ]} />
}
