import {useRef,useState} from 'react'
import {Link,useNavigate,useParams} from 'react-router'
import {useMutation,useQueryClient} from '@tanstack/react-query'
import {PageHeader} from '@/components/ui/PageHeader'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'
import {ListSkeleton,QueryError} from '@/features/admin/components/QueryFeedback'
import {useChapter,useHistory,useStudentKeys} from '../data/queries'
import {studentApi} from '../data/api'
import {practiceError} from '../data/errors'
import {normalizeApiError} from '@/lib/api/apiErrors'
export function PracticeStart(){
 const {chapterId=''}=useParams(),q=useChapter(chapterId),history=useHistory({page:1,pageSize:5,chapterId}),keys=useStudentKeys(),client=useQueryClient(),navigate=useNavigate()
 const lock=useRef(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false)
 const start=useMutation({mutationFn:()=>studentApi.start(chapterId),retry:false})
 if(q.isPending)return <ListSkeleton/>
 if(q.isError)return <QueryError error={q.error} retry={()=>void q.refetch()}/>
 return <div className="space-y-6"><PageHeader title={'Luyện tập: '+q.data.chapter.name} description={q.data.chapter.subjectName}/><Card title="Chuẩn bị luyện tập"><ul className="list-disc space-y-2 pl-5"><li>Mỗi bài gồm đúng 200 câu, mỗi câu chọn một phương án.</li><li>Luyện tập không giới hạn số lần. Mỗi lần bắt đầu tạo một bài mới.</li><li>Đáp án được lưu lên máy chủ; đáp án đúng chỉ có sau khi nộp bài.</li><li>Có thể nộp khi còn câu chưa trả lời. Điểm do máy chủ tính.</li></ul>
 {error&&<p role="alert" className="my-4 text-rose-700">{error}</p>}{uncertain&&<p className="my-4">Chưa xác định yêu cầu bắt đầu đã thành công hay chưa. Hãy mở lịch sử để tìm bài vừa tạo trước khi bắt đầu lần khác.</p>}
 <Button className="mt-5" loading={start.isPending} disabled={uncertain} onClick={async()=>{if(lock.current)return;lock.current=true;setError('');try{const a=await start.mutateAsync();client.setQueryData([...keys.practice,'attempt',a.attemptId],a);void client.invalidateQueries({queryKey:[...keys.practice,'history']});navigate('/student/practice/'+a.attemptId)}catch(e){setError(practiceError(e));const status=normalizeApiError(e).status;setUncertain(status===null||status>=500);lock.current=false}}}>Bắt đầu bài mới</Button>
 <Link className="ml-4 text-brand-700" to={'/student/practice/history?chapterId='+chapterId}>Lịch sử / tiếp tục bài cũ</Link></Card>
 {history.data?.items.some(r=>!r.submittedAt)&&<Card title="Bài chưa nộp gần đây">{history.data.items.filter(r=>!r.submittedAt).map(r=><p key={r.attemptId} className="py-2"><Link to={'/student/practice/'+r.attemptId}>Tiếp tục bài bắt đầu {new Date(r.startedAt).toLocaleString('vi-VN')}</Link></p>)}</Card>}
 <Link to={'/student/chapters/'+chapterId}>Về lý thuyết</Link></div>
}

