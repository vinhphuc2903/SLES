import { request, expect, type APIRequestContext, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
export const password = process.env.SLES_E2E_PASSWORD! + 'Changed!'
export function sql(text:string) {
 if (!process.env.PGDATABASE?.startsWith('sles_e2e_')) throw new Error('Refusing non-test DB')
 return execFileSync('psql',['-v','ON_ERROR_STOP=1','-Atc',text],{encoding:'utf8'}).trim()
}
export async function call(ctx:APIRequestContext,method:string,path:string,data?:unknown) {
 const r=await ctx.fetch('/api'+path,{method,data})
 if(!r.ok())throw new Error(`${method} ${path}: HTTP ${r.status()}`)
 return r.status()===204?null:r.json()
}
export async function actor(username:string,secret=password) {
 const ctx=await request.newContext({baseURL:process.env.SLES_E2E_API})
 const login=await call(ctx,'POST','/auth/login',{username,password:secret})
 await ctx.dispose()
 return request.newContext({baseURL:process.env.SLES_E2E_API,extraHTTPHeaders:{Authorization:'Bearer '+login.accessToken}})
}
async function activate(username:string,temporary:string) {
 const c=await actor(username,temporary)
 await call(c,'PUT','/auth/change-password',{currentPassword:temporary,newPassword:password});await c.dispose()
 return actor(username)
}
export async function login(page:Page,username:string,secret=password) {
 await page.goto('/login')
 await page.getByLabel('Tên đăng nhập').fill(username)
 await page.getByLabel('Mật khẩu',{exact:true}).fill(secret)
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click()
 await expect(page).not.toHaveURL(/\/login$/)
}
export function workbook(invalid=false) {
 const dir=mkdtempSync(join(tmpdir(),'sles-xlsx-')), file=join(dir,'questions.xlsx')
 execFileSync('python3',['e2e/workbook.py',file,...(invalid?['invalid']:[])])
 return {file,dispose:()=>rmSync(dir,{recursive:true})}
}
export async function preview(ctx:APIRequestContext,chapter:string,invalid=false) {
 const f=workbook(invalid)
 try {
 const {readFileSync}=await import('node:fs')
 const r=await ctx.post(`/api/teacher/chapters/${chapter}/questions/import/preview`,{multipart:{file:{name:'questions.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:readFileSync(f.file)}}})
 expect(r.status()).toBe(200);return r.json()
 }finally{f.dispose()}
}
export async function seed() {
 const admin=await activate('e2e_admin',process.env.SLES_E2E_PASSWORD!)
 const t=await call(admin,'POST','/admin/teachers',{username:'e2e_teacher',fullName:'E2E Teacher'})
 const teacher=await activate(t.user.username,t.temporaryPassword)
 const grades=await call(teacher,'GET','/teacher/grades');const grade=grades.find((g:{code:string})=>g.code==='GRADE_10');if(!grade)throw new Error('Grade 10 seed missing')
 const subject=await call(admin,'POST','/admin/subjects',{code:'E2E_CHEM10',name:'Hóa học 10'})
 const students=[]
 for(let i=1;i<=3;i++) {
  const u=await call(teacher,'POST','/teacher/students',{username:'e2e_student'+i,fullName:'E2E Student '+i,gradeId:grade.id})
  const ctx=await activate(u.user.username,u.temporaryPassword);students.push({id:u.user.id,ctx,username:u.user.username})
 }
 const chapters=[]
 for(let i=1;i<=2;i++) {
  const c=await call(teacher,'POST','/teacher/chapters',{gradeId:grade.id,subjectId:subject.id,name:'Hoá học chương '+i,description:'E2E isolated',displayOrder:i})
  await call(teacher,'PUT',`/teacher/chapters/${c.id}/content`,{content:'# Hoá học\n\nLý thuyết nguyên tử E2E.'});chapters.push(c)
 }
 const p=await preview(teacher,chapters[0].id)
 expect(p.validRows).toBe(200)
 const imported=await call(teacher,'POST',`/teacher/chapters/${chapters[0].id}/questions/import/confirm`,{token:p.token})
 expect(imported.state).toBe('Completed')
 await call(teacher,'POST',`/teacher/chapters/${chapters[0].id}/questions/bulk-publish`,{requestId:crypto.randomUUID(),allEligible:true})
 await call(teacher,'POST',`/teacher/chapters/${chapters[0].id}/publish`)
 const exam=await call(teacher,'POST','/teacher/exams',{chapterId:chapters[0].id,name:'E2E Exam',durationMinutes:30})
 await call(teacher,'POST',`/teacher/exams/${exam.id}/publish`)
 await call(teacher,'POST',`/teacher/exams/${exam.id}/permissions/bulk`,{studentIds:students.slice(0,2).map(s=>s.id)})
 return {admin,teacher,teacherId:t.user.id,grade,subject,students,chapters,exam}
}
