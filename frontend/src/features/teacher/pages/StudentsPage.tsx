import { useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { Button } from '@/components/ui/Button'
import { ListSkeleton, QueryError } from '@/features/admin/components/QueryFeedback'
import { formatDate } from '@/features/admin/utils/adminErrors'
import { Filters } from '../components/Filters'
import { useFilters } from '../hooks/useFilters'
import { StudentOperations, type StudentOperation } from '../components/StudentOperations'
import { useGrades, useStudents } from '../hooks/queries'
export function StudentsPage() {
  const {params,setPage,filter} = useFilters()
  const query = useStudents(params)
  const grades = useGrades()
  const [operation,setOperation] = useState<StudentOperation | null>(null)
  return <div className="space-y-6"><PageHeader title="Quản lý học sinh" description="Hồ sơ và tài khoản học sinh do bạn quản lý." actions={<Link to="/teacher/students/new">Thêm học sinh</Link>} />
    <Filters params={params} onFilter={filter} />
    {query.isPending ? <ListSkeleton /> : query.isError ? <QueryError error={query.error} retry={() => void query.refetch()} /> : <>
      <DataTable rows={query.data.items} getRowKey={s => s.id} columns={[
        {key:'username',header:'Tên đăng nhập',render:s => <Link className="font-semibold text-brand-700" to={'/teacher/students/' + s.id}>{s.username}</Link>},
        {key:'name',header:'Họ và tên',render:s => s.fullName},
        {key:'grade',header:'Khối lớp',render:s => grades.data?.find(g => g.id === s.gradeId)?.name ?? 'Không khả dụng'},
        {key:'contact',header:'Liên hệ',render:s => <>{s.email || '—'}<br />{s.phone || '—'}</>},
        {key:'status',header:'Trạng thái',render:s => s.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'},
        {key:'date',header:'Ngày tạo',render:s => formatDate(s.createdAt)},
        {key:'actions',header:'Thao tác',render:s => <div className="flex flex-wrap gap-2"><Link to={'/teacher/students/' + s.id}>Xem / sửa</Link><Button variant="secondary" onClick={() => setOperation({student:s,kind:'status'})}>{s.isActive ? 'Ngừng hoạt động' : 'Kích hoạt'}</Button><Button variant="secondary" onClick={() => setOperation({student:s,kind:'reset'})}>Đặt lại mật khẩu</Button></div>},
      ]} /><Pagination {...params} totalCount={query.data.totalCount} onPageChange={setPage} /></>}
    {operation && <StudentOperations operation={operation} onClose={() => setOperation(null)} />}
  </div>
}

