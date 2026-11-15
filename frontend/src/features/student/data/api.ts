import { apiClient } from '@/lib/api/apiClient'
import type {Subject,Chapter,ChapterDetail,Page,ListParams,Attempt,Result,HistoryItem} from './contracts'
const practice='/api/student/practice'
export const studentApi={
 subjects:async(params:ListParams,signal?:AbortSignal)=>(await apiClient.get<Page<Subject>>('/api/student/subjects',{params,signal})).data,
 subject:async(id:string,signal?:AbortSignal)=>(await apiClient.get<Subject>('/api/student/subjects/'+id,{signal})).data,
 chapters:async(params:ListParams,signal?:AbortSignal)=>(await apiClient.get<Page<Chapter>>('/api/chapters',{params,signal})).data,
 chapter:async(id:string,signal?:AbortSignal)=>(await apiClient.get<ChapterDetail>('/api/chapters/'+id,{signal})).data,
 start:async(chapterId:string)=>(await apiClient.post<Attempt>('/api/student/chapters/'+chapterId+'/practice')).data,
 attempt:async(id:string,signal?:AbortSignal)=>(await apiClient.get<Attempt>(practice+'/'+id,{signal})).data,
 save:async(id:string,questionId:string,selectedOptionId:string|null)=>{await apiClient.put(practice+'/'+id+'/questions/'+questionId+'/answer',{selectedOptionId})},
 submit:async(id:string)=>(await apiClient.post<Result>(practice+'/'+id+'/submit')).data,
 result:async(id:string,signal?:AbortSignal)=>(await apiClient.get<Result>(practice+'/'+id+'/result',{signal})).data,
 history:async(params:ListParams,signal?:AbortSignal)=>(await apiClient.get<Page<HistoryItem>>(practice+'/history',{params,signal})).data,
}

