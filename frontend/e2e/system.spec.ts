import { test, expect } from '@playwright/test'
import { seed, login, call, sql, workbook, preview, actor, password } from './helpers'
let data:Awaited<ReturnType<typeof seed>>
test.describe.configure({mode:'serial'})
test.beforeAll(async()=>{data=await seed()})
test.afterEach(async({page})=>{if (!process.env.CI) await page.goto('about:blank')})
test.afterAll(async()=>{if(data)await Promise.all([data.admin,data.teacher,...data.students.map(s=>s.ctx)].map(c=>c.dispose()))})

test('01 Admin browser creates teacher; HTTP edit/status/subject and authorization',async({page})=>{
 await login(page,'e2e_admin');await page.goto('/admin/teachers/new')
 await page.getByLabel('Tên đăng nhập').fill('e2e_other_teacher');await page.getByLabel('Họ và tên').fill('Other Teacher')
 const created=page.waitForResponse(r=>r.url().endsWith('/api/admin/teachers')&&r.request().method()==='POST')
 await page.getByRole('button',{name:'Tạo giáo viên',exact:true}).click();const r=await created;expect(r.status()).toBe(200)
 const teacher=await r.json()
 await call(data.admin,'PUT',`/admin/teachers/${teacher.user.id}`,{fullName:'Edited Teacher'})
 await call(data.admin,'PATCH',`/admin/teachers/${teacher.user.id}/status`,{isActive:false})
 const inactive=await page.request.post(process.env.SLES_E2E_API+'/api/auth/login',{data:{username:teacher.user.username,password:teacher.temporaryPassword}});expect(inactive.status()).toBe(401)
 await call(data.admin,'PATCH',`/admin/teachers/${teacher.user.id}/status`,{isActive:true})
 const other=await actor(teacher.user.username,teacher.temporaryPassword)
 expect((await other.get(`/api/teacher/exams/${data.exam.id}/permissions`)).status()).toBe(404);await other.dispose()
 await call(data.admin,'PUT',`/admin/subjects/${data.subject.id}`,{name:'Hóa học 10',description:'Edited through real API'})
 expect((await data.students[0].ctx.get('/api/admin/teachers')).status()).toBe(403)
})

test('02 Teacher browser creates student; forced password change',async({page})=>{
 await login(page,'e2e_teacher');await page.goto('/teacher/students/new')
 await page.getByLabel('Tên đăng nhập').fill('e2e_new_student');await page.getByLabel('Họ và tên').fill('New Student')
 await page.getByLabel('Khối lớp').selectOption(data.grade.id)
 const created=page.waitForResponse(r=>r.url().endsWith('/api/teacher/students')&&r.request().method()==='POST')
 await page.getByRole('button',{name:'Tạo học sinh',exact:true}).click();const response=await created;expect(response.status()).toBe(200)
 const user=await response.json()
 await page.context().clearCookies();await page.goto('/login');await page.reload()
 await login(page,user.user.username,user.temporaryPassword);await expect(page).toHaveURL(/change-password/)
 await page.getByLabel('Mật khẩu hiện tại',{exact:true}).fill(user.temporaryPassword)
 await page.getByLabel('Mật khẩu mới',{exact:true}).fill(password)
 await page.getByLabel('Xác nhận mật khẩu mới').fill(password)
 await page.getByRole('button',{name:'Cập nhật mật khẩu'}).click();await expect(page).toHaveURL(/login/)
})

