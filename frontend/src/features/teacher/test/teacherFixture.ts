import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { apiClient } from '@/lib/api/apiClient'
import { createBackend, firstId, teacher, subject, generatedPassword } from '@/features/admin/test/adminFixture'
import type { Student, ChapterDetail } from '../types/contracts'
export const student: Student = {...teacher,role:'STUDENT',username:'student01',fullName:'Học sinh An',gradeId:firstId}
export const detail: ChapterDetail = {
  chapter:{id:firstId,name:'Đại số',description:'Lý thuyết đại số',gradeId:firstId,gradeName:'Khối 10',subjectId:firstId,subjectName:'Toán học',teacherId:'teacher-test',teacherName:'Giáo viên thử nghiệm',displayOrder:1,status:'Draft',publishedAt:null,createdAt:teacher.createdAt,updatedAt:teacher.createdAt,hasContent:true},
  content:'# Đại số\n\n**Nội dung**',contentFormat:'Markdown',version:1,
}
export function createTeacherBackend() {
  const base = createBackend()
  base.user = {...base.user,id:'teacher-test',role:'TEACHER',fullName:'Giáo viên thử nghiệm'}
  const original = apiClient.defaults.adapter as AxiosAdapter
  const state = { base, students:[structuredClone(student)], chapters:[structuredClone(detail)], failure:null as {url:string;status:number}|null, publishedQuestions:199 }
  const adapter: AxiosAdapter = async config => {
    const url = config.url ?? '', method = config.method ?? 'get'
    if (url.startsWith('/api/auth/')) return original(config)
    const params = (config.params ?? {}) as Record<string,unknown>
    const body = (typeof config.data === 'string' ? JSON.parse(config.data) : {}) as Record<string,unknown>
    base.requests.push({method,url,params,body})
    const ok = (data:unknown,status=200) => ({status,statusText:'OK',headers:{},config,data:structuredClone(data)})
    const fail = (status:number,code='invalid_request',message='Failure'): never => failure(config,status,code,message)
    if (state.failure?.url === url) return fail(state.failure.status)
    if (url.endsWith('/questions/progress')) return ok({draft:0,published:state.publishedQuestions,archived:0,validPublished:state.publishedQuestions})
    if (url === '/api/teacher/grades') return ok([{id:firstId,name:'Khối 10',code:'G10',displayOrder:1}])
    if (url === '/api/subjects') return ok({items:[subject],page:1,pageSize:100,totalCount:1})
    if (url === '/api/teacher/students' && method === 'post') {
      if (state.students.some(s => s.username === body.username)) return fail(409,'duplicate_username')
      const created = {...student,...body,id:'new-student'} as Student
      state.students.push(created)
      return ok({user:created,temporaryPassword:generatedPassword})
    }
    if (url === '/api/teacher/students' && method === 'get') {
      const rows = state.students.filter(s => (!params.search || (s.username + s.fullName).includes(String(params.search))) && (params.isActive === undefined || params.isActive === s.isActive) && (!params.gradeId || params.gradeId === s.gradeId))
      const page=Number(params.page ?? 1),pageSize=Number(params.pageSize ?? 20)
      return ok({items:rows.slice((page-1)*pageSize,page*pageSize),totalCount:rows.length,page,pageSize})
    }
    if (url.startsWith('/api/teacher/students/')) {
      const s=state.students.find(s => s.id === url.split('/')[4])
      if (!s) return fail(404)
      if (url.endsWith('/status')) {s.isActive=Boolean(body.isActive);return ok(null,204)}
      if (url.endsWith('/reset-password')) return ok({temporaryPassword:generatedPassword})
      if (method === 'put') Object.assign(s,body)
      return ok(s)
    }
    if (url === '/api/chapters') {
      const rows=state.chapters.map(c => c.chapter).filter(c => (!params.status || c.status === params.status) && (!params.search || c.name.includes(String(params.search))) && (!params.subjectId || c.subjectId === params.subjectId) && (!params.gradeId || c.gradeId === params.gradeId))
      const page=Number(params.page ?? 1),pageSize=Number(params.pageSize ?? 20)
      return ok({items:rows.slice((page-1)*pageSize,page*pageSize),totalCount:rows.length,page,pageSize})
    }
    if (url === '/api/teacher/chapters' && method === 'post') {
      const created={...structuredClone(detail),chapter:{...detail.chapter,...body,id:'new-chapter'},content:'',version:1} as ChapterDetail
      state.chapters.push(created);return ok(created.chapter)
    }
    const id=url.startsWith('/api/teacher/') ? url.split('/')[4] : url.split('/')[3]
    const c=state.chapters.find(c => c.chapter.id === id)
    if (!c) return fail(404)
    if (url.endsWith('/content')) {
      if (c.chapter.status !== 'Draft') return fail(409,'invalidtransition')
      if (String(body.content).length>200000) return fail(400)
      if (c.content !== body.content) {c.content=String(body.content);c.version++}
      return ok(c)
    }
    if (url.endsWith('/publish')) {
      if (state.publishedQuestions !== 200) return fail(409,'publicationvalidationpending','Chapter has ' + state.publishedQuestions + ' valid published questions; exactly 200 are required.')
      c.chapter.status='Published';return ok(null,204)
    }
    if (url.endsWith('/archive')) {c.chapter.status='Archived';return ok(null,204)}
    if (method === 'delete') {state.chapters=state.chapters.filter(row => row !== c);return ok(null,204)}
    return ok(c)
  }
  apiClient.defaults.adapter=adapter
  return state
}
function failure(config:InternalAxiosRequestConfig,status:number,code:string,message:string): never {
  throw new AxiosError('API failure','ERR_BAD_RESPONSE',config,undefined,{status,statusText:'Failure',headers:{},config,data:{error:{code,message}}})
}

