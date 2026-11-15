import { apiClient } from '@/lib/api/apiClient'
import type { Page } from '../types/contracts'
import type { Question, QuestionDetail, QuestionInput, Progress, ListQuery, Exam, ExamInput, Permission, BulkItem, ResultRow, AttemptResult } from './contracts'
import type {BulkPublishRequest,BulkPublishResult,Blueprint} from './contracts'
const base='/api/teacher'
export const questionApi={
 classify:async(id:string,difficulty:string)=>(await apiClient.patch<QuestionDetail>(base+'/questions/'+id+'/difficulty',{difficulty})).data,
 bulkPublish:async(id:string,body:BulkPublishRequest)=>(await apiClient.post<BulkPublishResult>(base+'/chapters/'+id+'/questions/bulk-publish',body)).data,
 blueprint:async(id:string,signal?:AbortSignal)=>(await apiClient.get<Blueprint>(base+'/chapters/'+id+'/exam-blueprint',{signal})).data,
 list:async (id:string,params:ListQuery,signal?:AbortSignal) => (await apiClient.get<Page<Question>>(base+'/chapters/'+id+'/questions',{params,signal})).data,
 get:async (id:string,signal?:AbortSignal) => (await apiClient.get<QuestionDetail>(base+'/questions/'+id,{signal})).data,
 progress:async (id:string,signal?:AbortSignal) => (await apiClient.get<Progress>(base+'/chapters/'+id+'/questions/progress',{signal})).data,
 create:async (id:string,body:QuestionInput) => (await apiClient.post<QuestionDetail>(base+'/chapters/'+id+'/questions',body)).data,
 update:async (id:string,body:QuestionInput) => (await apiClient.put<QuestionDetail>(base+'/questions/'+id,body)).data,
 action:async (id:string,action:'publish'|'archive'|'delete') => { if(action==='delete') await apiClient.delete(base+'/questions/'+id);else await apiClient.post(base+'/questions/'+id+'/'+action) },
}
export const examApi={
 list:async (params:ListQuery,signal?:AbortSignal) => (await apiClient.get<Page<Exam>>(base+'/exams',{params,signal})).data,
 get:async (id:string,signal?:AbortSignal) => (await apiClient.get<Exam>(base+'/exams/'+id,{signal})).data,
 create:async (body:ExamInput) => (await apiClient.post<Exam>(base+'/exams',body)).data,
 update:async (id:string,body:Omit<ExamInput,'chapterId'>) => (await apiClient.put<Exam>(base+'/exams/'+id,body)).data,
 action:async (id:string,action:'publish'|'close') => (await apiClient.post<Exam>(base+'/exams/'+id+'/'+action)).data,
 permissions:async (id:string,params:{page:number;pageSize:number;status?:string},signal?:AbortSignal) => (await apiClient.get<Page<Permission>>(base+'/exams/'+id+'/permissions',{params,signal})).data,
 granted:async (id:string,signal?:AbortSignal) => {
   const items:Permission[]=[]
   for(let page=1;;page++){const result=await examApi.permissions(id,{page,pageSize:100,status:'Granted'},signal);items.push(...result.items);if(items.length>=result.totalCount||!result.items.length)return items}
 },
 grant:async (id:string,studentId:string) => (await apiClient.post<Permission>(base+'/exams/'+id+'/permissions',{studentId})).data,
 bulk:async (id:string,studentIds:string[]) => (await apiClient.post<BulkItem[]>(base+'/exams/'+id+'/permissions/bulk',{studentIds})).data,
 revoke:async (id:string,studentId:string) => {await apiClient.delete(base+'/exams/'+id+'/permissions/'+studentId)},
 results:async (id:string,params:{page:number;pageSize:number;studentKeyword?:string},signal?:AbortSignal) => (await apiClient.get<Page<ResultRow>>(base+'/exams/'+id+'/results',{params,signal})).data,
 attempt:async (id:string,attemptId:string,signal?:AbortSignal) => (await apiClient.get<AttemptResult>(base+'/exams/'+id+'/attempts/'+attemptId,{signal})).data,
}

