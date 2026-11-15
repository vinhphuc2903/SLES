import { afterEach,beforeEach,describe,expect,it } from 'vitest'
import { cleanup,fireEvent,screen,waitFor,within } from '@testing-library/react'
import { apiClient,authApi,setAccessToken } from '@/lib/api/apiClient'
import { mountAdmin,firstId } from '@/features/admin/test/adminFixture'
import { student } from './teacherFixture'
import { createManagementBackend,question,exam } from './managementFixture'
const original=apiClient.defaults.adapter,originalAuth=authApi.defaults.adapter
let backend:ReturnType<typeof createManagementBackend>
let mounted:ReturnType<typeof mountAdmin>|undefined
beforeEach(()=>{backend=createManagementBackend()})
afterEach(()=>{cleanup();mounted?.client.clear();mounted=undefined;apiClient.defaults.adapter=original;authApi.defaults.adapter=originalAuth;setAccessToken(null)})
const mount=(p:string)=>{mounted=mountAdmin(p);return mounted}
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}))
const change=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}})
const confirm=(label:string)=>fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:label}))
const calls=(method:string,url:string)=>backend.teacher.base.requests.filter(r=>r.method===method&&r.url===url)
const chapter='/teacher/chapters/'+firstId,examPath='/teacher/exams/'+firstId,qpath='/teacher/questions/'+firstId,api='/api/teacher/exams/'+firstId,qapi='/api/teacher/questions/'+firstId

