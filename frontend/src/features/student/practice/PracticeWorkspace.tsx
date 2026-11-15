import {useEffect,useRef,useState} from 'react'
import {Link,Navigate,useBlocker,useNavigate,useParams,useSearchParams} from 'react-router'
import {useMutation,useQueryClient} from '@tanstack/react-query'
import {PageHeader} from '@/components/ui/PageHeader'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'
import {ConfirmationDialog} from '@/components/ui/ConfirmationDialog'
import {ListSkeleton,QueryError} from '@/features/admin/components/QueryFeedback'
import {useAttempt,useStudentKeys} from '../data/queries'
import {studentApi} from '../data/api'
import {practiceError} from '../data/errors'
import type {Attempt,Result} from '../data/contracts'
interface AnswerState {selected:string|null;saved:string|null;pending:boolean;error:string}
export function PracticeWorkspace(){
 const {attemptId=''}=useParams(),q=useAttempt(attemptId)
 if(q.isPending)return <ListSkeleton/>
 if(q.isError)return <QueryError error={q.error} retry={()=>void q.refetch()}/>
 if(q.data.isSubmitted)return <Navigate to={'/student/practice/'+attemptId+'/result'} replace/>
 if(q.data.totalQuestions!==200||q.data.questions.length!==200||q.data.questions.some(q=>q.options.length!==4))return <p role="alert">Dữ liệu bài luyện tập không đủ 200 câu với bốn phương án. Vui lòng tải lại hoặc liên hệ giáo viên.</p>
 return <Workspace key={attemptId} attempt={q.data}/>
}
function Workspace({attempt}:{attempt:Attempt}){
 const keys=useStudentKeys(),client=useQueryClient(),navigate=useNavigate(),[search,setSearch]=useSearchParams()
 const index=Math.max(0,Math.min(attempt.questions.length-1,Math.floor(Number(search.get('q'))||1)-1))
 const current=attempt.questions[index]!
 const [answers,setAnswers]=useState<Record<string,AnswerState>>(()=>Object.fromEntries(attempt.questions.map(q=>[q.id,{selected:q.selectedOptionId,saved:q.selectedOptionId,pending:false,error:''}])))
 const records=useRef(answers),active=useRef(true),submitLock=useRef(false),leave=useRef(false),uncertainRef=useRef(false)
 const [confirm,setConfirm]=useState(false),[submitting,setSubmitting]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('')
 const submitMutation=useMutation({mutationFn:()=>studentApi.submit(attempt.attemptId),retry:false})
 const saveMutation=useMutation({mutationFn:({id,value}:{id:string;value:string|null})=>studentApi.save(attempt.attemptId,id,value),retry:false,gcTime:0})
 const update=(id:string,patch:Partial<AnswerState>)=>{const previous=records.current[id]!;records.current={...records.current,[id]:{...previous,...patch}};if(active.current)setAnswers(records.current)}
 const unresolved=()=>Object.values(records.current).some(a=>a.pending||a.error||a.selected!==a.saved)
 const blocker=useBlocker(({currentLocation,nextLocation})=>currentLocation.pathname!==nextLocation.pathname&&!leave.current&&(unresolved()||submitLock.current||uncertainRef.current))
 const dirty=Object.values(answers).some(a=>a.pending||a.error||a.selected!==a.saved)
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 useEffect(()=>{
  if(!dirty&&!submitting&&!uncertain)return
  const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''}
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)
 },[dirty,submitting,uncertain])
 async function persist(id:string){
  if(records.current[id]!.pending||!active.current)return
  update(id,{pending:true,error:''})
  try{
   // One in-flight write per question; coalesce changes to the latest selection.
   while(active.current){
    const value=records.current[id]!.selected
    await saveMutation.mutateAsync({id,value})
    if(!active.current)return
    update(id,{saved:value})
    client.setQueryData<Attempt>([...keys.practice,'attempt',attempt.attemptId],old=>old?{...old,answeredQuestions:Object.values(records.current).filter(a=>a.saved!==null).length,questions:old.questions.map(q=>q.id===id?{...q,selectedOptionId:value}:q)}:old)
    if(records.current[id]!.selected===value)break
   }
   if(active.current)update(id,{pending:false})
  }catch(e){if(active.current)update(id,{pending:false,error:practiceError(e)})}
 }
 function select(value:string|null){if(submitLock.current||uncertainRef.current)return;update(current.id,{selected:value});void persist(current.id)}
 function finish(result?:Result){
  if(!active.current)return
  leave.current=true
  if(result)client.setQueryData([...keys.practice,'result',attempt.attemptId],result)
  client.setQueryData<Attempt>([...keys.practice,'attempt',attempt.attemptId],old=>old?{...old,isSubmitted:true}:old)
  void client.invalidateQueries({queryKey:[...keys.practice,'history']})
  navigate('/student/practice/'+attempt.attemptId+'/result',{replace:true})
 }
 async function reconcile(){
  if(submitLock.current)return
  submitLock.current=true;setSubmitting(true)
  try{
   const status=await studentApi.attempt(attempt.attemptId)
   if(!active.current)return
   if(status.isSubmitted){finish();return}
   uncertainRef.current=false;setUncertain(false);setError('Máy chủ xác nhận bài chưa nộp. Bạn có thể kiểm tra rồi nộp lại.')
  }catch(e){if(active.current){uncertainRef.current=true;setUncertain(true);setError('Chưa kiểm tra được trạng thái bài. '+practiceError(e))}}
  finally{submitLock.current=false;if(active.current)setSubmitting(false)}
 }
 async function submit(){
  if(submitLock.current||unresolved()||uncertainRef.current)return
  submitLock.current=true;setSubmitting(true);setError('')
  try{const r=await submitMutation.mutateAsync();finish(r)}
  catch(e){
   if(!active.current)return
   setError(practiceError(e));uncertainRef.current=true;setUncertain(true)
   // Never retry POST until a GET has resolved an ambiguous submission.
   submitLock.current=false;await reconcile()
  }finally{submitLock.current=false;if(active.current){setSubmitting(false);setConfirm(false)}}
 }
 const answered=Object.values(answers).filter(a=>a.saved!==null).length
 const saving=Object.values(answers).some(a=>a.pending),state=answers[current.id]!
 const go=(next:number)=>{const p=new URLSearchParams(search);p.set('q',String(next+1));setSearch(p,{replace:true})}
 return <div className="space-y-6"><PageHeader title="Luyện tập" description={'Đã lưu: '+answered+' / '+attempt.totalQuestions+' · Chưa trả lời: '+(attempt.totalQuestions-answered)} actions={<Link to="/student/practice/history">Lịch sử luyện tập</Link>}/>
 <progress aria-label="Tiến độ đã lưu" value={answered} max={attempt.totalQuestions} className="w-full"/>
 {dirty&&<p role="status" className="text-amber-800">Có đáp án đang lưu hoặc chưa lưu. Tiến độ chỉ tính phản hồi máy chủ đã xác nhận.</p>}
 {error&&<p role="alert" className="text-rose-700">{error}</p>}
 {uncertain&&<Button variant="secondary" loading={submitting} onClick={()=>void reconcile()}>Kiểm tra trạng thái nộp bài</Button>}
 <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"><Card title={'Câu '+current.number+' / '+attempt.totalQuestions}><p className="mb-5 whitespace-pre-wrap text-lg">{current.content}</p>
 <fieldset disabled={submitting||uncertain} aria-label={'Đáp án câu '+current.number} className="space-y-3">{current.options.map(o=><label key={o.id} className={'flex cursor-pointer items-start gap-3 rounded-xl border p-4 '+(state.selected===o.id?'border-brand-500 bg-brand-50':'border-slate-200')}><input className="mt-1" type="radio" name={'answer-'+current.id} checked={state.selected===o.id} onChange={()=>select(o.id)}/><span className="whitespace-pre-wrap">{o.label}. {o.content}</span></label>)}</fieldset>
 <div className="mt-4 flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={submitting||uncertain||state.selected===null} onClick={()=>select(null)}>Bỏ chọn đáp án</Button><span role="status">{state.pending?'Đang lưu...':state.error?'Chưa lưu được':state.selected===state.saved?'Đã đồng bộ với máy chủ':'Chưa lưu'}</span></div>
 {state.error&&<div className="mt-3"><p role="alert">{state.error}</p><Button variant="secondary" disabled={submitting||uncertain} onClick={()=>void persist(current.id)}>Thử lưu lại</Button></div>}
 <div className="mt-6 flex justify-between gap-3"><Button variant="secondary" disabled={index===0} onClick={()=>go(index-1)}>Câu trước</Button><Button variant="secondary" disabled={index===attempt.questions.length-1} onClick={()=>go(index+1)}>Câu tiếp</Button></div></Card>
 <aside><details open className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold">Điều hướng 200 câu</summary><p className="my-3 text-xs text-slate-600">Xanh: đã lưu đáp án · Vàng: đang/chưa lưu · Viền đậm: câu hiện tại</p><nav aria-label="Điều hướng câu hỏi" className="grid grid-cols-5 gap-2 sm:grid-cols-10 xl:grid-cols-5">{attempt.questions.map((q,i)=>{const a=answers[q.id]!;const pending=a.pending||a.error||a.selected!==a.saved;return <button type="button" key={q.id} aria-label={'Câu '+q.number+(pending?' — chưa lưu':a.saved!==null?' — đã trả lời':' — chưa trả lời')} aria-current={i===index?'step':undefined} className={'min-h-10 rounded-lg border text-sm focus-visible:outline-2 focus-visible:outline-brand-700 '+(i===index?'border-brand-900 font-bold ':'border-slate-200 ')+(pending?'bg-amber-100':a.saved!==null?'bg-emerald-100':'bg-white')} onClick={()=>go(i)}>{q.number}</button>})}</nav></details></aside></div>
 <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg"><p>Đã lưu {answered}/{attempt.totalQuestions} câu</p><Button disabled={dirty||uncertain} loading={submitting} onClick={()=>{if(!unresolved()&&!submitLock.current)setConfirm(true)}}>Nộp bài</Button></div>
 <ConfirmationDialog open={confirm} title="Xác nhận nộp bài" description={'Đã trả lời: '+answered+' / '+attempt.totalQuestions+'. Chưa trả lời: '+(attempt.totalQuestions-answered)+'. Bạn được nộp khi còn câu bỏ trống. Sau khi nộp không thể sửa đáp án.'} confirmLabel="Xác nhận nộp" busy={submitting} onCancel={()=>setConfirm(false)} onConfirm={()=>void submit()}/>
 <ConfirmationDialog open={blocker.state==='blocked'} title="Rời bài luyện tập?" description="Có lựa chọn chưa lưu hoặc trạng thái nộp chưa xác định. Ở lại để thử lưu/kiểm tra; rời trang sẽ bỏ các lựa chọn chưa được máy chủ xác nhận." confirmLabel="Rời trang" destructive busy={saving||submitting} onCancel={()=>blocker.state==='blocked'&&blocker.reset()} onConfirm={()=>{leave.current=true;if(blocker.state==='blocked')blocker.proceed()}}/>
 </div>
}

