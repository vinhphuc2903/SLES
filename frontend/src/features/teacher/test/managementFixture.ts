import { AxiosError,type AxiosAdapter } from 'axios'
import { apiClient } from '@/lib/api/apiClient'
import { createTeacherBackend } from './teacherFixture'
import { firstId,teacher } from '@/features/admin/test/adminFixture'
import type { QuestionDetail,Exam,Permission,ResultRow,AttemptResult } from '../management/contracts'
export const question:QuestionDetail={question:{id:firstId,chapterId:firstId,content:'Câu hỏi gốc',status:'Draft',difficulty:'RECOGNITION',createdAt:teacher.createdAt,updatedAt:teacher.createdAt},options:['A','B','C','D'].map((label,i)=>({id:'option-'+i,label,content:'Phương án '+label,isCorrect:i===1,displayOrder:i+1}))}
export const exam:Exam={id:firstId,chapterId:firstId,name:'Kiểm tra Đại số',description:null,durationMinutes:30,startAt:null,endAt:null,status:'Draft',questionCount:10,openedAt:null,closedAt:null,createdAt:teacher.createdAt,updatedAt:teacher.createdAt,permissionCount:0,attemptCount:0}
export function createManagementBackend(){
 const teacherBackend=createTeacherBackend(),original=apiClient.defaults.adapter as AxiosAdapter
 const state={teacher:teacherBackend,questions:[structuredClone(question)],exams:[structuredClone(exam)],permissions:[] as Permission[],results:[] as ResultRow[],progress:200,failure:null as {url:string;status:number;code?:string}|null,partial:false}
 const adapter:AxiosAdapter=async config=>{
  const url=config.url??'',method=config.method??'get',params=(config.params??{}) as Record<string,unknown>,body=(typeof config.data==='string'?JSON.parse(config.data):{}) as Record<string,unknown>
  if(!url.includes('/questions')&&!url.startsWith('/api/teacher/exams')&&!url.endsWith('/exam-blueprint'))return original(config)
  teacherBackend.base.requests.push({url,method,params,body})
  const ok=(data:unknown,status=200)=>({config,headers:{},status,statusText:'OK',data:structuredClone(data)})
  const fail=(status:number,code='invalid_request'):never=>{throw new AxiosError('Failure','ERR_BAD_RESPONSE',config,undefined,{config,headers:{},status,statusText:'Failure',data:{error:{code,message:'Failure'}}})}
  if(state.failure?.url===url)return fail(state.failure.status,state.failure.code)
  const paginate=<T,>(items:T[])=>{const page=Number(params.page??1),pageSize=Number(params.pageSize??20);return ok({items:items.slice((page-1)*pageSize,page*pageSize),totalCount:items.length,page,pageSize})}
  if(url.endsWith('/exam-blueprint'))return ok({ready:state.progress===200,validPublished:state.progress,levels:['RECOGNITION','COMPREHENSION','LOW_APPLICATION','HIGH_APPLICATION'].map((difficulty,i)=>({difficulty,required:i<2?3:2,available:state.progress===200?50:0}))})
  if(url.endsWith('/questions/progress'))return ok({draft:state.questions.filter(q=>q.question.status==='Draft').length,published:state.progress,archived:0,validPublished:state.progress})
  if(url.includes('/chapters/')&&url.endsWith('/questions')){
   if(method==='get')return paginate(state.questions.map(q=>q.question).filter(q=>(!params.status||q.status===params.status)&&(!params.keyword||q.content.includes(String(params.keyword)))&&(!params.difficulty||q.difficulty===params.difficulty)&&(!params.unclassified||q.difficulty===null)))
   const input=body as unknown as {content:string;options:{content:string;isCorrect:boolean}[]}
   const created={question:{...question.question,id:'new-question',content:input.content},options:input.options.map((o,i)=>({...question.options[i]!,...o}))}
   state.questions.push(created);return ok(created)
  }
  if(url.startsWith('/api/teacher/questions/')){
   const q=state.questions.find(q=>q.question.id===url.split('/')[4]);if(!q)return fail(404)
   if(url.endsWith('/publish')){q.question.status='Published';state.progress++;return ok(null,204)}
   if(url.endsWith('/archive')){q.question.status='Archived';state.progress--;return ok(null,204)}
   if(method==='delete'){state.questions=state.questions.filter(r=>r!==q);return ok(null,204)}
   if(url.endsWith('/difficulty')){q.question.difficulty=String(body.difficulty);return ok(q)}
   if(method==='put'){q.question.difficulty=String(body.difficulty);q.question.content=String(body.content);q.question.updatedAt=new Date().toISOString();q.options=(body.options as {content:string;isCorrect:boolean}[]).map((o,i)=>({...question.options[i]!,...o}));}
   return ok(q)
  }
  if(url==='/api/teacher/exams'){
   if(method==='get')return paginate(state.exams.filter(e=>(!params.status||e.status===params.status)&&(!params.keyword||e.name.includes(String(params.keyword)))))
   const e={...exam,...body,id:'new-exam'} as Exam;state.exams.push(e);return ok(e)
  }
  const e=state.exams.find(e=>e.id===url.split('/')[4]);if(!e)return fail(404)
  if(url.includes('/attempts/')){
   const result:AttemptResult={attemptId:'attempt-1',examId:e.id,studentId:firstId,studentUsername:'student01',studentFullName:'Học sinh lịch sử',startedAt:teacher.createdAt,status:'Submitted',totalQuestions:10,answeredQuestions:1,correctAnswers:0,incorrectAnswers:1,unansweredAnswers:9,score:0,percentage:0,submittedAt:teacher.createdAt,questions:Array.from({length:10},(_,i)=>({id:'snapshot-'+i,number:i+1,content:'Nội dung snapshot '+i,selectedOptionId:i===0?'snap-B':null,isCorrect:i===0?false:null,options:['A','B','C','D'].map((label,j)=>({id:'snap-'+label,label,content:'Đáp án lịch sử '+label,isCorrect:j===2}))}))}
   return ok(result)
  }
  if(url.endsWith('/results'))return paginate(state.results.filter(r=>!params.studentKeyword||(r.fullName+r.username).includes(String(params.studentKeyword))))
  if(url.includes('/permissions')){
   if(method==='get')return paginate(state.permissions.filter(p=>!params.status||p.status===params.status))
   if(method==='delete'){const p=state.permissions.find(p=>p.studentId===url.split('/').at(-1));if(!p)return fail(404);if(p.hasAttempt)return fail(409,'conflict');p.status='Revoked';return ok(null,204)}
   const ids=(url.endsWith('/bulk')?body.studentIds:[body.studentId]) as string[]
   const result=ids.map((id,i)=>{const s=teacherBackend.students.find(s=>s.id===id);if(!s||(state.partial&&i===1))return {studentId:id,granted:false,detail:'Student must be active, owned by the teacher, and in the chapter grade.'}
    const p:Permission={studentId:id,username:s.username,fullName:s.fullName,status:'Granted',grantedAt:teacher.createdAt,revokedAt:null,hasAttempt:false}
    state.permissions=state.permissions.filter(p=>p.studentId!==id);state.permissions.push(p);return {studentId:id,granted:true,detail:null}
   });return ok(url.endsWith('/bulk')?result:state.permissions.find(p=>p.studentId===ids[0]))
  }
  if(url.endsWith('/publish')){e.status=e.startAt?'Scheduled':'Active';return ok(e)}
  if(url.endsWith('/close')){e.status='Closed';return ok(e)}
  if(method==='put')Object.assign(e,body,{updatedAt:new Date().toISOString()})
  return ok(e)
 }
 apiClient.defaults.adapter=adapter;return state
}

