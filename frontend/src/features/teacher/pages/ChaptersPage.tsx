import { Link } from 'react-router'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { ListSkeleton, QueryError } from '@/features/admin/components/QueryFeedback'
import { formatDate } from '@/features/admin/utils/adminErrors'
import { Filters } from '../components/Filters'
import { useFilters } from '../hooks/useFilters'
import { ChapterActions, ChapterStatusBadge } from '../components/ChapterActions'
import { useChapters } from '../hooks/queries'
export function ChaptersPage() {
  const { params, setPage, filter } = useFilters(true)
  const query = useChapters(params)
  return <div className="space-y-6"><PageHeader title="Quản lý chương học" description="Nội dung, lý thuyết và vòng đời các chương do bạn sở hữu." actions={<Link to="/teacher/chapters/new">Tạo chương học</Link>} />
    <Filters chapters params={params} onFilter={filter} />
    {query.isPending ? <ListSkeleton /> : query.isError ? <QueryError error={query.error} retry={() => void query.refetch()} /> : <>
      <DataTable rows={query.data.items} getRowKey={c => c.id} columns={[
        { key: 'name', header: 'Chương', render: c => <Link className="font-semibold text-brand-700" to={'/teacher/chapters/' + c.id}>{c.name}</Link> },
        { key: 'subject', header: 'Môn học', render: c => c.subjectName },
        { key: 'grade', header: 'Khối lớp', render: c => c.gradeName },
        { key: 'order', header: 'Thứ tự', render: c => c.displayOrder },
        { key: 'status', header: 'Trạng thái', render: c => <ChapterStatusBadge status={c.status} /> },
        { key: 'date', header: 'Ngày xuất bản', render: c => c.publishedAt ? formatDate(c.publishedAt) : '—' },
        { key: 'actions', header: 'Thao tác', render: c => <div className="space-y-3"><Link to={'/teacher/chapters/' + c.id + '/content'}>Nội dung lý thuyết</Link><ChapterActions chapter={c} /></div> },
      ]} /><Pagination {...params} totalCount={query.data.totalCount} onPageChange={setPage} /></>}
  </div>
}

