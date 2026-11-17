import { BulkManagement } from '@/features/bulk/BulkManagement'
import {ExamBlueprint} from './ExamBlueprint'
import { Link,useNavigate,useParams } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { ListSkeleton,QueryError } from '@/features/admin/components/QueryFeedback'
import { useChapter } from '../hooks/queries'
import { examApi } from '../management/api'
import { useExam,useExams,useManagementMutation } from '../management/queries'
import { Status,ConfirmAction,SearchToolbar } from '../management/ui'
import { localDate,usePageQuery } from '../management/utils'
import type { Exam,ExamInput } from '../management/contracts'
import { ExamForm } from './ExamForm'
export function ExamLinks({id}:{id:string}){return <div className="flex flex-wrap gap-4 text-brand-700"><Link to={'/teacher/exams/'+id}>Chi tiết</Link><Link to={'/teacher/exams/'+id+'/permissions'}>Cấp quyền</Link><Link to={'/teacher/exams/'+id+'/results'}>Kết quả</Link></div>}
function ExamActions({exam:e}:{exam:Exam}){return <div className="flex flex-wrap gap-3">{e.status==='Draft'&&<ConfirmAction resource="exams" label="Xuất bản bài kiểm tra" description={'Xuất bản '+e.name+'. Chương phải đã xuất bản và vẫn có đúng 200 câu hỏi hợp lệ. Lịch mở do máy chủ quyết định.'} run={()=>examApi.action(e.id,'publish')}/>}
 {e.status!=='Closed'&&e.status!=='Cancelled'&&<ConfirmAction resource="exams" label="Đóng bài kiểm tra" destructive description={'Đóng '+e.name+' để ngăn bắt đầu bài làm mới. Bài đang làm không tự động nộp chỉ vì đóng bài; lịch sử được giữ nguyên.'} run={()=>examApi.action(e.id,'close')}/>}</div>}
function ChapterCell({id}:{id:string}){const q=useChapter(id);return q.data?<div>{q.data.chapter.name}<p className="text-xs">{q.data.chapter.subjectName} · {q.data.chapter.gradeName}</p></div>:<Link to={'/teacher/chapters/'+id}>{q.isError?'Xem chương (chưa tải được)':'Đang tải chương...'}</Link>}
export function ExamsPage(){
 const p=usePageQuery(),q=useExams({page:p.page,pageSize:20,keyword:p.keyword,status:p.status})
 return <div className="space-y-6"><PageHeader title="Quản lý bài kiểm tra" description="Lịch, quyền tham gia và kết quả bài kiểm tra của bạn." actions={<Link to="/teacher/exams/new">Tạo bài kiểm tra</Link>}/><SearchToolbar {...p} statuses={['Draft','Scheduled','Active','Closed','Cancelled']}/>
 {q.isPending?<ListSkeleton/>:q.isError?<QueryError error={q.error} retry={()=>void q.refetch()}/>:<><BulkManagement rows={q.data.items} scope={[p.page,p.keyword,p.status].join(':')} endpoint="/api/teacher/exams/bulk-close" action="Đóng bài thi đã chọn" consequence="Ngừng cho bắt đầu lượt thi mới; quyền, bài làm và kết quả được giữ nguyên." eligible={row => row.status !== 'Closed' && row.status !== 'Cancelled'} label={row => row.name}>
 {selection => <DataTable rows={q.data.items} getRowKey={e=>e.id} columns={[...(selection ? [selection] : []),
 {key:'name',header:'Bài kiểm tra',render:e=><Link to={'/teacher/exams/'+e.id}>{e.name}</Link>},{key:'chapter',header:'Chương / Môn / Khối',render:e=><ChapterCell id={e.chapterId}/>},{key:'status',header:'Trạng thái',render:e=><Status value={e.status}/>},{key:'time',header:'Lịch (giờ địa phương)',render:e=><>{localDate(e.startAt)}<br/>{localDate(e.endAt)}<p>{e.durationMinutes} phút</p></>},{key:'actions',header:'Thao tác',render:e=><div className="space-y-3"><ExamLinks id={e.id}/><ExamActions exam={e}/></div>}]}/>}</BulkManagement><Pagination page={p.page} pageSize={20} totalCount={q.data.totalCount} onPageChange={p.setPage}/></>}</div>
}
export function ExamCreatePage(){const navigate=useNavigate(),m=useManagementMutation('exams',(v:ExamInput)=>examApi.create(v));return <div className="space-y-6"><PageHeader title="Tạo bài kiểm tra"/><ExamForm onSubmit={async v=>{const e=await m.mutateAsync(v);toast.success('Đã tạo bài kiểm tra.');navigate('/teacher/exams/'+e.id)}}/></div>}
export function ExamDetailPage(){
 const {examId=''}=useParams(),q=useExam(examId),m=useManagementMutation('exams',(v:ExamInput)=>examApi.update(examId,{name:v.name,description:v.description,durationMinutes:v.durationMinutes,startAt:v.startAt,endAt:v.endAt}))
 if(q.isPending)return <ListSkeleton/>
 if(q.isError)return <QueryError error={q.error} retry={()=>void q.refetch()}/>
 const e=q.data
 return <div className="space-y-6"><PageHeader title={e.name} description={e.description??undefined}/><ExamLinks id={examId}/><Card><div className="grid gap-4 sm:grid-cols-2"><ChapterCell id={e.chapterId}/><Status value={e.status}/><p>Bắt đầu: {localDate(e.startAt)}</p><p>Kết thúc: {localDate(e.endAt)}</p><p>Thời lượng: {e.durationMinutes} phút · {e.questionCount} câu</p><p>Ngày tạo: {localDate(e.createdAt)}</p><p>Mở lúc: {localDate(e.openedAt)}</p><p>Đóng lúc: {localDate(e.closedAt)}</p><p>Bản ghi quyền (gồm đã thu hồi): {e.permissionCount}</p><p>Bài làm (gồm đang làm): {e.attemptCount}</p></div></Card><ExamActions exam={e}/>{e.status!=='Draft'&&<ExamBlueprint chapterId={e.chapterId}/>}
 {e.status==='Draft'&&<ExamForm key={e.updatedAt} exam={e} onSubmit={async v=>{await m.mutateAsync(v);toast.success('Đã lưu bài kiểm tra.')}}/>}</div>
}

