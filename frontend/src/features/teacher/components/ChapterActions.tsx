import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { normalizeApiError } from '@/lib/api/apiErrors'
import { adminError } from '@/features/admin/utils/adminErrors'
import { chapterApi } from '../api/teacherApi'
import { useTeacherMutation } from '../hooks/queries'
import type { Chapter, ChapterStatus } from '../types/contracts'
const statusLabels: Record<ChapterStatus,string> = { Draft:'Bản nháp', Published:'Đã xuất bản', Archived:'Đã lưu trữ' }
export function ChapterStatusBadge({status}: {status: ChapterStatus}) { return <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{statusLabels[status]}</span> }
function businessError(error: unknown) {
  const e = normalizeApiError(error)
  const count = /^Chapter has (\d+) valid published questions; exactly 200 are required\.$/.exec(e.message)
  if (e.code === 'publicationvalidationpending' && count) return 'Chương có ' + count[1] + ' câu hỏi đã xuất bản hợp lệ; cần đúng 200 câu hỏi.'
  const known: Record<string,string> = {
    'Markdown content must not be empty.':'Nội dung lý thuyết không được để trống.',
    'Chapter history prevents archival.':'Chương có lịch sử luyện tập hoặc bài kiểm tra nên không thể lưu trữ.',
    'Chapter history prevents deletion.':'Chương có câu hỏi, bài kiểm tra hoặc lịch sử luyện tập nên không thể xóa.',
  }
  return known[e.message] ?? (e.code === 'invalidtransition' ? 'Trạng thái chương không cho phép thao tác này.' : adminError(error).message)
}
export function ChapterActions({chapter}: {chapter: Chapter}) {
  const navigate = useNavigate()
  const [action,setAction] = useState<'publish'|'archive'|'delete'|null>(null)
  const [error,setError] = useState('')
  const mutation = useTeacherMutation('chapters', (kind: 'publish'|'archive'|'delete') => chapterApi.action(chapter.id,kind))
  const labels = { publish:'Xuất bản',archive:'Lưu trữ',delete:'Xóa chương' }
  return <div className="space-y-3"><div className="flex flex-wrap gap-2">
    {chapter.status === 'Draft' && <Button onClick={() => {setError('');setAction('publish')}}>Xuất bản</Button>}
    {chapter.status !== 'Archived' && <Button variant="secondary" onClick={() => {setError('');setAction('archive')}}>Lưu trữ</Button>}
    {chapter.status === 'Draft' && <Button variant="danger" onClick={() => {setError('');setAction('delete')}}>Xóa chương</Button>}
  </div>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <ConfirmationDialog open={!!action} title={action ? labels[action] + '?' : ''} description={'Chương: ' + chapter.name + '. ' + (action === 'publish' ? 'Cần nội dung lý thuyết và đúng 200 câu hỏi đã xuất bản hợp lệ. Máy chủ sẽ kiểm tra trước khi xuất bản.' : action === 'archive' ? 'Chương sẽ không còn khả dụng cho học tập/luyện tập mới. Lịch sử được giữ lại; máy chủ kiểm tra ràng buộc trước khi lưu trữ.' : 'Đây là xóa mềm. Chỉ bản nháp chưa có câu hỏi hoặc lịch sử liên quan mới được xóa.')} confirmLabel={action ? labels[action] : ''} destructive={action !== 'publish'} busy={mutation.isPending} onCancel={() => setAction(null)} onConfirm={async () => {
      if (!action || mutation.isPending) return
      try { await mutation.mutateAsync(action); toast.success('Đã cập nhật chương học.'); setAction(null); if (action === 'delete') navigate('/teacher/chapters') }
      catch (e) { setError(businessError(e)); setAction(null) }
    }} />
  </div>
}

