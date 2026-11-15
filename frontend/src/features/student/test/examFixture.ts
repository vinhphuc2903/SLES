import {AxiosError,type AxiosAdapter} from 'axios'
import {apiClient} from '@/lib/api/apiClient'
import {createStudentBackend} from './studentFixture'
import type {ExamAttempt,ExamResult,StudentExam,ExamHistory} from '../exams/data'
export const examId='exam-fixture',examAttemptId='exam-attempt-fixture'
export function makeExamAttempt():ExamAttempt{return {attemptId:examAttemptId,examId,status:'InProgress',startedAt:new Date(Date.now()-60_000).toISOString(),expiresAt:new Date(Date.now()+1_740_000).toISOString(),serverNow:new Date().toISOString(),remainingSeconds:1740,answeredQuestions:0,clockOffset:0,questions:Array.from({length:10},(_,i)=>({id:'snapshot-'+(99-i),number:i+1,content:'Snapshot câu '+(i+1),selectedOptionId:null,options:['D','A','C','B'].map(label=>({id:'snapshot-option-'+i+'-'+label,label,content:'Phương án '+label}))}))}}
export function createExamBackend(){
 const student=createStudentBackend(),fallback=apiClient.defaults.adapter as AxiosAdapter
 const state={student,exam:{id:examId,name:'Kiểm tra Đại số',description:'Hướng dẫn từ giáo viên',chapterId:'chapter-fixture',chapterName:'Đại số',subjectName:'Toán học',durationMinutes:30,startAt:new Date(Date.now()-120000).toISOString(),endAt:new Date(Date.now()+3600000).toISOString(),status:'Active',canStart:true,attemptId:null,attemptStatus:null,serverNow:new Date().toISOString()} as StudentExam,
 attempt:null as ExamAttempt|null,empty:false,total:1,historyTotal:1,offset:0,failure:null as {url:string;status:number}|null,holdList:null as Promise<void>|null,holdStart:null as Promise<void>|null,holdSave:null as Promise<void>|null,holdSubmit:null as Promise<void>|null,failSave:false,failStatus:false,loseStart:false,commitStart:true,loseSubmit:false,commitSubmit:true,conflictStart:false}
 const result=(a:ExamAttempt):ExamResult=>({attemptId:a.attemptId,examId:a.examId,status:a.status,startedAt:a.startedAt,submittedAt:new Date().toISOString(),totalQuestions:10,answeredQuestions:a.questions.filter(q=>q.selectedOptionId!==null).length,correctAnswers:1,incorrectAnswers:0,unansweredAnswers:9,score:1,percentage:10,questions:a.questions.map(q=>({...q,isCorrect:q.selectedOptionId===null?null:q.selectedOptionId===q.options[1]!.id,options:q.options.map((o,i)=>({...o,isCorrect:i===1}))}))})
 const adapter:AxiosAdapter=async config=>{
  const url=config.url??'',method=config.method??'get',params=(config.params??{}) as Record<string,unknown>,body=typeof config.data==='string'?JSON.parse(config.data):{}
  if(!url.startsWith('/api/student/exam'))return fallback(config)
  student.base.requests.push({url,method,params,body})
  const ok=(data:unknown,status=200)=>({config,headers:{},status,statusText:'OK',data:structuredClone(data)})
  const fail=(status:number,code='invalid_request'):never=>{throw new AxiosError('Failure','ERR_BAD_RESPONSE',config,undefined,{config,headers:{},status,statusText:'Failure',data:{error:{code,message:'Failure'}}})}
  const network=():never=>{throw new AxiosError('Timeout','ECONNABORTED',config)}
  if(state.failure?.url===url)return fail(state.failure.status)
  const finalize=()=>{if(state.attempt?.status==='InProgress'&&Date.now()+state.offset>=Date.parse(state.attempt.expiresAt))state.attempt.status='AutoSubmitted'}
  const response=()=>{finalize();return {...state.attempt!,serverNow:new Date(Date.now()+state.offset).toISOString()}}
  if(url==='/api/student/exams'){
   if(state.holdList)await state.holdList
   return ok({items:state.empty?[]:[{...state.exam,attemptId:state.attempt?.attemptId??null,attemptStatus:state.attempt?.status??null,canStart:!state.attempt&&state.exam.canStart}],page:Number(params.page??1),pageSize:Number(params.pageSize??20),totalCount:state.empty?0:state.total})
  }
  if(url==='/api/student/exams/history'){
   finalize();const a=state.attempt;const rows:ExamHistory[]=a?[{attemptId:a.attemptId,examId:a.examId,examName:state.exam.name,chapterName:state.exam.chapterName,subjectName:state.exam.subjectName,status:a.status,startedAt:a.startedAt,expiresAt:a.expiresAt,submittedAt:a.status==='InProgress'?null:new Date().toISOString(),score:a.status==='InProgress'?null:1}]:[]
   return ok({items:rows,page:Number(params.page??1),pageSize:Number(params.pageSize??20),totalCount:a?state.historyTotal:0})
  }
  if(url==='/api/student/exams/'+examId)return ok({...state.exam,attemptId:state.attempt?.attemptId??null,attemptStatus:state.attempt?.status??null,canStart:!state.attempt&&state.exam.canStart})
  if(url.endsWith('/start')){if(state.holdStart)await state.holdStart;if(state.commitStart&&!state.attempt)state.attempt=makeExamAttempt();if(state.conflictStart)return fail(409,'attemptexists');if(state.loseStart)return network();return ok(response())}
  if(url.endsWith('/attempt')||url==='/api/student/exam-attempts/'+examAttemptId){if(state.failStatus)return network();if(!state.attempt)return fail(404,'not_found');return ok(response())}
  if(!state.attempt)return fail(404,'not_found')
  if(url.endsWith('/answer')){const hold=state.holdSave;state.holdSave=null;if(hold)await hold;finalize();if(state.attempt.status!=='InProgress')return fail(409,'attemptexpired');if(state.failSave)return network();const q=state.attempt.questions.find(q=>q.id===url.split('/')[6]);if(!q)return fail(400);q.selectedOptionId=body.selectedOptionId;state.attempt.answeredQuestions=state.attempt.questions.filter(q=>q.selectedOptionId!==null).length;return ok(null,204)}
  if(url.endsWith('/submit')){if(state.holdSubmit)await state.holdSubmit;finalize();if(state.commitSubmit&&state.attempt.status==='InProgress')state.attempt.status='Submitted';if(state.loseSubmit)return network();return ok(result(state.attempt))}
  if(url.endsWith('/result')){finalize();return state.attempt.status==='InProgress'?fail(409,'resultunavailable'):ok(result(state.attempt))}
  return fail(404)
 }
 apiClient.defaults.adapter=adapter;return state
}
