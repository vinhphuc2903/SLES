import { Link,useParams } from 'react-router'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { Card } from '@/components/ui/Card'
import { ListSkeleton,QueryError } from '@/features/admin/components/QueryFeedback'
import { useResults,useAttempt,useExam } from '../management/queries'
import { Status,SearchToolbar } from '../management/ui'
import { localDate,usePageQuery,managementError } from '../management/utils'
import { ExamLinks } from './ExamPages'
export function ExamResultsPage(){
 const {examId=''}=useParams(),p=usePageQuery(),q=useResults(examId,p.page,p.keyword),exam=useExam(examId)
 return <div className="space-y-6"><PageHeader title={'Kết quả: '+(exam.data?.name??'Bài kiểm tra')} description="Điểm chính thức do máy chủ cung cấp. Bài đang làm chưa có điểm."/><ExamLinks id={examId}/><SearchToolbar {...p}/>
 {q.isPending?<ListSkeleton/>:q.isError?<QueryError error={q.error} retry={()=>void q.refetch()}/>:<><DataTable rows={q.data.items} getRowKey={r=>r.studentId} columns={[
 {key:'student',header:'Học sinh',render:r=><>{r.fullName}<p>{r.username}</p></>},{key:'permission',header:'Quyền',render:r=><Status value={r.permissionStatus}/>},{key:'status',header:'Bài làm',render:r=><Status value={r.attemptStatus}/>},{key:'score',header:'Điểm',render:r=>r.score===null?'Chưa có':r.score+' / 10'},{key:'percent',header:'Tỷ lệ',render:r=>r.percentage===null?'—':r.percentage+'%'},{key:'date',header:'Nộp lúc',render:r=>r.submittedAt?localDate(r.submittedAt):'Chưa nộp'},{key:'action',header:'Chi tiết',render:r=>r.attemptId?<Link to={'/teacher/exams/'+examId+'/attempts/'+r.attemptId}>Xem bài làm</Link>:'Chưa bắt đầu'}
 ]}/><Pagination page={p.page} pageSize={20} totalCount={q.data.totalCount} onPageChange={p.setPage}/></>}</div>
}
export function ExamAttemptPage(){
 const {examId='',attemptId=''}=useParams(),q=useAttempt(examId,attemptId),exam=useExam(examId)
 if(q.isPending)return <ListSkeleton/>
 if(q.isError)return <div className="space-y-4"><ExamLinks id={examId}/><p role="alert">{managementError(q.error)}</p><QueryError error={q.error} retry={()=>void q.refetch()}/></div>
 const r=q.data
 return <div className="space-y-6"><PageHeader title={'Bài làm: '+(exam.data?.name??'Bài kiểm tra')} description="Nội dung và đáp án từ bản chụp lịch sử, không lấy từ ngân hàng câu hỏi hiện tại."/><ExamLinks id={examId}/><Card><Status value={r.status}/><p className="mt-4 text-2xl font-bold">Điểm: {r.score} / 10 · {r.percentage}%</p><p>Nộp lúc: {localDate(r.submittedAt)}</p><p>Đúng: {r.correctAnswers} · Sai: {r.incorrectAnswers} · Chưa trả lời: {r.unansweredAnswers} · Tổng: {r.totalQuestions}</p></Card>
 <Card><p>Học sinh: {r.studentFullName??'Chưa có thông tin'} {r.studentUsername?'('+r.studentUsername+')':''}</p><p>Bắt đầu: {localDate(r.startedAt)}</p></Card>
 {r.questions.map(q=><Card key={q.id} title={'Câu '+q.number}><p className="whitespace-pre-wrap">{q.content}</p><p className="my-3 font-semibold">{q.selectedOptionId===null?'Chưa trả lời':q.isCorrect?'Trả lời đúng':'Trả lời sai'}</p><ol className="space-y-3">{q.options.map(o=><li key={o.id} className={'whitespace-pre-wrap rounded-xl border p-3 '+(o.isCorrect?'border-emerald-400 bg-emerald-50':o.id===q.selectedOptionId?'border-rose-400 bg-rose-50':'border-slate-200')}>{o.label}. {o.content}{o.isCorrect?' — Đáp án đúng':''}{o.id===q.selectedOptionId?' — Học sinh đã chọn':''}</li>)}</ol></Card>)}</div>
}

