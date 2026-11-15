import { useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { ListToolbar } from '../components/ListToolbar'
import { ListSkeleton, QueryError } from '../components/QueryFeedback'
import { SubjectTable } from '../components/SubjectTable'
import { SubjectStatusDialog } from '../components/SubjectStatusDialog'
import { useSubjects } from '../hooks/adminQueries'
import { useListParams } from '../hooks/useListParams'
import type { Subject } from '../types/contracts'

export function SubjectsPage() {
  const { params, setPage, setFilters } = useListParams()
  const query = useSubjects(params)
  const [selected, setSelected] = useState<Subject | null>(null)
  return <div className="space-y-6">
    <PageHeader eyebrow="Quản trị" title="Quản lý môn học" description="Danh mục môn học và trạng thái sử dụng trên toàn hệ thống."
      actions={<Link to="/admin/subjects/new" className="rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-800">Tạo môn học</Link>} />
    <ListToolbar params={params} onFilter={setFilters} placeholder="Mã môn học hoặc tên môn học" />
    {query.isPending ? <ListSkeleton /> : query.isError ? <QueryError error={query.error} retry={() => void query.refetch()} /> :
      <div className="space-y-3">
        <SubjectTable rows={query.data.items} onStatus={setSelected} />
        <Pagination page={params.page} pageSize={params.pageSize} totalCount={query.data.totalCount} onPageChange={setPage} />
      </div>}
    {selected && <SubjectStatusDialog subject={selected} onClose={() => setSelected(null)} />}
  </div>
}
