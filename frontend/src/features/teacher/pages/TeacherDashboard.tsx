import { Link } from 'react-router'
import { useQueries } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useCurrentUser'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { ListSkeleton, QueryError } from '@/features/admin/components/QueryFeedback'
import { useTeacherKeys } from '../hooks/queries'
import { studentApi, chapterApi } from '../api/teacherApi'
import type { ChapterStatus } from '../types/contracts'
export function TeacherDashboard() {
  const {user} = useAuth()
  return <div className="space-y-6"><PageHeader eyebrow="Giáo viên" title={'Xin chào, ' + (user?.fullName ?? '')} description="Theo dõi học sinh và chuẩn bị nội dung giảng dạy của bạn." />
    <Statistics resource="students" /><Statistics resource="chapters" />
    <Card title="Thao tác nhanh"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
      ['/teacher/students/new','Thêm học sinh'],['/teacher/students','Quản lý học sinh'],['/teacher/chapters/new','Tạo chương học'],['/teacher/chapters','Quản lý chương học'],['/teacher/questions','Ngân hàng câu hỏi'],['/teacher/exams','Quản lý bài kiểm tra'],
    ].map(([path,label]) => <Link key={path} to={path!} className="rounded-xl border border-slate-200 p-5 font-semibold text-brand-700 hover:bg-brand-50">{label}</Link>)}</div></Card>
  </div>
}
function Statistics({resource}: {resource:'students'|'chapters'}) {
  const keys = useTeacherKeys()
  const labels = resource === 'students' ? ['Tổng học sinh','Đang hoạt động','Ngừng hoạt động'] : ['Tổng chương','Bản nháp','Đã xuất bản','Đã lưu trữ']
  const queries = useQueries({queries: labels.map((_,index) => {
    const params = resource === 'students' ? {page:1,pageSize:1,isActive:index === 0 ? undefined : index === 1} : {page:1,pageSize:1,status:([undefined,'Draft','Published','Archived'] as (ChapterStatus|undefined)[])[index]}
    return {queryKey:[...keys[resource],'list',params],queryFn:async ({signal}: {signal:AbortSignal}) => resource === 'students' ? studentApi.list(params,signal) : chapterApi.list(params,signal)}
  })})
  const failure = queries.find(q => q.isError)
  if (failure) return <QueryError error={failure.error} retry={() => queries.forEach(q => void q.refetch())} />
  if (queries.some(q => q.isPending)) return <ListSkeleton />
  return <section aria-label={resource === 'students' ? 'Thống kê học sinh' : 'Thống kê chương'}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{queries.map((q,i) => <Card key={labels[i]}><p className="text-sm text-slate-600">{labels[i]}</p><p className="mt-3 text-3xl font-bold text-brand-900">{q.data?.totalCount}</p></Card>)}</div>{queries[0]?.data?.totalCount === 0 && <p className="mt-3 text-sm text-slate-500">Chưa có dữ liệu. Hãy bắt đầu bằng thao tác tạo mới.</p>}</section>
}

