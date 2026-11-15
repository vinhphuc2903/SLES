import {useQuery} from '@tanstack/react-query'
import {apiClient} from '@/lib/api/apiClient'
import {useStudentKeys} from '../data/queries'
import type {Page,Question} from '../data/contracts'
export type AttemptStatus='InProgress'|'Submitted'|'AutoSubmitted'
export interface StudentExam {id:string;name:string;description:string|null;chapterId:string;chapterName:string;subjectName:string;durationMinutes:number;startAt:string|null;endAt:string|null;status:'Scheduled'|'Active'|'Closed'|'Cancelled';canStart:boolean;attemptId:string|null;attemptStatus:AttemptStatus|null;serverNow:string}
export interface ExamAttempt {attemptId:string;examId:string;status:AttemptStatus;startedAt:string;expiresAt:string;serverNow:string;remainingSeconds:number;answeredQuestions:number;questions:Question[];clockOffset:number}
export interface ExamResult {attemptId:string;examId:string;status:AttemptStatus;startedAt:string;submittedAt:string;totalQuestions:number;answeredQuestions:number;correctAnswers:number;incorrectAnswers:number;unansweredAnswers:number;score:number;percentage:number;questions:(Omit<Question,'options'> & {isCorrect:boolean|null;options:(Question['options'][number]&{isCorrect:boolean})[]})[]}
export interface ExamHistory {attemptId:string;examId:string;examName:string;chapterName:string;subjectName:string;status:AttemptStatus;startedAt:string;expiresAt:string;submittedAt:string|null;score:number|null}
const base='/api/student'
// Sample at both ends of the request: server timestamp is approximately at the midpoint.
export function clockOffset(serverNow:string,sent:number,received:number){return Date.parse(serverNow)-(sent+received)/2}
async function timed(url:string,signal?:AbortSignal,post=false):Promise<ExamAttempt>{
 const sent=Date.now()
 const {data}=post?await apiClient.post<ExamAttempt>(url):await apiClient.get<ExamAttempt>(url,{signal})
 return {...data,clockOffset:clockOffset(data.serverNow,sent,Date.now())}
}
export const examApi={
 list:async(page:number,pageSize=20,signal?:AbortSignal)=>(await apiClient.get<Page<StudentExam>>(base+'/exams',{params:{page,pageSize},signal})).data,
 detail:async(id:string,signal?:AbortSignal)=>(await apiClient.get<StudentExam>(base+'/exams/'+id,{signal})).data,
 start:(id:string)=>timed(base+'/exams/'+id+'/start',undefined,true),
 current:(id:string,signal?:AbortSignal)=>timed(base+'/exams/'+id+'/attempt',signal),
 attempt:(id:string,signal?:AbortSignal)=>timed(base+'/exam-attempts/'+id,signal),
 save:async(id:string,q:string,selectedOptionId:string|null)=>{await apiClient.put(base+'/exam-attempts/'+id+'/questions/'+q+'/answer',{selectedOptionId})},
 submit:async(id:string)=>(await apiClient.post<ExamResult>(base+'/exam-attempts/'+id+'/submit')).data,
 result:async(id:string,signal?:AbortSignal)=>(await apiClient.get<ExamResult>(base+'/exam-attempts/'+id+'/result',{signal})).data,
 history:async(page:number,pageSize=20,signal?:AbortSignal)=>(await apiClient.get<Page<ExamHistory>>(base+'/exams/history',{params:{page,pageSize},signal})).data,
}
export function useExamKeys(){return [...useStudentKeys().root,'exams']}
export function useExams(page=1,pageSize=20){const k=useExamKeys();return useQuery({queryKey:[...k,'list',page,pageSize],queryFn:({signal})=>examApi.list(page,pageSize,signal),staleTime:0})}
export function useExam(id:string){const k=useExamKeys();return useQuery({queryKey:[...k,'detail',id],queryFn:({signal})=>examApi.detail(id,signal),enabled:!!id,staleTime:0})}
export function useExamAttempt(id:string){const k=useExamKeys();return useQuery({queryKey:[...k,'attempt',id],queryFn:({signal})=>examApi.attempt(id,signal),staleTime:0,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false})}
export function useExamResult(id:string){const k=useExamKeys();return useQuery({queryKey:[...k,'result',id],queryFn:({signal})=>examApi.result(id,signal),retry:false})}
export function useExamHistory(page=1,pageSize=20){const k=useExamKeys();return useQuery({queryKey:[...k,'history',page,pageSize],queryFn:({signal})=>examApi.history(page,pageSize,signal),staleTime:0})}
export const examDate=(value:string|null)=>value?new Intl.DateTimeFormat('vi-VN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date(value)):'Không giới hạn'
export const attemptPath=(a:{attemptId:string;status:AttemptStatus})=>'/student/exam-attempts/'+a.attemptId+(a.status==='InProgress'?'':'/result')