describe('Question bank',()=>{
 it('selects chapters without loading cross-chapter question banks',async()=>{
  mount('/teacher/questions');await screen.findByText('Đại số')
  expect(backend.teacher.base.requests.some(r=>r.url.includes('/questions'))).toBe(false)
  fireEvent.click(screen.getByRole('link',{name:'Quản lý câu hỏi'}))
  expect(await screen.findByText('Câu hỏi gốc')).toBeInTheDocument()
 })
 it('paginates and filters questions on the server',async()=>{
  backend.questions=Array.from({length:21},(_,i)=>({...structuredClone(question),question:{...question.question,id:String(i),content:'Câu '+i}}))
  mount(chapter+'/questions');await screen.findByText('Câu 0');click('Sau')
  expect(await screen.findByText('Câu 20')).toBeInTheDocument()
  change('Tìm kiếm','Câu 20');change('Lọc trạng thái','Draft');click('Áp dụng')
  await waitFor(()=>expect(calls('get','/api/teacher/chapters/'+firstId+'/questions').at(-1)?.params).toMatchObject({page:1,keyword:'Câu 20',status:'Draft'}))
 })
 it('validates four nonempty options and exactly one radio answer before create',async()=>{
  mount(chapter+'/questions/new');await screen.findByLabelText('Nội dung câu hỏi');click('Tạo câu hỏi')
  expect(await screen.findByText('Vui lòng nhập câu hỏi.')).toBeInTheDocument()
  expect(screen.getAllByRole('radio')).toHaveLength(4)
  change('Nội dung câu hỏi','Câu mới');for(const label of ['A','B','C','D'])change('Phương án '+label,'Nội dung '+label)
  click('Tạo câu hỏi');expect(await screen.findByText('Vui lòng chọn một đáp án đúng.')).toBeInTheDocument()
  change('Mức độ','RECOGNITION');fireEvent.click(screen.getByLabelText('Đáp án đúng C'));click('Tạo câu hỏi')
  await screen.findByRole('heading',{name:'Chi tiết câu hỏi'})
  const body=calls('post','/api/teacher/chapters/'+firstId+'/questions')[0]?.body
  expect(body?.options).toEqual(['A','B','C','D'].map(label=>({content:'Nội dung '+label,isCorrect:label==='C'})))
  expect(body).not.toHaveProperty('teacherId')
 })
 it('edits the ordered options without sending database IDs',async()=>{
  backend.questions[0]!.options.reverse()
  mount(qpath);await screen.findByLabelText('Nội dung câu hỏi')
  expect(screen.getByLabelText('Phương án A')).toHaveValue('Phương án A')
  expect(screen.getByLabelText('Đáp án đúng B')).toBeChecked()
  change('Nội dung câu hỏi','Đã sửa');click('Lưu câu hỏi')
  await waitFor(()=>expect(calls('put',qapi)).toHaveLength(1))
  expect(JSON.stringify(calls('put',qapi)[0]?.body)).not.toContain('option-')
 })
 it('confirms publication and makes the question read-only',async()=>{
  mount(qpath);await screen.findByLabelText('Nội dung câu hỏi');click('Xuất bản câu hỏi')
  expect(calls('post',qapi+'/publish')).toHaveLength(0);confirm('Xuất bản câu hỏi')
  expect(await screen.findByText('Câu hỏi đã xuất bản hoặc lưu trữ: chỉ đọc.')).toBeInTheDocument()
  expect(screen.queryByLabelText('Nội dung câu hỏi')).not.toBeInTheDocument()
 })
 it.each(['archive','delete'] as const)('confirms question %s and refreshes',async action=>{
  mount(qpath);await screen.findByLabelText('Nội dung câu hỏi')
  const label=action==='archive'?'Lưu trữ câu hỏi':'Xóa câu hỏi';click(label);confirm(label)
  await waitFor(()=>expect(calls(action==='delete'?'delete':'post',qapi+(action==='delete'?'':'/archive'))).toHaveLength(1))
  expect(await screen.findByText(action==='archive'?'Câu hỏi đã xuất bản hoặc lưu trữ: chỉ đọc.':'Chưa có dữ liệu')).toBeInTheDocument()
 })
 it('shows history conflict without losing question input',async()=>{
  mount(qpath);await screen.findByLabelText('Nội dung câu hỏi')
  backend.failure={url:qapi,status:409,code:'haslearninghistory'};change('Nội dung câu hỏi','Không mất');click('Lưu câu hỏi')
  expect(await screen.findByRole('alert')).toHaveTextContent('lịch sử')
  expect(screen.getByLabelText('Nội dung câu hỏi')).toHaveValue('Không mất')
 })
 it.each([199,200,201])('shows truthful publication progress at %s',async count=>{
  backend.progress=count;mount(chapter)
  expect(await screen.findByText('Câu hỏi đã xuất bản hợp lệ: '+count+' / 200')).toBeInTheDocument()
  expect(screen.getByText(count===199?'Chưa đủ 200 câu hỏi hợp lệ.':count===201?'Vượt quá 200 câu hỏi hợp lệ; chưa đáp ứng điều kiện xuất bản.':'Đủ đúng 200 câu hỏi hợp lệ; máy chủ vẫn cần kiểm tra nội dung, khối lớp, môn học và trạng thái chương.')).toBeInTheDocument()
 })
 it('refetches progress after publishing a question from the list',async()=>{
  backend.progress=199;mount(chapter+'/questions');await screen.findByText('Câu hỏi gốc')
  click('Xuất bản câu hỏi');confirm('Xuất bản câu hỏi')
  expect(await screen.findByText('Câu hỏi đã xuất bản hợp lệ: 200 / 200')).toBeInTheDocument()
 })
})

