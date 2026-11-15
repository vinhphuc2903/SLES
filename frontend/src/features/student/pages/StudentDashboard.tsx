import {StudentExamSummary} from '../exams/ExamPages'
import {Link} from 'react-router'
import {useAuth} from '@/features/auth/hooks/useCurrentUser'
import {PageHeader} from '@/components/ui/PageHeader'
import {Card} from '@/components/ui/Card'
import {ListSkeleton,QueryError} from '@/features/admin/components/QueryFeedback'
import {localDate} from '@/features/teacher/management/utils'
import {useSubjects,useChapters,useHistory} from '../data/queries'
export function StudentDashboard(){
 const {user}=useAuth(),subjects=useSubjects({page:1,pageSize:1}),chapters=useChapters({page:1,pageSize:1}),history=useHistory({page:1,pageSize:5})
 const failed=[subjects,chapters,history].find(q=>q.isError)
 return <div className="space-y-6"><PageHeader eyebrow="Không gian học sinh" title={'Chào '+(user?.fullName??'bạn')+'!'} description="Đọc lý thuyết, luyện tập và theo dõi các bài của bạn."/>
 <div className="flex flex-wrap gap-4 font-semibold text-brand-700"><Link to="/student/subjects">Học tập theo môn</Link><Link to="/student/practice/history">Lịch sử / tiếp tục luyện tập</Link></div>
 {failed?<QueryError error={failed.error} retry={()=>{void subjects.refetch();void chapters.refetch();void history.refetch()}}/>:!subjects.data||!chapters.data||!history.data?<ListSkeleton/>:<>
 <section aria-label="Tổng quan học tập" className="grid gap-4 sm:grid-cols-3"><Card title="Môn học khả dụng"><p className="text-3xl font-bold">{subjects.data.totalCount}</p></Card><Card title="Chương đã xuất bản"><p className="text-3xl font-bold">{chapters.data.totalCount}</p></Card><Card title="Lượt luyện tập"><p className="text-3xl font-bold">{history.data.totalCount}</p></Card></section>
 <Card title="Luyện tập gần đây">{!history.data.items.length?<p>Chưa có lượt luyện tập. Chọn môn học để bắt đầu.</p>:<ul className="divide-y divide-slate-100">{history.data.items.map(r=><li key={r.attemptId} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-semibold">{r.chapterName}</p><p className="text-sm text-slate-600">{localDate(r.startedAt)} · {r.submittedAt&&r.score!==null?'Điểm '+r.score+' / 10':'Chưa nộp'}</p></div><Link className="text-brand-700" to={'/student/practice/'+r.attemptId+(r.submittedAt?'/result':'')}>{r.submittedAt?'Xem kết quả':'Tiếp tục'}</Link></li>)}</ul>}</Card></>}<StudentExamSummary/></div>
}
