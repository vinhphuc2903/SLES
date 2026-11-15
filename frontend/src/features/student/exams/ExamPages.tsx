import {useEffect,useRef,useState} from 'react'
import {Link,useNavigate,useParams} from 'react-router'
import {useQueryClient} from '@tanstack/react-query'
import {PageHeader} from '@/components/ui/PageHeader'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'
import {Pagination} from '@/components/ui/Pagination'
import {DataTable} from '@/components/ui/DataTable'
import {ListSkeleton,QueryError} from '@/features/admin/components/QueryFeedback'
import {labels,managementError,usePageQuery} from '@/features/teacher/management/utils'
import {normalizeApiError} from '@/lib/api/apiErrors'
import {attemptPath,examApi,examDate,useExam,useExams,useExamHistory,useExamKeys,type StudentExam,type ExamAttempt} from './data'
function ExamCard({exam:e}:{exam:StudentExam}){return <Card title={e.name}><p>{e.subjectName} · {e.chapterName}</p><p>{e.durationMinutes} phút · {labels[e.status]}</p><p>Bắt đầu: {examDate(e.startAt)}</p><p>Kết thúc: {examDate(e.endAt)}</p><p>{e.attemptStatus?labels[e.attemptStatus]:e.canStart?'Có thể bắt đầu':'Chưa thể bắt đầu'}</p><Link className="font-semibold text-brand-700" to={'/student/exams/'+e.id}>Xem chi tiết</Link>{e.attemptId&&<Link className="ml-4 text-brand-700" to={attemptPath({attemptId:e.attemptId,status:e.attemptStatus!})}>{e.attemptStatus==='InProgress'?'Tiếp tục bài thi':'Xem kết quả thi'}</Link>}</Card>}
export function StudentExamsPage(){const p=usePageQuery(),q=useExams(p.page);return <div className="space-y-6"><PageHeader title="Bài kiểm tra" description="Lịch thi và quyền dự thi do giáo viên cấp. Máy chủ kiểm tra điều kiện khi bắt đầu." actions={<Link to="/student/exams/history">Lịch sử thi</Link>}/>{q.isPending?<ListSkeleton/>:q.isError?<QueryError error={q.error} retry={()=>void q.refetch()}/>:<>{!q.data.items.length?<Card>Chưa có bài kiểm tra được cấp quyền.</Card>:<div className="grid gap-4 md:grid-cols-2">{q.data.items.map(e=><ExamCard key={e.id} exam={e}/>)}</div>}<Pagination page={p.page} pageSize={20} totalCount={q.data.totalCount} onPageChange={p.setPage}/></>}</div>}
export function StudentExamDetail(){
 const {examId=''}=useParams(),q=useExam(examId),navigate=useNavigate(),client=useQueryClient(),keys=useExamKeys()
 const lock=useRef(false),active=useRef(true),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('')
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 function open(a:ExamAttempt){if(!active.current)return;client.setQueryData([...keys,'attempt',a.attemptId],a);void client.invalidateQueries({queryKey:keys});navigate(attemptPath(a))}
 async function recover(){
  try{open(await examApi.current(examId))}
  catch(e){if(!active.current)return;if(normalizeApiError(e).status===404){setUncertain(false);setError('Máy chủ chưa tìm thấy lượt thi. Hãy tải lại điều kiện trước khi bắt đầu lại.');await q.refetch()}else{setUncertain(true);setError('Chưa xác định được lượt thi. '+managementError(e))}}
 }
 async function start(){
  if(lock.current||uncertain||!q.data?.canStart)return
  lock.current=true;setBusy(true);setError('')
  try{open(await examApi.start(examId))}catch(e){if(active.current){setError(managementError(e));setUncertain(true);await recover()}}
  finally{lock.current=false;if(active.current)setBusy(false)}
 }
 async function check(){if(lock.current)return;lock.current=true;setBusy(true);try{await recover()}finally{lock.current=false;if(active.current)setBusy(false)}}
 if(q.isPending)return <ListSkeleton/>
 if(q.isError)return <QueryError error={q.error} retry={()=>void q.refetch()}/>
 const e=q.data
 return <div className="space-y-6"><PageHeader title={e.name} description={e.subjectName+' · '+e.chapterName}/><Card title="Thông tin bài kiểm tra"><p>{e.description}</p><p>Thời lượng: {e.durationMinutes} phút · 10 câu hỏi</p><p>Bắt đầu: {examDate(e.startAt)}</p><p>Kết thúc: {examDate(e.endAt)}</p><p>{labels[e.status]} · {e.attemptStatus?labels[e.attemptStatus]:'Chưa làm bài'}</p><p className="mt-4">Mỗi học sinh có một lượt thi. Đáp án được lưu khi máy chủ xác nhận. Thời gian làm bài kết thúc theo hạn nộp máy chủ; tải lại trang không làm tăng thời gian. Câu bỏ trống vẫn được nộp.</p></Card>{error&&<p role="alert">{error}</p>}
 {e.attemptId?<Link to={attemptPath({attemptId:e.attemptId,status:e.attemptStatus!})}>{e.attemptStatus==='InProgress'?'Tiếp tục bài thi':'Xem kết quả thi'}</Link>:uncertain?<Button loading={busy} onClick={()=>void check()}>Kiểm tra lượt thi</Button>:e.canStart?<Button loading={busy} onClick={()=>void start()}>Bắt đầu thi</Button>:<p>Chưa thể bắt đầu theo lịch hoặc trạng thái hiện tại.</p>}
 <div className="flex gap-4"><Button variant="secondary" disabled={busy} onClick={()=>void q.refetch()}>Cập nhật điều kiện</Button><Link to="/student/exams">Danh sách bài kiểm tra</Link></div></div>
}
export function StudentExamHistory(){const p=usePageQuery(),q=useExamHistory(p.page);return <div className="space-y-6"><PageHeader title="Lịch sử thi" actions={<Link to="/student/exams">Danh sách bài kiểm tra</Link>}/>{q.isPending?<ListSkeleton/>:q.isError?<QueryError error={q.error} retry={()=>void q.refetch()}/>:<><DataTable rows={q.data.items} getRowKey={r=>r.attemptId} columns={[
 {key:'name',header:'Bài kiểm tra',render:r=><><Link to={'/student/exams/'+r.examId}>{r.examName}</Link><p>{r.subjectName} · {r.chapterName}</p></>},{key:'status',header:'Trạng thái',render:r=>labels[r.status]},{key:'started',header:'Bắt đầu',render:r=>examDate(r.startedAt)},{key:'submitted',header:'Nộp lúc',render:r=>r.submittedAt?examDate(r.submittedAt):'Chưa nộp'},{key:'score',header:'Điểm',render:r=>r.status!=='InProgress'&&r.score!==null?r.score+' / 10':'Chưa có'},{key:'action',header:'Thao tác',render:r=><Link to={attemptPath(r)}>{r.status==='InProgress'?'Tiếp tục bài thi':'Xem kết quả thi'}</Link>}
 ]}/><Pagination page={p.page} pageSize={20} totalCount={q.data.totalCount} onPageChange={p.setPage}/></>}</div>}
export function StudentExamSummary(){const q=useExams(1,3),history=useExamHistory(1,1);return <Card title="Bài kiểm tra của bạn"><Link to="/student/exams">Xem lịch thi và bài được cấp quyền</Link><span> · </span><Link to="/student/exams/history">Lịch sử thi</Link>{q.isPending?<ListSkeleton/>:q.isError?<QueryError error={q.error} retry={()=>void q.refetch()}/>:<div className="mt-4 space-y-3">{!q.data.items.length?<p>Chưa có bài kiểm tra được cấp quyền.</p>:q.data.items.map(e=><div key={e.id}><Link to={'/student/exams/'+e.id}>{e.name}</Link> · {labels[e.status]} · {examDate(e.startAt)}</div>)}</div>}{history.isPending?<ListSkeleton/>:history.isError?<QueryError error={history.error} retry={()=>void history.refetch()}/>:history.data.items.map(r=><p key={r.attemptId} className="mt-4">Lượt thi gần nhất: <Link to={attemptPath(r)}>{r.examName}</Link> · {labels[r.status]}{r.score!==null?' · '+r.score+' / 10':''}</p>)}</Card>}
