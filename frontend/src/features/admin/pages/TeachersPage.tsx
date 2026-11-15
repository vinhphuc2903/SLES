import { useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { ListToolbar } from '../components/ListToolbar'
import { ListSkeleton, QueryError } from '../components/QueryFeedback'
import { TeacherTable, type TeacherOperation } from '../components/TeacherTable'
import { TeacherOperations } from '../components/TeacherOperations'
import { useTeachers } from '../hooks/adminQueries'
import { useListParams } from '../hooks/useListParams'

export function TeachersPage() {
  const { params, setPage, setFilters } = useListParams()
  const query = useTeachers(params)
  const [operation, setOperation] = useState<TeacherOperation | null>(null)
  return <div className="space-y-6">
    <PageHeader eyebrow="Quản trị" title="Quản lý giáo viên" description="Tài khoản, hồ sơ và quyền đăng nhập của đội ngũ giảng dạy."
      actions={<Link to="/admin/teachers/new" className="rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-800">Tạo giáo viên</Link>} />
    <ListToolbar params={params} onFilter={setFilters} placeholder="Tên đăng nhập hoặc họ tên" />
    {query.isPending ? <ListSkeleton /> : query.isError ? <QueryError error={query.error} retry={() => void query.refetch()} /> :
      <div className="space-y-3">
        <TeacherTable rows={query.data.items} onAction={setOperation} />
        <Pagination page={params.page} pageSize={params.pageSize} totalCount={query.data.totalCount} onPageChange={setPage} />
      </div>}
    {operation && <TeacherOperations operation={operation} onClose={() => setOperation(null)} />}
  </div>
}
