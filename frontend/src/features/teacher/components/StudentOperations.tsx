import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { TemporaryPasswordDialog, type TemporaryPassword } from '@/features/admin/components/TemporaryPasswordDialog'
import { adminError } from '@/features/admin/utils/adminErrors'
import { useTeacherMutation } from '../hooks/queries'
import { studentApi } from '../api/teacherApi'
import type { Student } from '../types/contracts'
export type StudentOperation = { student: Student; kind: 'status' | 'reset' }
export function StudentOperations({ operation: {student,kind}, onClose }: { operation: StudentOperation; onClose: () => void }) {
  const [secret,setSecret] = useState<TemporaryPassword | null>(null)
  const mutation = useTeacherMutation('students', async () => {
    if (kind === 'status') await studentApi.status(student.id, !student.isActive)
    else { const result = await studentApi.reset(student.id); setSecret({ username: student.username, password: result.temporaryPassword }) }
  })
  const close = () => { setSecret(null); mutation.reset(); onClose() }
  const label = kind === 'reset' ? 'Đặt lại mật khẩu' : student.isActive ? 'Ngừng hoạt động' : 'Kích hoạt'
  return <><ConfirmationDialog open={!secret} title={label + ' học sinh?'} description={label + ' cho ' + student.fullName + ' (' + student.username + '). ' + (kind === 'reset' || student.isActive ? 'Các phiên làm mới sẽ bị thu hồi; học sinh cần đăng nhập lại.' : 'Học sinh có thể đăng nhập trở lại.')} confirmLabel={label} busy={mutation.isPending} destructive={kind === 'reset' || student.isActive} onCancel={close} onConfirm={async () => {
    if (mutation.isPending) return
    try { await mutation.mutateAsync(); toast.success('Đã cập nhật học sinh.'); if (kind === 'status') close() } catch (e) { toast.error(adminError(e).message) }
  }} /><TemporaryPasswordDialog secret={secret} onClose={close} /></>
}