describe('Exams',()=>{
 it('creates an exam with local times converted to UTC and no selected question IDs',async()=>{
  backend.teacher.chapters[0]!.chapter.status='Published'
  mount('/teacher/exams/new');await screen.findByRole('radio')
  click('Tạo bài kiểm tra');expect(await screen.findByText('Vui lòng nhập tên bài kiểm tra.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio'));change('Tên bài kiểm tra','Đề mới');change('Bắt đầu','2027-01-02T08:30:00');change('Kết thúc','2027-01-02T08:00:00');click('Tạo bài kiểm tra')
  expect(await screen.findByText('Thời gian kết thúc phải sau bắt đầu.')).toBeInTheDocument()
  change('Kết thúc','2027-01-02T09:30:00');click('Tạo bài kiểm tra')
  await screen.findByRole('heading',{name:'Đề mới'})
  expect(calls('post','/api/teacher/exams')[0]?.body).toEqual({chapterId:firstId,name:'Đề mới',description:null,durationMinutes:30,startAt:new Date('2027-01-02T08:30:00').toISOString(),endAt:new Date('2027-01-02T09:30:00').toISOString()})
 })
 it('paginates and filters exam list',async()=>{
  backend.exams=Array.from({length:21},(_,i)=>({...exam,id:String(i),name:'Bài '+i}))
  mount('/teacher/exams');await screen.findByText('Bài 0');click('Sau')
  expect(await screen.findByText('Bài 20')).toBeInTheDocument()
  change('Tìm kiếm','Bài 20');change('Lọc trạng thái','Draft');click('Áp dụng')
  await waitFor(()=>expect(calls('get','/api/teacher/exams').at(-1)?.params).toMatchObject({page:1,keyword:'Bài 20',status:'Draft'}))
 })
 it('updates draft without changing chapter or role',async()=>{
  mount(examPath);await screen.findByLabelText('Tên bài kiểm tra');change('Tên bài kiểm tra','Tên sửa');click('Lưu bài kiểm tra')
  await waitFor(()=>expect(calls('put',api)[0]?.body).toEqual({name:'Tên sửa',description:null,durationMinutes:30,startAt:null,endAt:null}))
 })
 it('publishes then closes with confirmations and actual lifecycle',async()=>{
  mount(examPath);await screen.findByRole('heading',{name:exam.name});click('Xuất bản bài kiểm tra')
  expect(calls('post',api+'/publish')).toHaveLength(0);confirm('Xuất bản bài kiểm tra')
  await screen.findByText('Đang mở');expect(screen.queryByLabelText('Tên bài kiểm tra')).not.toBeInTheDocument()
  click('Đóng bài kiểm tra');expect(screen.getByRole('dialog')).toHaveTextContent('không tự động nộp');confirm('Đóng bài kiểm tra')
  expect(await screen.findByText('Đã đóng')).toBeInTheDocument()
 })
 it('grants only current-page selections and displays partial failure',async()=>{
  backend.teacher.students=Array.from({length:21},(_,i)=>({...student,id:String(i),username:'student'+i,fullName:'Học sinh '+i}))
  backend.partial=true;mount(examPath+'/permissions');await screen.findByLabelText('Chọn student0')
  click('Chọn tất cả trên trang');click('Cấp quyền đã chọn (20)');confirm('Xác nhận cấp quyền')
  expect(await screen.findByText('Kết quả cấp quyền')).toBeInTheDocument()
  const ids=calls('post',api+'/permissions/bulk')[0]?.body.studentIds as string[]
  expect(ids).toHaveLength(20);expect(ids).not.toContain('20')
  expect(screen.getByText(/Học sinh 1: Không đủ điều kiện/)).toBeInTheDocument()
  expect(screen.getByLabelText('Chọn student0')).toBeDisabled()
 })
 it('grants a single permission, then revokes without deleting history',async()=>{
  mount(examPath+'/permissions');await screen.findByLabelText('Chọn student01')
  click('Cấp quyền cho student01');confirm('Cấp quyền cho student01')
  await screen.findByRole('button',{name:'Thu hồi quyền'})
  expect(calls('post',api+'/permissions')[0]?.body).toEqual({studentId:firstId})
  click('Thu hồi quyền');confirm('Thu hồi quyền')
  expect(await screen.findByText('Đã thu hồi')).toBeInTheDocument()
 })
 it('disables revocation after an attempt exists',async()=>{
  backend.permissions=[{studentId:firstId,username:student.username,fullName:student.fullName,status:'Granted',hasAttempt:true,grantedAt:exam.createdAt,revokedAt:null}]
  mount(examPath+'/permissions')
  expect(await screen.findByRole('button',{name:'Thu hồi quyền'})).toBeDisabled()
 })
 it('shows distinct empty permissions and eligible students states',async()=>{
  backend.teacher.students=[];mount(examPath+'/permissions')
  expect(await screen.findByText('Không có học sinh phù hợp')).toBeInTheDocument()
  expect(await screen.findByText('Chưa có quyền tham gia')).toBeInTheDocument()
  expect(screen.queryByText('Không thể tải dữ liệu')).not.toBeInTheDocument()
 })
 it('searches only active students of the exam grade and clears selection',async()=>{
  mount(examPath+'/permissions');await screen.findByLabelText('Chọn student01')
  fireEvent.click(screen.getByLabelText('Chọn student01'));change('Tìm học sinh','absent')
  expect(await screen.findByText('Không có học sinh phù hợp')).toBeInTheDocument()
  await waitFor(()=>expect(calls('get','/api/teacher/students').at(-1)?.params).toMatchObject({isActive:true,gradeId:backend.teacher.chapters[0]!.chapter.gradeId,search:'absent',page:1}))
  expect(screen.getByRole('button',{name:'Cấp quyền đã chọn (0)'})).toBeDisabled()
 })
 it('shows grade and attempt status from permission DTO',async()=>{
  backend.permissions=[{studentId:firstId,username:student.username,fullName:student.fullName,status:'Granted',hasAttempt:true,grantedAt:exam.createdAt,revokedAt:null,gradeName:'Khối kiểm thử',attemptStatus:'Submitted'}]
  mount(examPath+'/permissions')
  expect(await screen.findByText('Khối kiểm thử')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Thu hồi quyền'})).toBeDisabled()
 })
 it.each([[403,'Bạn không có quyền truy cập'],[404,'Không tìm thấy tài nguyên'],[500,'Máy chủ không thể tải quyền dự thi']] as const)('distinguishes permissions HTTP %s in both dependent panels',async(status,title)=>{
  backend.failure={url:api+'/permissions',status};mount(examPath+'/permissions')
  await waitFor(()=>expect(screen.getAllByRole('heading',{name:title})).toHaveLength(2))
  expect(screen.queryByLabelText('Chọn student01')).not.toBeInTheDocument()
  expect(screen.queryByText('Chưa có quyền tham gia')).not.toBeInTheDocument()
 })
 it('expires the session after permissions 401 and failed refresh',async()=>{
  mount(examPath+'/permissions');await screen.findByLabelText('Chọn student01')
  backend.failure={url:api+'/permissions',status:401};backend.teacher.base.signedIn=false
  void mounted!.client.invalidateQueries()
  expect(await screen.findByRole('button',{name:'Đăng nhập'})).toBeInTheDocument()
  expect(screen.queryByLabelText('Chọn student01')).not.toBeInTheDocument()
 })
 it('displays server results including zero and null scores',async()=>{
  backend.results=[{studentId:firstId,username:'student01',fullName:'An',permissionStatus:'Granted',attemptId:'attempt-1',attemptStatus:'Submitted',score:0,percentage:0,correctAnswers:0,incorrectAnswers:1,unansweredAnswers:9,submittedAt:exam.createdAt},{studentId:'second',username:'student02',fullName:'Bình',permissionStatus:'Granted',attemptId:null,attemptStatus:null,score:null,percentage:null,correctAnswers:null,incorrectAnswers:null,unansweredAnswers:null,submittedAt:null}]
  mount(examPath+'/results');expect(await screen.findByText('0 / 10')).toBeInTheDocument();expect(screen.getByText('Chưa có')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link',{name:'Xem bài làm'}))
  expect(await screen.findByText('Nội dung snapshot 0')).toBeInTheDocument()
  expect(screen.getAllByText(/Học sinh đã chọn/)).toHaveLength(1)
  expect(screen.getAllByText('Chưa trả lời')).toHaveLength(9)
  expect(screen.getByText(/Học sinh lịch sử/)).toBeInTheDocument()
  expect(calls('get',qapi)).toHaveLength(0)
 })
 it.each([403,404,500])('handles exam API %s without showing editable data',async status=>{
  backend.failure={url:api,status};mount(examPath);await screen.findByRole('heading',{name:status===404?'Không tìm thấy bản ghi':'Không thể tải dữ liệu'})
  expect(screen.queryByLabelText('Tên bài kiểm tra')).not.toBeInTheDocument()
 })
 it.each(['ADMIN','STUDENT'] as const)('blocks %s from management routes',async role=>{
  backend.teacher.base.user.role=role;mount(examPath+'/results')
  await screen.findByRole('heading',{name:'Bạn chưa có quyền truy cập'})
  expect(calls('get',api+'/results')).toHaveLength(0)
 })
})

