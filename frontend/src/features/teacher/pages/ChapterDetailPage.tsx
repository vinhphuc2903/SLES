import { Link, useParams } from 'react-router'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { ListSkeleton, QueryError } from '@/features/admin/components/QueryFeedback'
import { formatDate } from '@/features/admin/utils/adminErrors'
import { useChapter } from '../hooks/queries'
import { ChapterActions, ChapterStatusBadge } from '../components/ChapterActions'
import { QuestionProgress } from '../questions/QuestionProgress'
export function ChapterDetailPage() {
  const { id = '' } = useParams()
  const query = useChapter(id)
  if (query.isPending) return <ListSkeleton />
  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />
  const { chapter: c, version } = query.data
  return <div className="space-y-6"><PageHeader title={c.name} description={c.description ?? 'Thông tin chương học'} actions={<Link to={'/teacher/chapters/' + id + '/content'}>{c.status === 'Draft' ? 'Soạn lý thuyết' : 'Xem lý thuyết'}</Link>} />
    <Card><div className="grid gap-4 sm:grid-cols-2"><p>Môn học: {c.subjectName}</p><p>Khối lớp: {c.gradeName}</p><p>Thứ tự: {c.displayOrder}</p><ChapterStatusBadge status={c.status} /><p>Ngày xuất bản: {c.publishedAt ? formatDate(c.publishedAt) : 'Chưa xuất bản'}</p><p>Lý thuyết: {c.hasContent ? 'Đã có nội dung' : 'Chưa có nội dung'} · Phiên bản {version}</p></div></Card>
    <Link className="inline-block font-semibold text-brand-700" to={'/teacher/chapters/' + id + '/questions'}>Quản lý câu hỏi</Link>
    <QuestionProgress chapterId={id} />
    <Card title="Vòng đời chương"><p className="mb-4 text-sm text-slate-600">Để xuất bản, chương cần nội dung lý thuyết và đúng 200 câu hỏi đã xuất bản hợp lệ. Máy chủ kiểm tra mọi điều kiện trước khi xuất bản.</p><ChapterActions chapter={c} /></Card>
  </div>
}

