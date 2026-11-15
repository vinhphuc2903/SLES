import { useState } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { SubjectForm } from '../components/SubjectForm'
import { SubjectStatusDialog } from '../components/SubjectStatusDialog'
import { ListSkeleton, QueryError } from '../components/QueryFeedback'
import { subjectApi } from '../api/subjectApi'
import { useAdminMutation, useSubject } from '../hooks/adminQueries'
import { formatDate } from '../utils/adminErrors'
import type { SubjectValues } from '../schemas/adminSchemas'

export function SubjectDetailPage() {
  const { id = '' } = useParams()
  const query = useSubject(id)
  const [confirm, setConfirm] = useState(false)
  const mutation = useAdminMutation('subjects', (values: SubjectValues) =>
    subjectApi.update(id, { name: values.name, description: values.description || null }))
  if (query.isPending) return <ListSkeleton />
  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />
  const subject = query.data
  return <div className="mx-auto max-w-4xl space-y-6">
    <PageHeader eyebrow="Môn học" title={subject.name} description={subject.code + ' · Tạo ngày ' + formatDate(subject.createdAt)} />
    <div className="flex items-center justify-between gap-3">
      <Badge tone={subject.isActive ? 'success' : 'neutral'}>{subject.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'}</Badge>
      <Button variant={subject.isActive ? 'danger' : 'secondary'} onClick={() => setConfirm(true)}>{subject.isActive ? 'Ngừng hoạt động' : 'Kích hoạt'}</Button>
    </div>
    <SubjectForm key={subject.id} subject={subject} onSubmit={async (values) => {
      await mutation.mutateAsync(values)
      toast.success('Đã cập nhật môn học.')
    }} />
    {confirm && <SubjectStatusDialog subject={subject} onClose={() => setConfirm(false)} />}
  </div>
}
