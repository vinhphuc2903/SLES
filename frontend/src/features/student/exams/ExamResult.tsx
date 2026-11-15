import {Link,useParams} from 'react-router'
import {PageHeader} from '@/components/ui/PageHeader'
import {Card} from '@/components/ui/Card'
import {ListSkeleton} from '@/features/admin/components/QueryFeedback'
import {ErrorState} from '@/components/feedback/ErrorState'
import {labels,managementError} from '@/features/teacher/management/utils'
import {examDate,useExam,useExamResult} from './data'
export function StudentExamResult(){
 const {attemptId=''}=useParams(),q=useExamResult(attemptId),metadata=useExam(q.data?.examId??'')
 if(q.isPending)return <ListSkeleton/>
 if(q.isError)return <div className="space-y-4"><ErrorState title="Chưa thể xem kết quả thi" description={managementError(q.error)} onRetry={()=>void q.refetch()}/><Link to={'/student/exam-attempts/'+attemptId}>Về bài thi</Link></div>
 const r=q.data
 return <div className="space-y-6"><PageHeader title="Kết quả thi" description={metadata.data?metadata.data.name+' · '+metadata.data.subjectName+' · '+metadata.data.chapterName:undefined}/><Card><p className="text-3xl font-bold text-brand-900">{r.score} / 10 · {r.percentage}%</p><p>{labels[r.status]}</p><p className="mt-4">Đúng: {r.correctAnswers} · Sai: {r.incorrectAnswers} · Chưa trả lời: {r.unansweredAnswers}</p><p>Bắt đầu: {examDate(r.startedAt)}</p><p>Nộp lúc: {examDate(r.submittedAt)}</p></Card>
 <div className="flex gap-4"><Link to="/student/exams/history">Lịch sử thi</Link><Link to="/student/exams">Danh sách bài kiểm tra</Link></div>
 <section aria-label="Xem lại bài thi" className="space-y-4"><h2 className="text-xl font-bold">Xem lại bài thi</h2>{r.questions.map(q=><Card key={q.id} title={'Câu '+q.number}><p className="whitespace-pre-wrap">{q.content}</p><p className="my-3 font-semibold">{q.selectedOptionId===null?'Chưa trả lời':q.isCorrect?'Trả lời đúng':'Trả lời sai'}</p><ol className="space-y-2">{q.options.map(o=><li key={o.id} className={'whitespace-pre-wrap rounded-xl border p-3 '+(o.isCorrect?'border-emerald-400 bg-emerald-50':o.id===q.selectedOptionId?'border-rose-400 bg-rose-50':'border-slate-200')}>{o.label}. {o.content}{o.isCorrect?' — Đáp án đúng':''}{o.id===q.selectedOptionId?' — Bạn đã chọn':''}</li>)}</ol></Card>)}</section></div>
}
