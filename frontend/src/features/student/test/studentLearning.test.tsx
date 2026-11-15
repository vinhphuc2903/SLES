import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {act,cleanup,fireEvent,screen,waitFor,within} from '@testing-library/react'
import {apiClient,authApi,setAccessToken} from '@/lib/api/apiClient'
import {mountAdmin,firstId} from '@/features/admin/test/adminFixture'
import {createStudentBackend,makeAttempt,attemptId} from './studentFixture'
const original=apiClient.defaults.adapter,originalAuth=authApi.defaults.adapter
let backend:ReturnType<typeof createStudentBackend>
let mounted:ReturnType<typeof mountAdmin>|undefined
beforeEach(()=>{backend=createStudentBackend()})
afterEach(()=>{cleanup();mounted?.client.clear();mounted=undefined;apiClient.defaults.adapter=original;authApi.defaults.adapter=originalAuth;setAccessToken(null)})
const mount=(path:string)=>{mounted=mountAdmin(path);return mounted}
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}))
const calls=(method:string,url:string)=>backend.base.requests.filter(r=>r.method===method&&r.url===url)
const workspace='/student/practice/'+attemptId,api='/api/student/practice/'+attemptId,chapter='/student/chapters/'+firstId
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r});return {promise,resolve}}
const choose=(label:string)=>fireEvent.click(screen.getByRole('radio',{name:label}))
const ready=()=>screen.findByRole('heading',{name:'Câu 1 / 200'})
const confirmSubmit=()=>fireEvent.click(within(screen.getByRole('dialog',{name:'Xác nhận nộp bài'})).getByRole('button',{name:'Xác nhận nộp'}))

describe('Student dashboard and learning',()=>{
 it('uses pagination totals and recent history without loading question banks',async()=>{
  backend.attempts=Array.from({length:25},(_,i)=>makeAttempt(String(i)))
  mount('/student')
  const section=await screen.findByRole('region',{name:'Tổng quan học tập'})
  expect(within(section).getByText('25')).toBeInTheDocument()
  expect(calls('get','/api/student/practice/history')[0]?.params.pageSize).toBe(5)
  expect(backend.base.requests.some(r=>r.url.includes('/questions'))).toBe(false)
 })
 it('renders a dashboard empty state',async()=>{
  backend.attempts=[];backend.subjects=[];mount('/student')
  expect(await screen.findByText('Chưa có lượt luyện tập. Chọn môn học để bắt đầu.')).toBeInTheDocument()
 })
 it('shows dashboard errors and retries',async()=>{
  backend.failure={url:'/api/student/subjects',status:500};mount('/student')
  await screen.findByRole('heading',{name:'Không thể tải dữ liệu'});backend.failure=null;click('Thử lại')
  expect(await screen.findByRole('region',{name:'Tổng quan học tập'})).toBeInTheDocument()
 })
 it('browses eligible subjects, published chapters and safe read-only Markdown',async()=>{
  backend.chapter.content='# Bài học\n\n<script>alert(1)</script>\n\n[Link](javascript:alert%281%29)\n\n| A | B |\n| - | - |\n| 1 | 2 |'
  mount('/student/subjects');fireEvent.click(await screen.findByRole('link',{name:'Học Toán học'}))
  fireEvent.click(await screen.findByRole('link',{name:'Đọc lý thuyết'}))
  const reader=await screen.findByRole('article',{name:'Nội dung lý thuyết'})
  expect(within(reader).getByRole('heading',{name:'Bài học'})).toBeInTheDocument()
  expect(within(reader).getByRole('table')).toBeInTheDocument()
  expect(reader.querySelector('script')).toBeNull()
  expect(reader.querySelector('a')?.getAttribute('href')).not.toMatch(/^javascript:/)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.getByRole('link',{name:'Luyện tập chương này'})).toHaveAttribute('href',chapter+'/practice')
 })
 it.each([403,404])('handles chapter ownership status %s',async status=>{
  backend.failure={url:'/api/chapters/'+firstId,status};mount(chapter)
  await screen.findByRole('heading',{name:status===404?'Không tìm thấy bản ghi':'Không thể tải dữ liệu'})
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
 })
})

