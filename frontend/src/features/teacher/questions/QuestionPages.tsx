import {useSearchParams} from 'react-router'
import {QuestionTable} from './QuestionTable'
import {QuestionClassification} from './QuestionClassification'
import {difficultyCodes,difficultyLabels,difficultyLabel} from './difficulty'
import {DownloadQuestionTemplate,QuestionImport} from './QuestionImport'
import { Link,useNavigate,useParams } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { Card } from '@/components/ui/Card'
import { ListSkeleton,QueryError } from '@/features/admin/components/QueryFeedback'
import { useChapters,useChapter } from '../hooks/queries'
import { Filters } from '../components/Filters'
import { useFilters } from '../hooks/useFilters'
import { questionApi } from '../management/api'
import { useQuestions,useQuestion,useManagementMutation } from '../management/queries'
import { Status,ConfirmAction,SearchToolbar } from '../management/ui'
import { usePageQuery } from '../management/utils'
import type { Question,QuestionInput } from '../management/contracts'
import { QuestionProgress } from './QuestionProgress'
import { QuestionForm } from './QuestionForm'
export function QuestionBankPage(){
 const {params,setPage,filter}=useFilters(true),q=useChapters(params)
 return <div className="space-y-6"><PageHeader title="Ngân hàng câu hỏi" description="Chọn chương do bạn quản lý để xem và biên soạn câu hỏi." actions={<DownloadQuestionTemplate/>}/><Filters chapters params={params} onFilter={filter}/>
 {q.isPending?<ListSkeleton/>:q.isError?<QueryError error={q.error} retry={()=>void q.refetch()}/>:<><DataTable rows={q.data.items} getRowKey={c=>c.id} columns={[
 {key:'name',header:'Chương',render:c=><Link to={'/teacher/chapters/'+c.id+'/questions'}>{c.name}</Link>},{key:'subject',header:'Môn',render:c=>c.subjectName},{key:'grade',header:'Khối',render:c=>c.gradeName},{key:'status',header:'Trạng thái',render:c=><Status value={c.status}/>},{key:'action',header:'Thao tác',render:c=><Link to={'/teacher/chapters/'+c.id+'/questions'}>Quản lý câu hỏi</Link>}]}/><Pagination {...params} totalCount={q.data.totalCount} onPageChange={setPage}/></>}</div>
}
function QuestionActions({question:q}:{question:Question}){
 const navigate=useNavigate()
 return <div className="flex flex-wrap gap-2">{q.status==='Draft'&&<ConfirmAction label="Xuất bản câu hỏi" description="Xuất bản câu hỏi này sau khi máy chủ kiểm tra bốn phương án và một đáp án đúng." resource="questions" run={()=>questionApi.action(q.id,'publish')}/>}
 {q.status!=='Archived'&&<ConfirmAction label="Lưu trữ câu hỏi" description="Câu hỏi sẽ ngừng được chọn cho các bài làm mới. Lịch sử đã lưu được giữ lại." resource="questions" run={()=>questionApi.action(q.id,'archive')}/>}
 {q.status==='Draft'&&<ConfirmAction label="Xóa câu hỏi" description="Xóa mềm câu hỏi bản nháp. Máy chủ chặn nếu câu hỏi đã được tham chiếu bởi lịch sử." resource="questions" destructive run={()=>questionApi.action(q.id,'delete')} onDone={()=>navigate('/teacher/chapters/'+q.chapterId+'/questions')}/>}</div>
}
export function ChapterQuestionsPage(){
 const {chapterId=''}=useParams(),p=usePageQuery(),[search,setSearch]=useSearchParams(),difficulty=search.get('difficulty')??'',chapter=useChapter(chapterId),q=useQuestions(chapterId,{page:p.page,pageSize:20,keyword:p.keyword,status:p.status,difficulty:difficulty&&difficulty!=='missing'?difficulty:undefined,unclassified:difficulty==='missing'})
 return <div className="space-y-6"><PageHeader title={'Câu hỏi: '+(chapter.data?.chapter.name??'Chương học')} actions={chapter.data?.chapter.status==='Draft'?<Link to={'/teacher/chapters/'+chapterId+'/questions/new'}>Tạo câu hỏi</Link>:undefined}/>
 {chapter.data?.chapter.status==='Draft'&&<QuestionImport key={chapterId} chapterId={chapterId}/>}
 <QuestionProgress chapterId={chapterId}/><label>Lọc mức độ<select aria-label="Lọc mức độ" className="m-3 rounded-xl border p-3" value={difficulty} onChange={e=>{const next=new URLSearchParams(search);next.set('difficulty',e.target.value);next.delete('page');setSearch(next)}}><option value="">Tất cả mức độ</option><option value="missing">Chưa phân loại</option>{difficultyCodes.map(d=><option key={d} value={d}>{difficultyLabels[d]}</option>)}</select></label><SearchToolbar {...p} statuses={['Draft','Published','Archived']} filter={form=>{const next=new URLSearchParams(search);new FormData(form).forEach((value,key)=>{if(String(value).trim())next.set(key,String(value).trim());else next.delete(key)});next.delete('page');setSearch(next)}}/>
 {q.isPending?<ListSkeleton/>:q.isError?<QueryError error={q.error} retry={()=>void q.refetch()}/>:<><QuestionTable key={[chapterId,p.page,p.keyword,p.status,difficulty].join(':')} rows={q.data.items} chapterId={chapterId} editable={chapter.data?.chapter.status==='Draft'} actions={r=><QuestionActions question={r}/>}/><Pagination page={p.page} pageSize={20} totalCount={q.data.totalCount} onPageChange={p.setPage}/></>}</div>
}
export function QuestionCreatePage(){
 const {chapterId=''}=useParams(),q=useChapter(chapterId),navigate=useNavigate()
 const m=useManagementMutation('questions',(v:QuestionInput)=>questionApi.create(chapterId,v))
 if(q.isPending)return <ListSkeleton/>
 if(q.isError)return <QueryError error={q.error} retry={()=>void q.refetch()}/>
 return <div className="space-y-6"><PageHeader title="Tạo câu hỏi" description={q.data.chapter.name}/>{q.data.chapter.status!=='Draft'?<p>Chỉ chương bản nháp mới được thêm câu hỏi.</p>:<QuestionForm onSubmit={async v=>{const result=await m.mutateAsync(v);toast.success('Đã tạo câu hỏi bản nháp.');navigate('/teacher/questions/'+result.question.id)}}/>}</div>
}
export function QuestionDetailPage(){
 const {questionId=''}=useParams(),q=useQuestion(questionId),m=useManagementMutation('questions',(v:QuestionInput)=>questionApi.update(questionId,v))
 if(q.isPending)return <ListSkeleton/>
 if(q.isError)return <QueryError error={q.error} retry={()=>void q.refetch()}/>
 const d=q.data
 return <div className="space-y-6"><PageHeader title="Chi tiết câu hỏi" actions={<Link to={'/teacher/chapters/'+d.question.chapterId+'/questions'}>Về ngân hàng chương</Link>}/><Status value={d.question.status}/><p>Mức độ: {difficultyLabel(d.question.difficulty)}</p>{d.question.status==='Published'&&!d.question.difficulty&&<QuestionClassification id={questionId}/>}<QuestionActions question={d.question}/>
 {d.question.status==='Draft'?<QuestionForm key={d.question.updatedAt} detail={d} onSubmit={async v=>{await m.mutateAsync(v);toast.success('Đã lưu câu hỏi.')}}/>:<Card><p className="whitespace-pre-wrap">{d.question.content}</p><ol className="mt-4 space-y-3">{[...d.options].sort((a,b)=>a.displayOrder-b.displayOrder).map(o=><li key={o.id} className="whitespace-pre-wrap">{o.label}. {o.content}{o.isCorrect?' — Đáp án đúng':''}</li>)}</ol><p className="mt-4 text-sm">Câu hỏi đã xuất bản hoặc lưu trữ: chỉ đọc.</p></Card>}</div>
}

