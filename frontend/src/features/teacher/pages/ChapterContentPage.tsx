import { useEffect, useState } from 'react'
import { Link, useBlocker, useParams } from 'react-router'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { ListSkeleton, QueryError } from '@/features/admin/components/QueryFeedback'
import { adminError } from '@/features/admin/utils/adminErrors'
import { useChapter, useTeacherMutation } from '../hooks/queries'
import { chapterApi } from '../api/teacherApi'
import type { ChapterDetail } from '../types/contracts'
export function ChapterContentPage() {
  const {id = ''} = useParams()
  const query = useChapter(id)
  if (query.isPending) return <ListSkeleton />
  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />
  return <Editor key={id} detail={query.data} />
}
function Editor({detail}: {detail: ChapterDetail}) {
  const [content,setContent] = useState(detail.content)
  const [saved,setSaved] = useState(detail.content)
  const [version,setVersion] = useState(detail.version)
  const [preview,setPreview] = useState(false)
  const [error,setError] = useState('')
  const [discard,setDiscard] = useState(false)
  const editable = detail.chapter.status === 'Draft'
  const dirty = content !== saved
  const mutation = useTeacherMutation('chapters', (value: string) => chapterApi.content(detail.chapter.id,value))
  const blocker = useBlocker(dirty || mutation.isPending)
  useEffect(() => {
    if (!dirty && !mutation.isPending) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload',warn)
    return () => window.removeEventListener('beforeunload',warn)
  },[dirty,mutation.isPending])
  async function save() {
    if (mutation.isPending || !editable) return
    if (content.length > 200000) {setError('Nội dung tối đa 200.000 ký tự.');return}
    setError('')
    try { const result = await mutation.mutateAsync(content); setSaved(result.content); setContent(result.content); setVersion(result.version); toast.success('Đã lưu lý thuyết.') }
    catch (e) { setError(adminError(e).message) }
  }
  return <div className="space-y-6"><PageHeader title={'Lý thuyết: ' + detail.chapter.name} description={'Markdown · Phiên bản ' + version} actions={<Link to={'/teacher/chapters/' + detail.chapter.id}>Về chương học</Link>} />
    {!editable && <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Chương đã xuất bản hoặc lưu trữ: nội dung chỉ đọc.</p>}
    {editable && <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" onClick={() => setPreview(!preview)}>{preview ? 'Soạn thảo' : 'Xem trước'}</Button><Button loading={mutation.isPending} onClick={() => void save()}>Lưu nội dung</Button><Button variant="secondary" disabled={!dirty || mutation.isPending} onClick={() => setDiscard(true)}>Bỏ thay đổi</Button><span role="status">{dirty ? 'Có thay đổi chưa lưu' : 'Đã lưu'} · {content.length.toLocaleString('vi-VN')}/200.000 ký tự</span></div>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    <Card>{editable && !preview ? <label className="block text-sm font-semibold">Nội dung Markdown<textarea aria-label="Nội dung Markdown" className="mt-3 min-h-[28rem] w-full rounded-xl border border-slate-200 p-4 font-mono text-sm" disabled={mutation.isPending} value={content} onChange={e => setContent(e.target.value)} /></label> :
      <article aria-label="Xem trước Markdown" className="markdown-preview overflow-x-auto"><Markdown skipHtml remarkPlugins={[remarkGfm]}>{content || '*Chưa có nội dung.*'}</Markdown></article>}</Card>
    <ConfirmationDialog open={blocker.state === 'blocked'} title="Rời trang khi chưa lưu?" description="Nội dung chưa lưu sẽ bị mất. Bạn có thể ở lại để lưu hoặc bỏ thay đổi và rời trang." confirmLabel="Bỏ thay đổi và rời trang" busy={mutation.isPending} destructive onCancel={() => blocker.state === 'blocked' && blocker.reset()} onConfirm={() => blocker.state === 'blocked' && blocker.proceed()} />
    <ConfirmationDialog open={discard} title="Bỏ thay đổi?" description="Khôi phục nội dung đã lưu gần nhất." confirmLabel="Bỏ thay đổi" destructive onCancel={() => setDiscard(false)} onConfirm={() => {setContent(saved);setError('');setDiscard(false)}} />
  </div>
}