describe('Practice start and restoration',()=>{
 it('starts exactly one attempt on double click and offers existing attempts explicitly',async()=>{
  const hold=deferred();backend.holdStart=hold.promise
  mount(chapter+'/practice');await screen.findByRole('button',{name:'Bắt đầu bài mới'})
  expect(await screen.findByRole('heading',{name:'Bài chưa nộp gần đây'})).toBeInTheDocument()
  click('Bắt đầu bài mới');click('Bắt đầu bài mới')
  await waitFor(()=>expect(calls('post','/api/student/chapters/'+firstId+'/practice')).toHaveLength(1))
  await act(async()=>hold.resolve())
  await ready();expect(window.location.pathname).toContain('new-attempt-')
 })
 it('restores saved options and current question from the URL',async()=>{
  const q=backend.attempts[0]!.questions[1]!;q.selectedOptionId=q.options[2]!.id
  mount(workspace+'?q=2')
  await screen.findByRole('heading',{name:'Câu 2 / 200'})
  expect(screen.getByRole('radio',{name:'A. Nội dung A'})).toBeChecked()
  expect(screen.getByText('Đã lưu 1/200 câu')).toBeInTheDocument()
  expect(calls('post','/api/student/chapters/'+firstId+'/practice')).toHaveLength(0)
 })
 it('redirects submitted attempts to authorized results',async()=>{
  backend.attempts[0]!.isSubmitted=true;mount(workspace)
  expect(await screen.findByRole('heading',{name:'Kết quả luyện tập'})).toBeInTheDocument()
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
 })
})

