import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useCurrentUser'
import { questionApi,examApi } from './api'
import type { ListQuery } from './contracts'
export function useManagementKeys(){const {user}=useAuth();return {questions:['teacher',user?.id,'questions'],exams:['teacher',user?.id,'exams'],chapters:['teacher',user?.id,'chapters']}}
export function useQuestions(id:string,params:ListQuery){const k=useManagementKeys();return useQuery({queryKey:[...k.questions,'list',id,params],queryFn:({signal})=>questionApi.list(id,params,signal)})}
export function useQuestion(id:string){const k=useManagementKeys();return useQuery({queryKey:[...k.questions,id],queryFn:({signal})=>questionApi.get(id,signal)})}
export function useProgress(id:string){const k=useManagementKeys();return useQuery({queryKey:[...k.questions,'progress',id],queryFn:({signal})=>questionApi.progress(id,signal)})}
export function useExams(params:ListQuery){const k=useManagementKeys();return useQuery({queryKey:[...k.exams,'list',params],queryFn:({signal})=>examApi.list(params,signal)})}
export function useExam(id:string){const k=useManagementKeys();return useQuery({queryKey:[...k.exams,id],queryFn:({signal})=>examApi.get(id,signal)})}
export function usePermissions(id:string,page:number){const k=useManagementKeys();return useQuery({queryKey:[...k.exams,id,'permissions',page],queryFn:({signal})=>examApi.permissions(id,{page,pageSize:20},signal)})}
export function useGranted(id:string){const k=useManagementKeys();return useQuery({queryKey:[...k.exams,id,'granted'],queryFn:({signal})=>examApi.granted(id,signal)})}
export function useResults(id:string,page:number,studentKeyword?:string){const k=useManagementKeys();return useQuery({queryKey:[...k.exams,id,'results',page,studentKeyword],queryFn:({signal})=>examApi.results(id,{page,pageSize:20,studentKeyword},signal),staleTime:0})}
export function useAttempt(id:string,attemptId:string){const k=useManagementKeys();return useQuery({queryKey:[...k.exams,id,'attempt',attemptId],queryFn:({signal})=>examApi.attempt(id,attemptId,signal),staleTime:0})}
export function useManagementMutation<T,V>(resource:'questions'|'exams',mutationFn:(v:V)=>Promise<T>){
 const k=useManagementKeys(),client=useQueryClient()
 return useMutation({mutationFn,retry:false,onSuccess:async()=>{await client.invalidateQueries({queryKey:k[resource]});if(resource==='questions')await client.invalidateQueries({queryKey:k.chapters})}})
}


export function useBlueprint(id:string){const k=useManagementKeys();return useQuery({queryKey:[...k.questions,"blueprint",id],queryFn:({signal})=>questionApi.blueprint(id,signal),enabled:!!id,staleTime:0})}
