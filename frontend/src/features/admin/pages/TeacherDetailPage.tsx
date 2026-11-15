import { useState } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { TeacherForm } from '../components/TeacherForm'
import { TeacherOperations } from '../components/TeacherOperations'
import { ListSkeleton, QueryError } from '../components/QueryFeedback'
import { teacherApi } from '../api/teacherApi'
import { useAdminMutation, useTeacher } from '../hooks/adminQueries'
import { formatDate } from '../utils/adminErrors'
import type { TeacherValues } from '../schemas/adminSchemas'

export function TeacherDetailPage() {
  const { id = '' } = useParams()
  const query = useTeacher(id)
  const [operation, setOperation] = useState<'status' | 'reset' | null>(null)
  const mutation = useAdminMutation('teachers', (values: TeacherValues) =>
    teacherApi.update(id, { fullName: values.fullName, email: values.email || null, phone: values.phone || null }))
  if (query.isPending) return <ListSkeleton />
  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />
  const teacher = query.data
  return <div className="mx-auto max-w-4xl space-y-6">
    <PageHeader eyebrow="Giáo viên" title={teacher.fullName} description={'Tài khoản ' + teacher.username + ' · Tạo ngày ' + formatDate(teacher.createdAt)} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <Badge tone={teacher.isActive ? 'success' : 'neutral'}>{teacher.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'}</Badge>
        {teacher.mustChangePassword && <Badge tone="warning">Cần đổi mật khẩu</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setOperation('reset')}>Đặt lại mật khẩu</Button>
        <Button variant={teacher.isActive ? 'danger' : 'secondary'} onClick={() => setOperation('status')}>{teacher.isActive ? 'Ngừng hoạt động' : 'Kích hoạt'}</Button>
      </div>
    </div>
    <TeacherForm key={teacher.id} teacher={teacher} onSubmit={async (values) => {
      await mutation.mutateAsync(values)
      toast.success('Đã cập nhật hồ sơ giáo viên.')
    }} />
    {operation && <TeacherOperations operation={{ teacher, kind: operation }} onClose={() => setOperation(null)} />}
  </div>
}