describe('Practice answers and concurrency',()=>{
 it('renders 200 navigation controls and preserves server question/option order without correctness',async()=>{
  mount(workspace);await ready()
  const nav=screen.getByRole('navigation',{name:'Điều hướng câu hỏi'})
  expect(within(nav).getAllByRole('button')).toHaveLength(200)
  const radios=screen.getAllByRole('radio');expect(radios).toHaveLength(4)
  expect(radios.map(r=>r.closest('label')?.textContent)).toEqual(['D. Nội dung D','B. Nội dung B','A. Nội dung A','C. Nội dung C'])
  expect(screen.queryByText(/Đáp án đúng/)).not.toBeInTheDocument()
  click('Câu tiếp');await screen.findByRole('heading',{name:'Câu 2 / 200'})
  click('Câu trước');await ready()
  fireEvent.click(within(nav).getByRole('button',{name:'Câu 200 — chưa trả lời'}))
  await screen.findByRole('heading',{name:'Câu 200 / 200'})
  expect(backend.base.requests.every(r=>!r.url.startsWith('/api/teacher/'))).toBe(true)
 })
 it('saves actual IDs, updates confirmed progress and restores after remount',async()=>{
  const a=backend.attempts[0]!,q=a.questions[0]!
  mount(workspace);await ready();choose('B. Nội dung B')
  await waitFor(()=>expect(screen.getByText('Đã lưu 1/200 câu')).toBeInTheDocument())
  expect(calls('put',api+'/questions/'+q.id+'/answer')[0]?.body).toEqual({selectedOptionId:q.options[1]!.id})
  mounted!.unmount();mounted!.client.clear();mount(workspace);await ready()
  expect(screen.getByRole('radio',{name:'B. Nội dung B'})).toBeChecked()
  expect(calls('get',api)).toHaveLength(2)
 })
 it('serializes rapid changes and never replaces the latest selection with an earlier response',async()=>{
  const hold=deferred();backend.holdSave=hold.promise
  const q=backend.attempts[0]!.questions[0]!,url=api+'/questions/'+q.id+'/answer'
  mount(workspace);await ready();choose('D. Nội dung D')
  await waitFor(()=>expect(calls('put',url)).toHaveLength(1))
  choose('B. Nội dung B');choose('C. Nội dung C')
  expect(calls('put',url)).toHaveLength(1)
  expect(screen.getByRole('radio',{name:'C. Nội dung C'})).toBeChecked()
  expect(screen.getByText('Đã lưu 0/200 câu')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Nộp bài'})).toBeDisabled()
  await act(async()=>hold.resolve())
  await waitFor(()=>expect(calls('put',url)).toHaveLength(2))
  await waitFor(()=>expect(screen.getByRole('button',{name:'Nộp bài'})).toBeEnabled())
  expect(q.selectedOptionId).toBe(q.options[3]!.id)
  expect(screen.getByRole('radio',{name:'C. Nội dung C'})).toBeChecked()
 })
 it('keeps pending saves when navigating between questions',async()=>{
  const hold=deferred();backend.holdSave=hold.promise
  mount(workspace);await ready();choose('D. Nội dung D')
  click('Câu tiếp');await screen.findByRole('heading',{name:'Câu 2 / 200'})
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await act(async()=>hold.resolve())
  await waitFor(()=>expect(screen.getByText('Đã lưu 1/200 câu')).toBeInTheDocument())
  click('Câu trước');expect(screen.getByRole('radio',{name:'D. Nội dung D'})).toBeChecked()
 })
 it('retains failed selections, blocks submit and allows retry',async()=>{
  backend.failSave=true;mount(workspace);await ready();choose('D. Nội dung D')
  await screen.findByRole('button',{name:'Thử lưu lại'})
  expect(screen.getByRole('radio',{name:'D. Nội dung D'})).toBeChecked()
  expect(screen.getByText('Đã lưu 0/200 câu')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Nộp bài'})).toBeDisabled()
  backend.failSave=false;click('Thử lưu lại')
  await waitFor(()=>expect(screen.getByText('Đã lưu 1/200 câu')).toBeInTheDocument())
  expect(screen.getByRole('button',{name:'Nộp bài'})).toBeEnabled()
 })
 it('warns before leaving a failed save or reloading and supports staying',async()=>{
  backend.failSave=true;mount(workspace);await ready();choose('D. Nội dung D');await screen.findByRole('button',{name:'Thử lưu lại'})
  const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true)
  fireEvent.click(screen.getAllByRole('link',{name:'Lịch sử luyện tập'}).at(-1)!)
  await screen.findByRole('dialog',{name:'Rời bài luyện tập?'});click('Hủy')
  expect(screen.getByRole('radio',{name:'D. Nội dung D'})).toBeChecked()
 })
 it('clears an answer with the backend null contract',async()=>{
  const q=backend.attempts[0]!.questions[0]!;q.selectedOptionId=q.options[0]!.id
  mount(workspace);await ready();click('Bỏ chọn đáp án')
  await waitFor(()=>expect(screen.getByText('Đã lưu 0/200 câu')).toBeInTheDocument())
  expect(calls('put',api+'/questions/'+q.id+'/answer')[0]?.body).toEqual({selectedOptionId:null})
 })
})

describe('Practice submission and review',()=>{
 it('confirms unanswered count, prevents duplicate submits and shows official server scores',async()=>{
  const hold=deferred();backend.holdSubmit=hold.promise
  mount(workspace);await ready();click('Nộp bài')
  expect(screen.getByRole('dialog')).toHaveTextContent('Chưa trả lời: 200')
  expect(calls('post',api+'/submit')).toHaveLength(0)
  confirmSubmit();confirmSubmit()
  await waitFor(()=>expect(calls('post',api+'/submit')).toHaveLength(1))
  await act(async()=>hold.resolve())
  await screen.findByRole('heading',{name:'Kết quả luyện tập'})
  expect(screen.getByText('0.05 / 10 · 0.5%')).toBeInTheDocument()
  expect(screen.getByRole('link',{name:'Làm lại'})).toHaveAttribute('href',chapter+'/practice')
 })
 it('reconciles a lost successful submit response without posting again',async()=>{
  backend.loseSubmit=true;mount(workspace);await ready();click('Nộp bài');confirmSubmit()
  await screen.findByRole('heading',{name:'Kết quả luyện tập'})
  expect(calls('post',api+'/submit')).toHaveLength(1)
  expect(calls('get',api).length).toBeGreaterThanOrEqual(2)
 })
 it('blocks submit retry until an ambiguous status can be checked',async()=>{
  backend.loseSubmit=true;backend.commitSubmit=false
  mount(workspace);await ready();backend.failStatus=true;click('Nộp bài');confirmSubmit()
  await screen.findByRole('button',{name:'Kiểm tra trạng thái nộp bài'})
  await waitFor(()=>expect(screen.getByRole('button',{name:'Kiểm tra trạng thái nộp bài'})).toBeEnabled())
  expect(screen.getByRole('button',{name:'Nộp bài'})).toBeDisabled()
  expect(calls('post',api+'/submit')).toHaveLength(1)
  backend.failStatus=false;click('Kiểm tra trạng thái nộp bài')
  await waitFor(()=>expect(screen.getByRole('button',{name:'Nộp bài'})).toBeEnabled())
  backend.loseSubmit=false;backend.commitSubmit=true;click('Nộp bài');confirmSubmit()
  await screen.findByRole('heading',{name:'Kết quả luyện tập'})
 })
 it('handles another tab having submitted already',async()=>{
  mount(workspace);await ready();backend.attempts[0]!.isSubmitted=true;click('Nộp bài');confirmSubmit()
  await screen.findByRole('heading',{name:'Kết quả luyện tập'})
  expect(calls('post',api+'/submit')).toHaveLength(1)
 })
 it('does not load correctness before submission',async()=>{
  mount(workspace+'/result')
  expect(await screen.findByText('Chưa nộp bài nên chưa thể xem đáp án và kết quả.')).toBeInTheDocument()
  expect(screen.queryByRole('region',{name:'Xem lại đáp án'})).not.toBeInTheDocument()
  expect(calls('get','/api/teacher/questions')).toHaveLength(0)
 })
 it('reviews selected/correct/incorrect and unanswered answers using authorized result order',async()=>{
  const a=backend.attempts[0]!;a.isSubmitted=true;a.questions[0]!.selectedOptionId=a.questions[0]!.options[1]!.id;a.questions[1]!.selectedOptionId=a.questions[1]!.options[0]!.id
  mount(workspace+'/result');await screen.findByRole('heading',{name:'Kết quả luyện tập'})
  expect(screen.getByText('Trả lời đúng')).toBeInTheDocument()
  expect(screen.getByText('Trả lời sai')).toBeInTheDocument()
  expect(screen.getAllByText('Chưa trả lời')).toHaveLength(18)
  expect(screen.getAllByText(/Đáp án đúng/)).toHaveLength(20)
  expect(screen.getAllByText(/Bạn đã chọn/)).toHaveLength(2)
  click('Sau');expect(screen.getByRole('heading',{name:'Câu 21'})).toBeInTheDocument()
 })
})

describe('History and authorization',()=>{
 it('paginates history and resumes unfinished attempts',async()=>{
  backend.attempts=Array.from({length:21},(_,i)=>makeAttempt(String(i)))
  mount('/student/practice/history');await screen.findByText('Trang 1/2 · 21 kết quả');click('Sau')
  await screen.findByText('Trang 2/2 · 21 kết quả')
  fireEvent.click(screen.getByRole('link',{name:'Tiếp tục'}));await ready()
  expect(window.location.pathname).toBe('/student/practice/20')
 })
 it('renders empty history and a completed attempt link',async()=>{
  backend.attempts=[];mount('/student/practice/history')
  expect(await screen.findByText('Chưa có dữ liệu')).toBeInTheDocument()
 })
 it.each([403,404])('does not render another student attempt on %s',async status=>{
  backend.failure={url:api,status};mount(workspace)
  await screen.findByRole('heading',{name:status===404?'Không tìm thấy bản ghi':'Không thể tải dữ liệu'})
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
 })
 it.each(['ADMIN','TEACHER'] as const)('blocks %s student routes before fetching data',async role=>{
  backend.base.user.role=role;mount(workspace)
  await screen.findByRole('heading',{name:'Bạn chưa có quyền truy cập'})
  expect(calls('get',api)).toHaveLength(0)
 })
 it('redirects unauthenticated users',async()=>{
  backend.base.signedIn=false;mount('/student/subjects');await screen.findByLabelText('Tên đăng nhập')
  expect(window.location.pathname).toBe('/login')
 })
 it('preserves forced password change',async()=>{
  backend.base.user.mustChangePassword=true;mount(workspace);await screen.findByLabelText('Mật khẩu hiện tại')
  expect(calls('get',api)).toHaveLength(0)
 })
})

