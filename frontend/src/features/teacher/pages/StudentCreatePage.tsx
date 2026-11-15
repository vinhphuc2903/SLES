import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { TemporaryPasswordDialog, type TemporaryPassword } from '@/features/admin/components/TemporaryPasswordDialog'
import { StudentForm, type StudentValues } from '../components/StudentForm'
import { useTeacherMutation } from '../hooks/queries'
import { studentApi } from '../api/teacherApi'
export function StudentCreatePage() {
  const navigate = useNavigate()
  const [secret,setSecret] = useState<TemporaryPassword | null>(null)
  const [id,setId] = useState('')
  const mutation = useTeacherMutation('students', async (values: StudentValues) => {
    const result = await studentApi.create({...values,email:values.email || null,phone:values.phone || null})
    setId(result.user.id); setSecret({username:result.user.username,password:result.temporaryPassword})
    return result.user
  })
  return <div className="space-y-6"><PageHeader title="Thêm học sinh" description="Tạo tài khoản học sinh thuộc lớp bạn quản lý." />
    {!id && <StudentForm onSubmit={async values => { await mutation.mutateAsync(values); toast.success('Đã tạo học sinh.') }} />}
    <TemporaryPasswordDialog secret={secret} onClose={() => { setSecret(null); mutation.reset(); navigate('/teacher/students/' + id) }} />
  </div>
}

