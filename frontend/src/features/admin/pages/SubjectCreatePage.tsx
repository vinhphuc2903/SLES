import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { SubjectForm } from '../components/SubjectForm'
import { subjectApi } from '../api/subjectApi'
import { useAdminMutation } from '../hooks/adminQueries'
import type { SubjectValues } from '../schemas/adminSchemas'

export function SubjectCreatePage() {
  const navigate = useNavigate()
  const mutation = useAdminMutation('subjects', (values: SubjectValues) =>
    subjectApi.create({ code: values.code, name: values.name, description: values.description || null }))
  return <div className="mx-auto max-w-4xl space-y-6">
    <PageHeader eyebrow="Môn học" title="Tạo môn học" description="Môn học mới được kích hoạt ngay sau khi tạo." />
    <SubjectForm onSubmit={async (values) => {
      const created = await mutation.mutateAsync(values)
      toast.success('Đã tạo môn học.')
      navigate('/admin/subjects/' + created.id, { replace: true })
    }} />
  </div>
}
