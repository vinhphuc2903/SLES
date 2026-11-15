import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { TeacherForm } from '../components/TeacherForm'
import { TemporaryPasswordDialog, type TemporaryPassword } from '../components/TemporaryPasswordDialog'
import { teacherApi } from '../api/teacherApi'
import { useAdminMutation } from '../hooks/adminQueries'
import type { TeacherValues } from '../schemas/adminSchemas'

export function TeacherCreatePage() {
  const navigate = useNavigate()
  const [secret, setSecret] = useState<TemporaryPassword | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const mutation = useAdminMutation('teachers', async (values: TeacherValues) => {
    const result = await teacherApi.create({ ...values, email: values.email || null, phone: values.phone || null })
    setCreatedId(result.user.id)
    setSecret({ username: result.user.username, password: result.temporaryPassword })
    return result.user
  })
  const close = () => {
    setSecret(null)
    mutation.reset()
    navigate(createdId ? '/admin/teachers/' + createdId : '/admin/teachers', { replace: true })
  }
  return <div className="mx-auto max-w-4xl space-y-6">
    <PageHeader eyebrow="Giáo viên" title="Tạo tài khoản giáo viên" description="Thông tin tài khoản và mật khẩu ban đầu sẽ được tạo trên hệ thống." />
    {!createdId && <TeacherForm onSubmit={async (values) => {
      await mutation.mutateAsync(values)
      toast.success('Đã tạo tài khoản giáo viên.')
    }} />}
    {createdId && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Tài khoản đã được tạo thành công.</p>}
    <TemporaryPasswordDialog secret={secret} onClose={close} />
  </div>
}
