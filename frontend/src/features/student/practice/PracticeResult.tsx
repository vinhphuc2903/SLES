import {useState} from 'react'
import {Link,useParams} from 'react-router'
import {PageHeader} from '@/components/ui/PageHeader'
import {Card} from '@/components/ui/Card'
import {Pagination} from '@/components/ui/Pagination'
import {ListSkeleton} from '@/features/admin/components/QueryFeedback'
import {ErrorState} from '@/components/feedback/ErrorState'
import {localDate} from '@/features/teacher/management/utils'
import {useResult} from '../data/queries'
import {practiceError} from '../data/errors'
export function PracticeResultPage(){
 const {attemptId=''}=useParams(),q=useResult(attemptId),[page,setPage]=useState(1)
 if(q.isPending)return <ListSkeleton/>
 if(q.isError)return <div className="space-y-4"><ErrorState title="Chưa thể xem kết quả" description={practiceError(q.error)} onRetry={()=>void q.refetch()}/><Link to={'/student/practice/'+attemptId}>Về bài luyện tập</Link></div>
 const r=q.data
 return <div className="space-y-6"><PageHeader title="Kết quả luyện tập" description={r.chapterName+' · '+r.subjectName}/><Card><p className="text-3xl font-bold text-brand-900">{r.score} / 10 · {r.percentage}%</p><p className="mt-4">Đúng: {r.correctAnswers} · Sai: {r.incorrectAnswers} · Chưa trả lời: {r.unansweredQuestions}</p><p>Bắt đầu: {localDate(r.startedAt)}</p><p>Nộp lúc: {localDate(r.completedAt)}</p></Card>
 <div className="flex flex-wrap gap-4 text-brand-700"><Link to={'/student/chapters/'+r.chapterId+'/practice'}>Làm lại</Link><Link to="/student/practice/history">Lịch sử luyện tập</Link><Link to="/student/subjects">Về môn học</Link><a href="#review">Xem chi tiết</a></div>
 <section id="review" aria-label="Xem lại đáp án" className="space-y-4"><h2 className="text-xl font-bold">Xem lại đáp án</h2>{r.questions.slice((page-1)*20,page*20).map(q=><Card key={q.questionId} title={'Câu '+q.number}><p className="whitespace-pre-wrap">{q.content}</p><p className="my-3 font-semibold">{q.selectedOptionId===null?'Chưa trả lời':q.isCorrect?'Trả lời đúng':'Trả lời sai'}</p><ol className="space-y-2">{q.options.map(o=><li key={o.id} className={'whitespace-pre-wrap rounded-xl border p-3 '+(o.isCorrect?'border-emerald-400 bg-emerald-50':o.id===q.selectedOptionId?'border-rose-400 bg-rose-50':'border-slate-200')}>{o.label}. {o.content}{o.isCorrect?' — Đáp án đúng':''}{o.id===q.selectedOptionId?' — Bạn đã chọn':''}</li>)}</ol></Card>)}<Pagination page={page} pageSize={20} totalCount={r.questions.length} onPageChange={setPage}/></section></div>
}

