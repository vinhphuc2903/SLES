import { useQueries } from '@tanstack/react-query'
import { ArrowRight, BookOpen, Users } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/features/auth/hooks/useCurrentUser'
import { PageHeader } from '@/components/ui/PageHeader'
import { teacherListOptions, subjectListOptions } from '../hooks/adminQueries'
import { ListSkeleton, QueryError } from '../components/QueryFeedback'

export function AdminDashboard() {
  const { user } = useAuth()
  return <div className="space-y-8">
    <div className="rounded-3xl bg-gradient-to-br from-brand-900 to-cyan-800 p-6 text-white sm:p-9">
      <p className="text-sm font-semibold text-cyan-100">Không gian quản trị</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Xin chào, {user?.fullName}</h1>
      <p className="mt-3 text-sm text-white/75">Theo dõi tài khoản giáo viên và danh mục môn học trên toàn hệ thống.</p>
    </div>
    <PageHeader title="Tổng quan hệ thống" description="Số liệu tổng hợp từ danh sách giáo viên và môn học." />
    <div className="grid gap-6 xl:grid-cols-2">
      <Statistics resource="teachers" />
      <Statistics resource="subjects" />
    </div>
    <section aria-labelledby="quick-actions">
      <h2 id="quick-actions" className="mb-4 text-lg font-bold text-slate-900">Thao tác nhanh</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { title: 'Quản lý giáo viên', to: '/admin/teachers', create: '/admin/teachers/new', label: 'Tạo giáo viên', icon: Users, text: 'Cập nhật hồ sơ, trạng thái tài khoản và đặt lại mật khẩu.' },
          { title: 'Quản lý môn học', to: '/admin/subjects', create: '/admin/subjects/new', label: 'Tạo môn học', icon: BookOpen, text: 'Tổ chức danh mục và quản lý môn học đang hoạt động.' },
        ].map(({ title, to, create, label, icon: Icon, text }) => <div key={to} className="rounded-2xl border border-slate-200 bg-white p-6">
          <Icon className="size-6 text-brand-700" />
          <h3 className="mt-3 font-bold text-slate-900">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Link to={create} className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">{label}</Link>
            <Link to={to} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700">Xem danh sách <ArrowRight className="size-4" /></Link>
          </div>
        </div>)}
      </div>
    </section>
  </div>
}

function Statistics({ resource }: { resource: 'teachers' | 'subjects' }) {
  const options = resource === 'teachers' ? teacherListOptions : subjectListOptions
  // Each count comes from API pagination metadata over the full filtered dataset.
  const queries = useQueries({ queries: [undefined, true, false].map((isActive) =>
    options({ page: 1, pageSize: 1, isActive })) })
  const failed = queries.find((query) => query.isError)
  const title = resource === 'teachers' ? 'Giáo viên' : 'Môn học'
  if (failed) return <QueryError error={failed.error} retry={() => { queries.forEach((query) => void query.refetch()) }} />
  if (queries.some((query) => query.isPending)) return <ListSkeleton />
  return <section aria-label={title} className="rounded-2xl border border-slate-200 bg-white p-6">
    <h2 className="font-bold text-slate-900">{title}</h2>
    <dl className="mt-5 grid grid-cols-3 gap-3">
      {['Tổng số', 'Đang hoạt động', 'Ngừng hoạt động'].map((label, index) => <div key={label} className="rounded-xl bg-slate-50 px-3 py-4">
        <dt className="text-xs leading-5 text-slate-500">{label}</dt>
        <dd className="mt-2 text-2xl font-bold text-slate-900">{new Intl.NumberFormat('vi-VN').format(queries[index]?.data?.totalCount ?? 0)}</dd>
      </div>)}
    </dl>
    {queries[0]?.data?.totalCount === 0 && <p className="mt-4 text-sm text-slate-500">Chưa có {title.toLowerCase()} trong hệ thống.</p>}
  </section>
}
