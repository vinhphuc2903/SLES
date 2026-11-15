import { useState } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { ListSkeleton } from '@/features/admin/components/QueryFeedback'
import { ErrorState } from '@/components/feedback/ErrorState'
import { adminError } from '@/features/admin/utils/adminErrors'
import { useChapter,useStudents } from '../hooks/queries'
import { useExam,usePermissions,useGranted,useManagementMutation } from '../management/queries'
import { examApi } from '../management/api'
import { Status,ConfirmAction } from '../management/ui'
import { localDate,managementError } from '../management/utils'
import type { BulkItem } from '../management/contracts'
import type { Student } from '../types/contracts'
import { ExamLinks } from './ExamPages'
export function ExamPermissionsPage(){
 const {examId=''}=useParams(),exam=useExam(examId),[page,setPage]=useState(1),q=usePermissions(examId,page)
 return <div className="space-y-6"><PageHeader title={'Quyền tham gia: '+(exam.data?.name??'Bài kiểm tra')}/><ExamLinks id={examId}/>
 {exam.isPending?<ListSkeleton/>:exam.isError?<PermissionQueryError error={exam.error} retry={()=>void exam.refetch()}/>:exam.data.status==='Closed'||exam.data.status==='Cancelled'?<p>Bài kiểm tra đã đóng/hủy, không thể cấp thêm quyền.</p>:<EligibleStudents examId={examId} chapterId={exam.data.chapterId}/>}
 <Card title="Danh sách quyền">{q.isPending?<ListSkeleton/>:q.isError?<PermissionQueryError error={q.error} retry={()=>void q.refetch()}/>:<><DataTable emptyTitle="Chưa có quyền tham gia" emptyDescription="Cấp quyền cho học sinh đủ điều kiện để họ tham gia bài kiểm tra." rows={q.data.items} getRowKey={r=>r.studentId} columns={[
 {key:'name',header:'Học sinh',render:r=><>{r.fullName}<p>{r.username}</p></>},{key:'grade',header:'Khối lớp',render:r=>r.gradeName??'—'},{key:'status',header:'Quyền',render:r=><Status value={r.status}/>},{key:'date',header:'Cấp lúc',render:r=>localDate(r.grantedAt)},{key:'attempt',header:'Bài làm',render:r=>r.attemptStatus?<Status value={r.attemptStatus}/>:r.hasAttempt?'Đã bắt đầu':'Chưa bắt đầu'},
 {key:'action',header:'Thao tác',render:r=>r.status==='Granted'?<ConfirmAction resource="exams" label="Thu hồi quyền" disabled={r.hasAttempt} destructive description={'Thu hồi quyền của '+r.fullName+'. Không xóa lịch sử; không thể thu hồi sau khi đã bắt đầu bài làm.'} run={()=>examApi.revoke(examId,r.studentId)}/>:null}
 ]}/><Pagination page={page} pageSize={20} totalCount={q.data.totalCount} onPageChange={setPage}/></>}</Card></div>
}
function EligibleStudents({examId,chapterId}:{examId:string;chapterId:string}){
 const chapter=useChapter(chapterId)
 if(chapter.isPending)return <ListSkeleton/>
 if(chapter.isError)return <PermissionQueryError error={chapter.error} retry={()=>void chapter.refetch()}/>
 return <StudentSelector examId={examId} gradeId={chapter.data.chapter.gradeId} gradeName={chapter.data.chapter.gradeName}/>
}
function StudentSelector({examId,gradeId,gradeName}:{examId:string;gradeId:string;gradeName:string}){
 const [page,setPage]=useState(1),[search,setSearch]=useState(''),students=useStudents({page,pageSize:20,isActive:true,gradeId,search}),granted=useGranted(examId)
 return <Card title={'Cấp quyền cho học sinh '+gradeName}><p className="mb-3 text-sm">Chỉ học sinh đang hoạt động, thuộc bạn và cùng khối được chọn. Cấp hàng loạt có thể thành công một phần.</p>
 <input aria-label="Tìm học sinh" placeholder="Tìm học sinh..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} className="mb-4 w-full rounded-xl border p-3"/>
 {students.isPending||granted.isPending?<ListSkeleton/>:students.isError||granted.isError?<PermissionQueryError error={students.error??granted.error} retry={()=>{void students.refetch();void granted.refetch()}}/>:<>
 <Selection key={examId+':'+page+':'+search} examId={examId} students={students.data.items} grantedIds={new Set(granted.data.map(p=>p.studentId))}/>
 <Pagination page={page} pageSize={20} totalCount={students.data.totalCount} onPageChange={setPage}/></>}</Card>
}
function Selection({examId,students,grantedIds}:{examId:string;students:Student[];grantedIds:Set<string>}){
 const [selected,setSelected]=useState<string[]>([]),[confirm,setConfirm]=useState(false),[results,setResults]=useState<BulkItem[]>([]),[error,setError]=useState('')
 const bulk=useManagementMutation('exams',(ids:string[])=>examApi.bulk(examId,ids))
 const eligible=students.filter(s=>!grantedIds.has(s.id))
 const ids=selected.filter(id=>eligible.some(s=>s.id===id))
 return <div className="space-y-4"><div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={bulk.isPending} onClick={()=>setSelected(eligible.map(s=>s.id))}>Chọn tất cả trên trang</Button><Button variant="secondary" disabled={bulk.isPending} onClick={()=>setSelected([])}>Bỏ chọn</Button><Button disabled={!ids.length} loading={bulk.isPending} onClick={()=>setConfirm(true)}>Cấp quyền đã chọn ({ids.length})</Button></div>
 <DataTable emptyTitle="Không có học sinh phù hợp" emptyDescription="Không tìm thấy học sinh đang hoạt động, thuộc bạn và cùng khối với điều kiện tìm kiếm hiện tại." rows={students} getRowKey={s=>s.id} columns={[
 {key:'check',header:'Chọn',render:s=><input aria-label={'Chọn '+s.username} type="checkbox" disabled={grantedIds.has(s.id)||bulk.isPending} checked={ids.includes(s.id)} onChange={e=>setSelected(e.target.checked?[...selected,s.id]:selected.filter(id=>id!==s.id))}/>},
 {key:'student',header:'Học sinh',render:s=><>{s.fullName}<p>{s.username}</p></>},
 {key:'action',header:'Thao tác',render:s=>grantedIds.has(s.id)?'Đã cấp quyền':<ConfirmAction resource="exams" label={'Cấp quyền cho '+s.username} disabled={bulk.isPending} description={'Cấp quyền làm bài cho '+s.fullName+'?'} run={()=>examApi.grant(examId,s.id)}/>}
 ]}/>
 <ConfirmationDialog open={confirm} title="Cấp quyền hàng loạt?" description={'Cấp quyền cho '+ids.length+' học sinh đã chọn trên trang hiện tại. Máy chủ kiểm tra từng học sinh; các mục hợp lệ có thể được cấp dù mục khác thất bại.'} busy={bulk.isPending} confirmLabel="Xác nhận cấp quyền" onCancel={()=>setConfirm(false)} onConfirm={async()=>{if(bulk.isPending)return;try{const result=await bulk.mutateAsync(ids);setResults(result);setSelected([]);setConfirm(false);setError('');toast.success('Đã xử lý yêu cầu cấp quyền.')}catch(e){setError(managementError(e));setConfirm(false)}}}/>
 {error&&<p role="alert" className="text-rose-700">{error}</p>}
 {results.length>0&&<div role="status"><h3 className="font-semibold">Kết quả cấp quyền</h3><ul>{results.map(r=><li key={r.studentId}>{students.find(s=>s.id===r.studentId)?.fullName??r.studentId}: {r.granted?'Đã cấp quyền':r.detail==='Closed exams cannot receive permissions.'?'Bài kiểm tra đã đóng, không thể cấp quyền.':'Không đủ điều kiện. Kiểm tra trạng thái học sinh, chủ sở hữu và khối lớp.'}</li>)}</ul></div>}</div>
}


function PermissionQueryError({error,retry}:{error:unknown;retry:()=>void}) {
 const failure=adminError(error)
 const titles:Record<number,string>={401:'Phiên đăng nhập đã hết hạn',403:'Bạn không có quyền truy cập',404:'Không tìm thấy tài nguyên',500:'Máy chủ không thể tải quyền dự thi'}
 return <ErrorState title={titles[failure.status??0]??'Không thể tải dữ liệu'} description={failure.message} onRetry={[401,403,404].includes(failure.status??0)?undefined:retry}/>
}
