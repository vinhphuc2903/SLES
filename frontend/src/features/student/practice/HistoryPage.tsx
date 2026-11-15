import {Link,useSearchParams} from 'react-router'
import {PageHeader} from '@/components/ui/PageHeader'
import {DataTable} from '@/components/ui/DataTable'
import {Pagination} from '@/components/ui/Pagination'
import {ListSkeleton,QueryError} from '@/features/admin/components/QueryFeedback'
import {localDate,usePageQuery} from '@/features/teacher/management/utils'
import {useHistory} from '../data/queries'
export function PracticeHistoryPage(){
 const [search]=useSearchParams(),chapterId=search.get('chapterId')||undefined,p=usePageQuery(),q=useHistory({page:p.page,pageSize:20,chapterId})
 return <div className="space-y-6"><PageHeader title="Lịch sử luyện tập" description="Tiếp tục bài chưa nộp hoặc xem kết quả bài đã hoàn thành." actions={<Link to="/student/subjects">Chọn chương luyện tập</Link>}/>{chapterId&&<Link to="/student/practice/history">Bỏ lọc chương</Link>}
 {q.isPending?<ListSkeleton/>:q.isError?<QueryError error={q.error} retry={()=>void q.refetch()}/>:<><DataTable rows={q.data.items} getRowKey={r=>r.attemptId} columns={[
 {key:'chapter',header:'Chương',render:r=><Link to={'/student/practice/history?chapterId='+r.chapterId}>{r.chapterName}</Link>},{key:'start',header:'Bắt đầu',render:r=>localDate(r.startedAt)},{key:'status',header:'Trạng thái',render:r=>r.submittedAt?'Đã nộp':'Đang làm'},{key:'date',header:'Nộp lúc',render:r=>r.submittedAt?localDate(r.submittedAt):'Chưa nộp'},{key:'score',header:'Điểm',render:r=>r.submittedAt&&r.score!==null?r.score+' / 10':'Chưa có'},{key:'action',header:'Thao tác',render:r=><Link to={'/student/practice/'+r.attemptId+(r.submittedAt?'/result':'')}>{r.submittedAt?'Xem kết quả':'Tiếp tục'}</Link>}
 ]}/><Pagination page={p.page} pageSize={20} totalCount={q.data.totalCount} onPageChange={p.setPage}/></>}</div>
}