test('03 Teacher browser validates Excel, imports 200, bulk publishes chapter',async({page})=>{
 await login(page,'e2e_teacher');const chapter=data.chapters[1].id
 await page.goto(`/teacher/chapters/${chapter}/questions`);await page.getByRole('button',{name:'Import Excel',exact:true}).click()
 const bad=workbook(true),good=workbook()
 try{
 await page.getByLabel('File Excel').setInputFiles(bad.file);await page.getByRole('button',{name:'Kiểm tra file'}).click()
 await expect(page.getByRole('alert')).toContainText('Có dòng lỗi')
 await expect(page.getByRole('button',{name:'Xác nhận import'})).toBeDisabled()
 await page.getByLabel('File Excel').setInputFiles(good.file);await page.getByRole('button',{name:'Kiểm tra file'}).click()
 await expect(page.getByText('Tổng dòng: 200 · Hợp lệ: 200 · Không hợp lệ: 0')).toBeVisible()
 await page.getByRole('button',{name:'Xác nhận import'}).click();await page.getByRole('button',{name:'Nhập tất cả',exact:true}).click()
 await expect(page.getByText('Đã nhập 200 câu hỏi bản nháp.')).toBeVisible()
 expect(sql(`SELECT count(*) FROM questions WHERE chapter_id='${chapter}'`)).toBe('200')
 const published=page.waitForResponse(r=>r.url().endsWith('/questions/bulk-publish')&&r.request().method()==='POST')
 await page.getByRole('button',{name:'Xuất bản mọi bản nháp hợp lệ trong chương'}).click()
 await page.getByRole('button',{name:'Xác nhận xuất bản',exact:true}).click()
 const result=await (await published).json()
 expect(result.publishedCount).toBe(200)
 expect(result.difficulties.map((x:{total:number})=>x.total)).toEqual([60,60,40,40,0])
 await call(data.teacher,'POST',`/teacher/chapters/${chapter}/publish`)
 }finally{bad.dispose();good.dispose()}
})

test('04 Teacher browser exam permissions grant/revoke and blueprint',async({page})=>{
 await login(page,'e2e_teacher');await page.goto(`/teacher/exams/${data.exam.id}`)
 await expect(page.getByText('Nhận biết: cần 3, hiện có 60 — Đủ',{exact:true})).toBeVisible()
 await page.goto(`/teacher/exams/${data.exam.id}/permissions`)
 await page.getByRole('button',{name:'Cấp quyền cho e2e_student3',exact:true}).click()
 await page.getByRole('dialog').getByRole('button',{name:'Cấp quyền cho e2e_student3',exact:true}).click()
 const row=page.getByRole('row').filter({has:page.getByRole('button',{name:'Thu hồi quyền'})}).filter({hasText:'e2e_student3'})
 await row.getByRole('button',{name:'Thu hồi quyền'}).click();await page.getByRole('dialog').getByRole('button',{name:'Thu hồi quyền',exact:true}).click()
 await expect(page.getByText('Đã thu hồi',{exact:true})).toBeVisible()
})

test('05 Student browser subject, chapter and theory',async({page})=>{
 await login(page,'e2e_student1');await page.goto('/student/subjects')
 await expect(page.getByText('Hóa học 10',{exact:true})).toBeVisible()
 await page.goto(`/student/chapters/${data.chapters[0].id}`)
 await expect(page.getByText('Lý thuyết nguyên tử E2E.')).toBeVisible()
})

