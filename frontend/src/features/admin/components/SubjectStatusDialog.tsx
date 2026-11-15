import { toast } from 'sonner'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { subjectApi } from '../api/subjectApi'
import { useAdminMutation } from '../hooks/adminQueries'
import { adminError } from '../utils/adminErrors'
import type { Subject } from '../types/contracts'

export function SubjectStatusDialog({ subject, onClose }: { subject: Subject; onClose: () => void }) {
  const mutation = useAdminMutation('subjects', () => subjectApi.setStatus(subject.id, !subject.isActive))
  const action = subject.isActive ? 'Ngừng hoạt động' : 'Kích hoạt'
  async function confirm() {
    if (mutation.isPending) return
    try {
      await mutation.mutateAsync()
      toast.success('Đã cập nhật trạng thái môn học.')
      onClose()
    } catch (error) { toast.error(adminError(error).message) }
  }
  return <ConfirmationDialog open busy={mutation.isPending} title={action + ' môn học?'} confirmLabel={action}
    description={action + ' môn ' + subject.name + ' (' + subject.code + '). ' + (subject.isActive
      ? 'Môn học sẽ không còn nằm trong danh sách môn đang hoạt động để tạo chương mới. Nội dung đã có được giữ lại.'
      : 'Môn học sẽ xuất hiện trở lại trong danh sách môn đang hoạt động.')}
    destructive={subject.isActive} onConfirm={confirm} onCancel={onClose} />
}
