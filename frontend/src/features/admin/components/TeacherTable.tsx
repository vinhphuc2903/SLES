import { Link } from 'react-router'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { Teacher } from '../types/contracts'
import { formatDate } from '../utils/adminErrors'

export interface TeacherOperation { teacher: Teacher; kind: 'status' | 'reset' }

export function TeacherTable({ rows, onAction }: { rows: Teacher[]; onAction: (operation: TeacherOperation) => void }) {
  return <DataTable rows={rows} getRowKey={(row) => row.id} emptyTitle="Không tìm thấy giáo viên"
    emptyDescription="Hãy điều chỉnh bộ lọc hoặc tạo tài khoản giáo viên mới." columns={[
      { key: 'username', header: 'Tên đăng nhập', render: (row) => <Link className="font-semibold text-brand-700 hover:underline" to={'/admin/teachers/' + row.id}>{row.username}</Link> },
      { key: 'fullName', header: 'Họ và tên', render: (row) => row.fullName },
      { key: 'contact', header: 'Liên hệ', render: (row) => <div className="min-w-40 break-all"><p>{row.email ?? 'Chưa có email'}</p><p className="mt-1 text-xs text-slate-500">{row.phone ?? 'Chưa có số điện thoại'}</p></div> },
      { key: 'status', header: 'Trạng thái', render: (row) => <Badge tone={row.isActive ? 'success' : 'neutral'}>{row.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'}</Badge> },
      { key: 'created', header: 'Ngày tạo', render: (row) => <span className="whitespace-nowrap">{formatDate(row.createdAt)}</span> },
      { key: 'actions', header: 'Thao tác', render: (row) => <div className="flex min-w-52 flex-wrap gap-1">
        <Link to={'/admin/teachers/' + row.id} className="rounded-lg px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">Chi tiết / sửa</Link>
        <Button variant="ghost" className="min-h-9 px-3 text-xs" aria-label={(row.isActive ? 'Ngừng hoạt động: ' : 'Kích hoạt: ') + row.fullName}
          onClick={() => onAction({ teacher: row, kind: 'status' })}>{row.isActive ? 'Ngừng hoạt động' : 'Kích hoạt'}</Button>
        <Button variant="ghost" className="min-h-9 px-3 text-xs" aria-label={'Đặt lại mật khẩu: ' + row.fullName}
          onClick={() => onAction({ teacher: row, kind: 'reset' })}>Đặt lại mật khẩu</Button>
      </div> },
    ]} />
}