test('06 Student browser Practice 200, save/reload, submit, review/history/repeat',async({page})=>{
 await login(page,'e2e_student1');await page.goto(`/student/chapters/${data.chapters[0].id}/practice`)
 const start=page.waitForResponse(r=>r.url().endsWith('/practice')&&r.request().method()==='POST')
 await page.getByRole('button',{name:'Bắt đầu bài mới',exact:true}).click();const attempt=await (await start).json()
 expect(attempt.questions).toHaveLength(200)
 await page.getByRole('radio',{name:/Đúng/}).check()
 await expect(page.getByText('Đã đồng bộ với máy chủ')).toBeVisible();await page.reload()
 await expect(page.getByRole('radio',{name:/Đúng/})).toBeChecked()
 await page.getByRole('button',{name:'Nộp bài',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Xác nhận nộp',exact:true}).click()
 await expect(page).toHaveURL(/\/result$/)
 const result=await call(data.students[0].ctx,'GET',`/student/practice/${attempt.attemptId}/result`)
 expect(result.correctAnswers).toBe(1);expect(result.score).toBe(0.05)
 await page.goto('/student/practice/history');await expect(page.getByRole('heading',{name:'Lịch sử luyện tập'})).toBeVisible()
 const second=await call(data.students[0].ctx,'POST',`/student/chapters/${data.chapters[0].id}/practice`)
 expect(second.attemptId).not.toBe(attempt.attemptId)
})

test('07 Student browser Exam snapshots, deadline/reload and lost submit response',async({page})=>{
 await login(page,'e2e_student1');await page.goto(`/student/exams/${data.exam.id}`)
 const started=page.waitForResponse(r=>r.url().endsWith('/start')&&r.request().method()==='POST')
 await page.getByRole('button',{name:'Bắt đầu thi',exact:true}).click();const attempt=await (await started).json()
 expect(attempt.questions).toHaveLength(10);expect(JSON.stringify(attempt)).not.toMatch(/isCorrect|questionSnapshot|difficulty/)
 const grouped=sql(`SELECT question_snapshot->>'difficulty',count(*) FROM exam_attempt_questions WHERE exam_attempt_id='${attempt.attemptId}' GROUP BY 1 ORDER BY 1`)
 expect(grouped).toBe('COMPREHENSION|3\nHIGH_APPLICATION|2\nLOW_APPLICATION|2\nRECOGNITION|3')
 expect(sql(`SELECT count(DISTINCT source_question_id) FROM exam_attempt_questions WHERE exam_attempt_id='${attempt.attemptId}'`)).toBe('10')
 await page.getByRole('radio',{name:/Đúng/}).check();await expect(page.getByText('Đã đồng bộ với máy chủ')).toBeVisible()
 await page.reload();await expect(page.getByRole('radio',{name:/Đúng/})).toBeChecked()
 const restored=await call(data.students[0].ctx,'GET',`/student/exam-attempts/${attempt.attemptId}`)
 const originalDeadlineMs=Date.parse(attempt.expiresAt)
 const restoredDeadlineMs=Date.parse(restored.expiresAt)
 // Compare instants at millisecond precision; NaN must never compare equal to NaN.
 expect(Number.isFinite(originalDeadlineMs),'Original expiresAt must be a valid timestamp').toBe(true)
 expect(Number.isFinite(restoredDeadlineMs),'Restored expiresAt must be a valid timestamp').toBe(true)
 expect(restoredDeadlineMs).toBe(originalDeadlineMs)
 await page.route('**/api/student/exam-attempts/*/submit',async route=>{await route.fetch();await route.abort('timedout')},{times:1})
 await page.getByRole('button',{name:'Nộp bài',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Xác nhận nộp',exact:true}).click()
 await expect(page).toHaveURL(/\/result$/)
 const result=await call(data.students[0].ctx,'GET',`/student/exam-attempts/${attempt.attemptId}/result`);expect(result.score).toBe(1)
 const again=await call(data.students[0].ctx,'POST',`/student/exam-attempts/${attempt.attemptId}/submit`);expect(again.score).toBe(1)
 const retry=await call(data.students[0].ctx,'POST',`/student/exams/${data.exam.id}/start`);expect(retry.attemptId).toBe(attempt.attemptId)
})

test('08 Teacher browser sees official Exam result',async({page})=>{
 await login(page,'e2e_teacher');await page.goto(`/teacher/exams/${data.exam.id}/results`)
 await expect(page.getByText('1 / 10',{exact:true})).toBeVisible()
 await page.getByRole('link',{name:'Xem bài làm'}).click();await expect(page.getByText(/Đúng/).first()).toBeVisible()
})

test('09 Real HTTP concurrent start, answer updates and controlled deadline',async()=>{
 const ctx=data.students[1].ctx
 const starts=await Promise.all([call(ctx,'POST',`/student/exams/${data.exam.id}/start`),call(ctx,'POST',`/student/exams/${data.exam.id}/start`)])
 expect(starts[0].attemptId).toBe(starts[1].attemptId)
 const a=starts[0],q=a.questions[0],path=`/student/exam-attempts/${a.attemptId}/questions/${q.id}/answer`
 // Race the first INSERT as well as later updates of an existing answer.
 const firstWrites=await Promise.all([ctx.put('/api'+path,{data:{selectedOptionId:q.options[0].id}}),ctx.put('/api'+path,{data:{selectedOptionId:q.options[1].id}})])
 expect(firstWrites.every(r=>[204,409].includes(r.status()))).toBe(true)
 expect(firstWrites.some(r=>r.status()===204)).toBe(true)
 const responses=await Promise.all([ctx.put('/api'+path,{data:{selectedOptionId:q.options[1].id}}),ctx.put('/api'+path,{data:{selectedOptionId:q.options[2].id}})])
 expect(responses.map(r=>r.status())).toEqual([204,204])
 const saved=await call(ctx,'GET',`/student/exam-attempts/${a.attemptId}`);expect([q.options[1].id,q.options[2].id]).toContain(saved.questions[0].selectedOptionId)
 sql(`UPDATE exam_attempts SET started_at=now()-interval '31 minutes',expires_at=now()-interval '1 second' WHERE id='${a.attemptId}'`)
 expect((await ctx.put('/api'+path,{data:{selectedOptionId:q.options[3].id}})).status()).toBe(409)
 const final=await call(ctx,'GET',`/student/exam-attempts/${a.attemptId}/result`);expect(final.status).toBe('AutoSubmitted')
})

test('10 Real HTTP unauthorized/revoked, future/expired exam and insufficient pool',async()=>{
 const ctx=data.students[2].ctx
 expect((await ctx.post(`/api/student/exams/${data.exam.id}/start`)).status()).toBe(400)
 const list=await call(ctx,'GET','/student/exams');expect(list.items).toHaveLength(0)
 for(const future of [true,false]){
 const exam=await call(data.teacher,'POST','/teacher/exams',{chapterId:data.chapters[0].id,name:future?'Future':'Expired',durationMinutes:30,startAt:future?new Date(Date.now()+3600000).toISOString():null,endAt:new Date(Date.now()+7200000).toISOString()})
 await call(data.teacher,'POST',`/teacher/exams/${exam.id}/publish`);await call(data.teacher,'POST',`/teacher/exams/${exam.id}/permissions`,{studentId:data.students[2].id})
 if(!future)sql(`UPDATE exams SET end_at=now()-interval '1 second' WHERE id='${exam.id}'`)
 expect((await ctx.post(`/api/student/exams/${exam.id}/start`)).status()).toBe(404)
 }
 const exam=await call(data.teacher,'POST','/teacher/exams',{chapterId:data.chapters[1].id,name:'Shortage',durationMinutes:30})
 sql(`UPDATE questions SET difficulty='RECOGNITION' WHERE chapter_id='${data.chapters[1].id}' AND difficulty='HIGH_APPLICATION'`)
 const response=await data.teacher.post(`/api/teacher/exams/${exam.id}/publish`);expect(response.status()).toBe(409)
 expect((await response.json()).error.code).toBe('insufficientblueprint')
})

test('11 Real HTTP concurrent Excel confirmation is idempotent',async()=>{
 const c=await call(data.teacher,'POST','/teacher/chapters',{gradeId:data.grade.id,subjectId:data.subject.id,name:'Concurrent import',displayOrder:3})
 const p=await preview(data.teacher,c.id)
 const responses=await Promise.all([call(data.teacher,'POST',`/teacher/chapters/${c.id}/questions/import/confirm`,{token:p.token}),call(data.teacher,'POST',`/teacher/chapters/${c.id}/questions/import/confirm`,{token:p.token})])
 expect(responses.some(r=>r.state==='Completed')).toBe(true)
 expect(sql(`SELECT count(*) FROM questions WHERE chapter_id='${c.id}'`)).toBe('200')
})

test('12 Browser expired refresh token returns to login',async({page})=>{
 await login(page,'e2e_student3')
 sql(`UPDATE refresh_tokens SET expires_at=created_at+interval '1 second',created_at=created_at-interval '2 days' WHERE user_id='${data.students[2].id}'`)
 // Use a past expiry relative to the record, retaining schema's expiry > creation constraint.
 sql(`UPDATE refresh_tokens SET expires_at=now()-interval '1 hour' WHERE user_id='${data.students[2].id}'`)
 await page.reload();await expect(page).toHaveURL(/login/)
})

 test('13 Real HTTP available exams endpoint',async()=>{
  const result=await call(data.students[0].ctx,'GET','/student/exams/available')
  expect(result.items.some((x:{id:string})=>x.id===data.exam.id)).toBe(true)
 })

 test('14 Teacher browser creates chapter and edits theory',async({page})=>{
  await login(page,'e2e_teacher');await page.goto('/teacher/chapters/new')
  await page.getByLabel('Tên chương').fill('Chương UI E2E')
  await page.getByLabel('Khối lớp').selectOption(data.grade.id)
  await page.getByLabel('Môn học').selectOption(data.subject.id)
  const response=page.waitForResponse(r=>r.url().endsWith('/api/teacher/chapters')&&r.request().method()==='POST')
  await page.getByRole('button',{name:'Tạo chương học',exact:true}).click()
  const chapter=await (await response).json()
  await page.goto(`/teacher/chapters/${chapter.id}/content`)
  await page.getByLabel('Nội dung Markdown').fill('# Nội dung UI E2E')
  await page.getByRole('button',{name:'Lưu nội dung',exact:true}).click()
  await expect(page.getByText('Đã lưu ·', {exact:false})).toBeVisible()
  await page.reload();await expect(page.getByLabel('Nội dung Markdown')).toHaveValue('# Nội dung UI E2E')
 })

 test('15 Browser deadline crossed while answer request is in flight',async({page})=>{
  const exam=await call(data.teacher,'POST','/teacher/exams',{chapterId:data.chapters[0].id,name:'Deadline boundary',durationMinutes:30})
  await call(data.teacher,'POST',`/teacher/exams/${exam.id}/publish`)
  await call(data.teacher,'POST',`/teacher/exams/${exam.id}/permissions`,{studentId:data.students[2].id})
  await login(page,'e2e_student3');await page.goto(`/student/exams/${exam.id}`)
  const started=page.waitForResponse(r=>r.url().endsWith('/start')&&r.request().method()==='POST')
  await page.getByRole('button',{name:'Bắt đầu thi',exact:true}).click();const attempt=await (await started).json()
  // Pause transport after the UI enters saving; advance only this test row's deadline.
  await page.route('**/api/student/exam-attempts/*/questions/*/answer',async route=>{
   sql(`UPDATE exam_attempts SET started_at=now()-interval '31 minutes',expires_at=now()-interval '1 second' WHERE id='${attempt.attemptId}'`)
   await route.continue()
  },{times:1})
  const rejected=page.waitForResponse(r=>r.url().endsWith('/answer')&&r.request().method()==='PUT')
  await page.getByRole('radio',{name:/Đúng/}).check()
  expect((await rejected).status()).toBe(409)
  await expect(page).toHaveURL(/\/result$/)
  const result=await call(data.students[2].ctx,'GET',`/student/exam-attempts/${attempt.attemptId}/result`)
  expect(result.status).toBe('AutoSubmitted');expect(result.answeredQuestions).toBe(0);expect(result.score).toBe(0)
 })

test('16 Teacher bulk question deletion preserves published data and rejects foreign IDs', async ({page}) => {
 const chapter=await call(data.teacher,'POST','/teacher/chapters',{gradeId:data.grade.id,subjectId:data.subject.id,name:'Bulk question chapter',displayOrder:1})
 const question=await call(data.teacher,'POST',`/teacher/chapters/${chapter.id}/questions`,{content:'Bulk disposable question',difficulty:'RECOGNITION',options:['A','B','C','D'].map((content,i)=>({content,isCorrect:i===0}))})
 await login(page,'e2e_teacher');await page.goto(`/teacher/chapters/${chapter.id}/questions`)
 await page.getByRole('checkbox',{name:'Chọn câu Bulk disposable question'}).check()
 await page.getByRole('button',{name:'Xóa đã chọn',exact:true}).click()
 await expect(page.getByRole('dialog')).toContainText('1 bản ghi')
 await page.getByRole('button',{name:'Hủy',exact:true}).click()
 expect((await call(data.teacher,'GET',`/teacher/questions/${question.question.id}`)).question.id).toBe(question.question.id)
 await page.getByRole('button',{name:'Xóa đã chọn',exact:true}).click();await page.getByRole('button',{name:'Xác nhận thao tác',exact:true}).click()
 await expect(page.getByText('Thành công: 1 · Thất bại: 0')).toBeVisible()
 expect((await data.teacher.get('/api/teacher/questions/'+question.question.id)).status()).toBe(404)
 const published=await call(data.teacher,'GET',`/teacher/chapters/${data.chapters[0].id}/questions?page=1&pageSize=1`)
 const protectedId=published.items[0].id
 const blocked=await call(data.teacher,'POST','/teacher/questions/bulk-delete',{ids:[protectedId]})
 expect(blocked.results[0].code).toBe('invalid_transition')
 expect((await data.students[0].ctx.post('/api/teacher/questions/bulk-delete',{data:{ids:[protectedId]}})).status()).toBe(403)
 const foreignTeacher=await call(data.admin,'POST','/admin/teachers',{username:'e2e_bulk_foreign',fullName:'Foreign bulk teacher'})
 const temporary=await actor(foreignTeacher.user.username,foreignTeacher.temporaryPassword)
 await call(temporary,'PUT','/auth/change-password',{currentPassword:foreignTeacher.temporaryPassword,newPassword:password});await temporary.dispose()
 const other=await actor(foreignTeacher.user.username)
 try {const denied=await call(other,'POST','/teacher/questions/bulk-delete',{ids:[protectedId]});expect(denied.results[0].code).toBe('not_found')} finally {await other.dispose()}
 expect(sql(`SELECT count(*) FROM questions WHERE id='${protectedId}' AND deleted_at IS NULL`)).toBe('1')
})

test('17 Teacher bulk chapter deletion reports protected dependencies', async ({page}) => {
 const body={gradeId:data.grade.id,subjectId:data.subject.id,displayOrder:1}
 const empty=await call(data.teacher,'POST','/teacher/chapters',{...body,name:'Bulk empty chapter'})
 const blocked=await call(data.teacher,'POST','/teacher/chapters',{...body,name:'Bulk protected chapter'})
 await call(data.teacher,'POST',`/teacher/chapters/${blocked.id}/questions`,{content:'Protected child',difficulty:'RECOGNITION',options:['A','B','C','D'].map((content,i)=>({content,isCorrect:i===0}))})
 await login(page,'e2e_teacher');await page.goto('/teacher/chapters')
 await page.getByRole('checkbox',{name:'Chọn xử lý: Bulk empty chapter'}).check();await page.getByRole('checkbox',{name:'Chọn xử lý: Bulk protected chapter'}).check()
 await page.getByRole('button',{name:'Xóa đã chọn',exact:true}).click();await page.getByRole('button',{name:'Xác nhận thao tác',exact:true}).click()
 await expect(page.getByText('Thành công: 1 · Thất bại: 1')).toBeVisible()
 await expect(page.getByRole('status')).toContainText('Bulk protected chapter')
 expect(sql(`SELECT count(*) FROM chapters WHERE id='${blocked.id}' AND deleted_at IS NULL`)).toBe('1')
 expect(sql(`SELECT count(*) FROM chapters WHERE id='${empty.id}' AND deleted_at IS NOT NULL`)).toBe('1')
})

test('18 Teacher bulk deactivation preserves a student and blocks their session', async ({page}) => {
 const created=await call(data.teacher,'POST','/teacher/students',{username:'e2e_bulk_student',fullName:'Bulk student',gradeId:data.grade.id})
 const temporary=await actor(created.user.username,created.temporaryPassword)
 await call(temporary,'PUT','/auth/change-password',{currentPassword:created.temporaryPassword,newPassword:password});await temporary.dispose()
 const student=await actor(created.user.username)
 try {
  await login(page,'e2e_teacher');await page.goto('/teacher/students')
  await page.getByRole('checkbox',{name:'Chọn xử lý: Bulk student',exact:true}).check()
  await page.getByRole('button',{name:'Ngừng hoạt động đã chọn',exact:true}).click();await page.getByRole('button',{name:'Xác nhận thao tác',exact:true}).click()
  await expect(page.getByText('Thành công: 1 · Thất bại: 0')).toBeVisible()
  expect((await student.get('/api/auth/me')).status()).toBe(401)
  expect(sql(`SELECT count(*) FROM users WHERE id='${created.user.id}' AND NOT is_active AND deleted_at IS NULL`)).toBe('1')
  expect(sql(`SELECT count(*) FROM refresh_tokens WHERE user_id='${created.user.id}' AND revoked_at IS NULL`)).toBe('0')
 } finally {await student.dispose()}
})

test('19 Teacher bulk closes only selected exams without deleting them', async ({page}) => {
 const exam=await call(data.teacher,'POST','/teacher/exams',{chapterId:data.chapters[0].id,name:'Bulk close exam',durationMinutes:30})
 await login(page,'e2e_teacher');await page.goto('/teacher/exams')
 await page.getByRole('checkbox',{name:'Chọn xử lý: Bulk close exam',exact:true}).check()
 await page.getByRole('button',{name:'Đóng bài thi đã chọn',exact:true}).click();await page.getByRole('button',{name:'Xác nhận thao tác',exact:true}).click()
 await expect(page.getByText('Thành công: 1 · Thất bại: 0')).toBeVisible()
 expect(sql(`SELECT status FROM exams WHERE id='${exam.id}'`)).toBe('CLOSED')
 expect((await call(data.teacher,'GET',`/teacher/exams/${exam.id}`)).status).toBe('Closed')
})

test('20 Admin bulk deactivates a separate teacher while preserving linked students', async ({page}) => {
 const created=await call(data.admin,'POST','/admin/teachers',{username:'e2e_bulk_teacher',fullName:'Bulk teacher'})
 const temporary=await actor(created.user.username,created.temporaryPassword)
 await call(temporary,'PUT','/auth/change-password',{currentPassword:created.temporaryPassword,newPassword:password});await temporary.dispose()
 const teacher=await actor(created.user.username)
 try {
  const student=await call(teacher,'POST','/teacher/students',{username:'e2e_bulk_owned',fullName:'Preserved student',gradeId:data.grade.id})
  expect((await data.teacher.post('/api/admin/teachers/bulk-deactivate',{data:{ids:[created.user.id]}})).status()).toBe(403)
  await login(page,'e2e_admin');await page.goto('/admin/teachers')
  await page.getByRole('checkbox',{name:'Chọn xử lý: Bulk teacher',exact:true}).check()
  await page.getByRole('button',{name:'Ngừng hoạt động đã chọn',exact:true}).click();await page.getByRole('button',{name:'Xác nhận thao tác',exact:true}).click()
  await expect(page.getByText('Thành công: 1 · Thất bại: 0')).toBeVisible()
  expect((await teacher.get('/api/auth/me')).status()).toBe(401)
  expect(sql(`SELECT count(*) FROM users WHERE id='${student.user.id}' AND deleted_at IS NULL`)).toBe('1')
 } finally {await teacher.dispose()}
})
