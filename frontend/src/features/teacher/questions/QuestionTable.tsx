import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { DataTable } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { questionApi } from '../management/api'
import { useManagementMutation } from '../management/queries'
import { Status } from '../management/ui'
import { localDate, managementError } from '../management/utils'
import type { Question, BulkPublishRequest, BulkPublishResult } from '../management/contracts'
import { difficultyLabel } from './difficulty'
const errors: Record<string, string> = { not_found_in_chapter: 'Không thuộc chương hoặc đã xóa', not_draft: 'Không còn là bản nháp', invaliddifficulty: 'Chưa có mức độ hợp lệ', contentrequired: 'Thiếu nội dung', musthavefouroptions: 'Cần đúng bốn phương án', emptyoptioncontent: 'Có phương án trống', musthaveexactlyonecorrectanswer: 'Cần đúng một đáp án đúng' }

export function QuestionTable({ rows, chapterId, editable, actions }: { rows: Question[]; chapterId: string; editable: boolean; actions: (q: Question) => React.ReactNode }) {
  const [selected, setSelected] = useState<string[]>([]), [mode, setMode] = useState<'selected' | 'all' | null>(null), [request, setRequest] = useState<BulkPublishRequest | null>(null), [result, setResult] = useState<BulkPublishResult | null>(null), [error, setError] = useState(''), lock = useRef(false)
  const m = useManagementMutation('questions', (r: BulkPublishRequest) => questionApi.bulkPublish(chapterId, r))
  async function submit(body: BulkPublishRequest) { if (lock.current) return; lock.current = true; setRequest(body); setError(''); try { const r = await m.mutateAsync(body); setResult(r); setSelected([]); setRequest(null) } catch (e) { setError(managementError(e) + ' Kiểm tra lại cùng yêu cầu để tránh gửi trùng.') } finally { lock.current = false; setMode(null) } }
  const candidates = rows.filter(q => q.status === 'Draft').map(q => q.id), blocked = m.isPending || request !== null
  return <div className="space-y-4">{editable && <><div className="flex flex-wrap items-center gap-3"><label><input type="checkbox" aria-label="Chọn tất cả bản nháp trên trang này" disabled={blocked || !candidates.length} checked={candidates.length > 0 && candidates.every(id => selected.includes(id))} onChange={e => setSelected(e.target.checked ? candidates : [])} /> Chọn tất cả bản nháp trên trang này</label><span>Đã chọn: {selected.length} (chỉ trang hiện tại)</span><Button variant="secondary" disabled={blocked || !selected.length} onClick={() => setSelected([])}>Bỏ chọn</Button><Button disabled={blocked || !selected.length} onClick={() => setMode('selected')}>Xuất bản đã chọn</Button><Button variant="secondary" disabled={blocked} onClick={() => setMode('all')}>Xuất bản mọi bản nháp hợp lệ trong chương</Button></div><p>Xuất bản toàn chương xét tất cả bản nháp, không phụ thuộc bộ lọc hoặc trang hiện tại. Câu không hợp lệ sẽ được báo rõ.</p></>}
    {error && <p role="alert">{error}</p>}{request && error && <Button loading={m.isPending} onClick={() => void submit(request)}>Kiểm tra lại yêu cầu xuất bản</Button>}
    {result && <section aria-label="Kết quả xuất bản"><p>Yêu cầu: {result.requestedCount} · Đã xuất bản: {result.publishedCount} · Bỏ qua: {result.skippedCount}</p>{result.errors.map(e => <p role="alert" key={e.questionId}><Link to={'/teacher/questions/' + e.questionId}>{e.questionId}</Link>: {errors[e.code] ?? e.code}</p>)}</section>}
    <DataTable rows={rows} getRowKey={q => q.id} columns={[
      { key: 'select', header: 'Chọn', render: q => <input type="checkbox" aria-label={'Chọn câu ' + q.content.slice(0, 100)} disabled={!editable || q.status !== 'Draft' || blocked} checked={selected.includes(q.id)} onChange={e => setSelected(old => e.target.checked ? [...old, q.id] : old.filter(id => id !== q.id))} /> },
      { key: 'content', header: 'Câu hỏi', render: q => <Link className="block max-w-lg whitespace-pre-wrap break-words" to={'/teacher/questions/' + q.id}>{q.content.slice(0, 180)}</Link> }, { key: 'difficulty', header: 'Mức độ', render: q => difficultyLabel(q.difficulty) }, { key: 'status', header: 'Trạng thái', render: q => <Status value={q.status} /> }, { key: 'created', header: 'Ngày tạo', render: q => localDate(q.createdAt) }, { key: 'updated', header: 'Cập nhật', render: q => localDate(q.updatedAt) }, { key: 'action', header: 'Thao tác', render: actions }]} />
    <ConfirmationDialog open={mode !== null} title="Xác nhận xuất bản hàng loạt" description={mode === 'all' ? 'Xuất bản mọi câu DRAFT hợp lệ trong chương, kể cả trang khác; báo cáo câu bị loại.' : 'Xuất bản ' + selected.length + ' câu đã chọn trên trang này. Nếu một câu không hợp lệ, không xuất bản câu nào.'} confirmLabel="Xác nhận xuất bản" busy={m.isPending} onCancel={() => setMode(null)} onConfirm={() => void submit({ requestId: crypto.randomUUID(), allEligible: mode === 'all', questionIds: mode === 'all' ? [] : selected })} /></div>
}
