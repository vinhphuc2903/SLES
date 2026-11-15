import {AxiosError,type AxiosAdapter} from 'axios'
import {apiClient} from '@/lib/api/apiClient'
import {createBackend,firstId,teacher} from '@/features/admin/test/adminFixture'
import {detail} from '@/features/teacher/test/teacherFixture'
import type {Attempt,Result,Subject,HistoryItem} from '../data/contracts'
export const attemptId='attempt-fixture'
export function makeAttempt(id=attemptId):Attempt{return {attemptId:id,chapterId:firstId,totalQuestions:200,answeredQuestions:0,isSubmitted:false,questions:Array.from({length:200},(_,i)=>({id:'question-'+(999-i),number:i+1,content:'Nội dung câu '+(i+1),selectedOptionId:null,options:['D','B','A','C'].map(label=>({id:'option-'+i+'-'+label,label,content:'Nội dung '+label}))}))}}
export function createStudentBackend(){
 const base=createBackend();base.user={...base.user,role:'STUDENT',id:'student-fixture',gradeId:firstId,fullName:'Học sinh thử nghiệm'}
 const auth=apiClient.defaults.adapter as AxiosAdapter
 const state={base,subjects:[{id:firstId,name:'Toán học',description:'Học Toán',gradeName:'Khối 10',chapterCount:1}] as Subject[],chapter:{...structuredClone(detail),chapter:{...detail.chapter,status:'Published' as const}},attempts:[makeAttempt()],failure:null as {url:string;status:number}|null,failSave:false,holdSave:null as Promise<void>|null,holdStart:null as Promise<void>|null,holdSubmit:null as Promise<void>|null,loseSubmit:false,commitSubmit:true,failStatus:false}
 const result=(a:Attempt):Result=>({attemptId:a.attemptId,chapterId:a.chapterId,chapterName:'Đại số',subjectName:'Toán học',startedAt:teacher.createdAt,completedAt:'2026-11-01T09:00:00Z',totalQuestions:200,answeredQuestions:a.questions.filter(q=>q.selectedOptionId!==null).length,correctAnswers:1,incorrectAnswers:1,unansweredQuestions:198,score:0.05,percentage:0.5,questions:a.questions.map(q=>({questionId:q.id,number:q.number,content:q.content,selectedOptionId:q.selectedOptionId,isCorrect:q.selectedOptionId? q.selectedOptionId===q.options[1]!.id:null,options:q.options.map((o,i)=>({...o,isCorrect:i===1}))}))})
 const adapter:AxiosAdapter=async config=>{
  const url=config.url??'',method=config.method??'get',params=(config.params??{}) as Record<string,unknown>,body=(typeof config.data==='string'?JSON.parse(config.data):{}) as Record<string,unknown>
  if(url.startsWith('/api/auth/'))return auth(config)
  base.requests.push({url,method,params,body})
  const ok=(data:unknown,status=200)=>({config,headers:{},status,statusText:'OK',data:structuredClone(data)})
  const fail=(status:number,code='invalid_request'):never=>{throw new AxiosError('Failure','ERR_BAD_RESPONSE',config,undefined,{config,headers:{},status,statusText:'Failure',data:{error:{code,message:'Failure'}}})}
  if(state.failure?.url===url)return fail(state.failure.status)
  if(url.startsWith('/api/teacher/')||url.startsWith('/api/admin/'))throw new Error('Student must not call privileged API')
  const page=<T,>(rows:T[])=>{const page=Number(params.page??1),pageSize=Number(params.pageSize??20);return ok({items:rows.slice((page-1)*pageSize,page*pageSize),page,pageSize,totalCount:rows.length})}
  if(url==='/api/student/exams'||url==='/api/student/exams/history')return page([])
  if(url==='/api/student/subjects')return page(state.subjects.filter(s=>!params.search||s.name.includes(String(params.search))))
  if(url==='/api/student/subjects/'+firstId)return state.subjects[0]?ok(state.subjects[0]):fail(404)
  if(url==='/api/chapters')return page(state.subjects.length?[state.chapter.chapter]:[])
  if(url==='/api/chapters/'+firstId)return ok(state.chapter)
  if(url==='/api/student/chapters/'+firstId+'/practice'){
   if(state.holdStart)await state.holdStart
   const a=makeAttempt('new-attempt-'+state.attempts.length);state.attempts.unshift(a);return ok(a)
  }
  if(url==='/api/student/practice/history'){
   const rows:HistoryItem[]=state.attempts.filter(a=>!params.chapterId||a.chapterId===params.chapterId).map(a=>({attemptId:a.attemptId,chapterId:a.chapterId,chapterName:'Đại số',totalQuestions:200,correctAnswers:a.isSubmitted?1:0,incorrectAnswers:a.isSubmitted?1:0,score:a.isSubmitted?0.05:null,startedAt:teacher.createdAt,submittedAt:a.isSubmitted?'2026-11-01T09:00:00Z':null}))
   return page(rows)
  }
  const a=state.attempts.find(a=>a.attemptId===url.split('/')[4]);if(!a)return fail(404)
  if(url.endsWith('/answer')){
   if(a.isSubmitted)return fail(409,'attemptsubmitted')
   const q=a.questions.find(q=>q.id===url.split('/')[6]);if(!q)return fail(400)
   const hold=state.holdSave;state.holdSave=null;if(hold)await hold
   if(state.failSave)throw new AxiosError('Network','ERR_NETWORK',config)
   q.selectedOptionId=body.selectedOptionId as string|null;a.answeredQuestions=a.questions.filter(q=>q.selectedOptionId!==null).length;return ok(null,204)
  }
  if(url.endsWith('/submit')){
   if(state.holdSubmit)await state.holdSubmit
   if(a.isSubmitted)return fail(409,'attemptsubmitted')
   if(state.commitSubmit)a.isSubmitted=true
   if(state.loseSubmit)throw new AxiosError('Timeout','ECONNABORTED',config)
   return ok(result(a))
  }
  if(url.endsWith('/result'))return a.isSubmitted?ok(result(a)):fail(409,'resultunavailable')
  if(state.failStatus)throw new AxiosError('Network','ERR_NETWORK',config)
  return ok(a)
 }
 apiClient.defaults.adapter=adapter
 return state
}

