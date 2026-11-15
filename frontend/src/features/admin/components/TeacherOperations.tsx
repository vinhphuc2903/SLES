import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { teacherApi } from '../api/teacherApi'
import { useAdminMutation } from '../hooks/adminQueries'
import { adminError } from '../utils/adminErrors'
import { TemporaryPasswordDialog, type TemporaryPassword } from './TemporaryPasswordDialog'
import type { TeacherOperation } from './TeacherTable'

export function TeacherOperations({ operation, onClose }: { operation: TeacherOperation; onClose: () => void }) {
  const [secret, setSecret] = useState<TemporaryPassword | null>(null)
  const { teacher, kind } = operation
  const mutation = useAdminMutation('teachers', async () => {
    if (kind === 'status') await teacherApi.setStatus(teacher.id, !teacher.isActive)
    else {
      const response = await teacherApi.resetPassword(teacher.id)
      setSecret({ username: teacher.username, password: response.temporaryPassword })
    }
    // Deliberately return no secret to the mutation cache.
  })
  const close = () => {
    setSecret(null)
    mutation.reset()
    onClose()
  }
  async function confirm() {
    if (mutation.isPending) return
    try {
      await mutation.mutateAsync()
      toast.success(kind === 'reset' ? 'Đã đặt lại mật khẩu giáo viên.' : 'Đã cập nhật trạng thái giáo viên.')
      if (kind === 'status') close()
    } catch (error) { toast.error(adminError(error).message) }
  }
  const action = teacher.isActive ? 'Ngừng hoạt động' : 'Kích hoạt'
  return <>
    <ConfirmationDialog open={!secret} busy={mutation.isPending} title={kind === 'reset' ? 'Đặt lại mật khẩu giáo viên?' : action + ' giáo viên?'}
      description={kind === 'reset'
        ? 'Đặt lại mật khẩu cho ' + teacher.fullName + ' (' + teacher.username + ')? Các phiên làm mới sẽ bị thu hồi; giáo viên cần dùng mật khẩu mới và đổi mật khẩu khi đăng nhập.'
        : action + ' tài khoản của ' + teacher.fullName + ' (' + teacher.username + '). ' + (teacher.isActive ? 'Giáo viên sẽ không thể đăng nhập và các phiên làm mới sẽ bị thu hồi.' : 'Giáo viên sẽ có thể đăng nhập trở lại.')}
      confirmLabel={kind === 'reset' ? 'Đặt lại mật khẩu' : action} destructive={kind === 'reset' || teacher.isActive}
      onConfirm={confirm} onCancel={close} />
    <TemporaryPasswordDialog secret={secret} onClose={close} />
  </>
}
