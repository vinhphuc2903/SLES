import {useQuery} from '@tanstack/react-query'
import {useAuth} from '@/features/auth/hooks/useCurrentUser'
import {studentApi} from './api'
import type {ListParams} from './contracts'
export function useStudentKeys(){const {user}=useAuth();return {root:['student',user?.id],subjects:['student',user?.id,'subjects'],chapters:['student',user?.id,'chapters'],practice:['student',user?.id,'practice']}}
export function useSubjects(params:ListParams){const k=useStudentKeys();return useQuery({queryKey:[...k.subjects,params],queryFn:({signal})=>studentApi.subjects(params,signal)})}
export function useSubject(id:string){const k=useStudentKeys();return useQuery({queryKey:[...k.subjects,id],queryFn:({signal})=>studentApi.subject(id,signal)})}
export function useChapters(params:ListParams){const k=useStudentKeys();return useQuery({queryKey:[...k.chapters,params],queryFn:({signal})=>studentApi.chapters(params,signal)})}
export function useChapter(id:string){const k=useStudentKeys();return useQuery({queryKey:[...k.chapters,id],queryFn:({signal})=>studentApi.chapter(id,signal)})}
export function useAttempt(id:string){const k=useStudentKeys();return useQuery({queryKey:[...k.practice,'attempt',id],queryFn:({signal})=>studentApi.attempt(id,signal),staleTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false})}
export function useResult(id:string){const k=useStudentKeys();return useQuery({queryKey:[...k.practice,'result',id],queryFn:({signal})=>studentApi.result(id,signal),retry:false})}
export function useHistory(params:ListParams){const k=useStudentKeys();return useQuery({queryKey:[...k.practice,'history',params],queryFn:({signal})=>studentApi.history(params,signal),staleTime:0})}

