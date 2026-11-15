import { useState } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { ListSkeleton, QueryError } from '@/features/admin/components/QueryFeedback'
import { StudentForm, type StudentValues } from '../components/StudentForm'
import { StudentOperations, type StudentOperation } from '../components/StudentOperations'
import { useStudent, useTeacherMutation } from '../hooks/queries'
import { studentApi } from '../api/teacherApi'
export function StudentDetailPage() {
  const {id = ''} = useParams()
  const query = useStudent(id)
  const [operation,setOperation] = useState<StudentOperation | null>(null)
  const mutation = useTeacherMutation('students', (v: StudentValues) => studentApi.update(id,{fullName:v.fullName,email:v.email || null,phone:v.phone || null,gradeId:v.gradeId}))
  if (query.isPending) return <ListSkeleton />
  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />
  const student = query.data
  return <div className="space-y-6"><PageHeader title={student.fullName} description={(student.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động') + (student.mustChangePassword ? ' · Cần đổi mật khẩu' : '')} actions={<><Button variant="secondary" onClick={() => setOperation({student,kind:'status'})}>{student.isActive ? 'Ngừng hoạt động' : 'Kích hoạt'}</Button><Button variant="secondary" onClick={() => setOperation({student,kind:'reset'})}>Đặt lại mật khẩu</Button></>} />
    <StudentForm key={JSON.stringify(student)} student={student} onSubmit={async v => { await mutation.mutateAsync(v); toast.success('Đã lưu học sinh.') }} />
    {operation && <StudentOperations operation={operation} onClose={() => setOperation(null)} />}
  </div>
}

