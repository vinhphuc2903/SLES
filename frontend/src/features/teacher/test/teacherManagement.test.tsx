import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { apiClient, authApi, setAccessToken } from '@/lib/api/apiClient'
import { mountAdmin, firstId, generatedPassword } from '@/features/admin/test/adminFixture'
import { createTeacherBackend, student, detail } from './teacherFixture'
const originalAdapter=apiClient.defaults.adapter, originalAuth=authApi.defaults.adapter
let backend: ReturnType<typeof createTeacherBackend>
let mounted: ReturnType<typeof mountAdmin> | undefined
beforeEach(() => {backend=createTeacherBackend()})
afterEach(() => {cleanup();mounted?.client.clear();mounted=undefined;apiClient.defaults.adapter=originalAdapter;authApi.defaults.adapter=originalAuth;setAccessToken(null)})
const mount=(path:string) => {mounted=mountAdmin(path);return mounted}
const change=(label:string,value:string) => fireEvent.change(screen.getByLabelText(label),{target:{value}})
const click=(name:string) => fireEvent.click(screen.getByRole('button',{name}))
const calls=(method:string,url:string) => backend.base.requests.filter(r => r.method === method && r.url === url)
const chapterPath='/teacher/chapters/' + firstId
const studentPath='/teacher/students/' + firstId
const chapterApi='/api/teacher/chapters/' + firstId

describe('Teacher students and dashboard',() => {
  it('uses teacher-scoped pagination totals for all dashboard metrics',async () => {
    backend.students=Array.from({length:25},(_,i) => ({...student,id:String(i),isActive:i<20}))
    backend.chapters.push({...structuredClone(detail),chapter:{...detail.chapter,id:'published',status:'Published'}})
    mount('/teacher')
    const section=await screen.findByRole('region',{name:'Thống kê học sinh'})
    expect(within(section).getByText('25')).toBeInTheDocument()
    expect(within(section).getByText('20')).toBeInTheDocument()
    expect(within(section).getByText('5')).toBeInTheDocument()
    expect(await screen.findByRole('region',{name:'Thống kê chương'})).toHaveTextContent('2')
    expect(backend.base.requests.every(r => !('teacherId' in r.params))).toBe(true)
  })
  it('paginates and filters students using URL and server query',async () => {
    backend.students=Array.from({length:21},(_,i) => ({...student,id:String(i),username:'student'+i,fullName:'Học sinh '+i,isActive:i<20}))
    mount('/teacher/students')
    await screen.findByText('student0')
    click('Sau')
    expect(await screen.findByText('student20')).toBeInTheDocument()
    change('Tìm kiếm','student20');change('Lọc trạng thái','false');change('Lọc khối lớp',firstId);click('Áp dụng')
    await waitFor(() => expect(calls('get','/api/teacher/students').at(-1)?.params).toMatchObject({page:1,search:'student20',isActive:false,gradeId:firstId}))
    expect(window.location.search).toContain('gradeId=')
  })
  it('validates and creates a student without caching the temporary password or choosing ownership',async () => {
    const {client}=mount('/teacher/students/new')
    await screen.findByLabelText('Tên đăng nhập')
    click('Tạo học sinh')
    expect(await screen.findByText('Vui lòng nhập họ và tên.')).toBeInTheDocument()
    expect(calls('post','/api/teacher/students')).toHaveLength(0)
    change('Tên đăng nhập','newstudent');change('Họ và tên','Học sinh mới');change('Khối lớp',firstId)
    click('Tạo học sinh')
    expect(await screen.findByDisplayValue(generatedPassword)).toBeInTheDocument()
    expect(calls('post','/api/teacher/students')[0]?.body).toEqual({username:'newstudent',fullName:'Học sinh mới',gradeId:firstId,email:null,phone:null})
    expect(JSON.stringify(client.getMutationCache().getAll().map(m => m.state.data))).not.toContain(generatedPassword)
    expect(JSON.stringify(client.getQueryCache().getAll().map(q => q.state.data))).not.toContain(generatedPassword)
    expect(JSON.stringify(localStorage)).not.toContain(generatedPassword)
    expect(JSON.stringify(sessionStorage)).not.toContain(generatedPassword)
    click('Đã lưu an toàn, đóng')
    await screen.findByDisplayValue('newstudent')
    expect(screen.queryByDisplayValue(generatedPassword)).not.toBeInTheDocument()
  })
  it('updates only permitted student fields',async () => {
    mount(studentPath)
    await screen.findByDisplayValue(student.fullName)
    change('Họ và tên','Tên đã sửa');click('Lưu thay đổi')
    await waitFor(() => expect(calls('put','/api/teacher/students/'+firstId)[0]?.body).toEqual({fullName:'Tên đã sửa',email:student.email,phone:student.phone,gradeId:firstId}))
    expect(await screen.findByRole('heading',{name:'Tên đã sửa'})).toBeInTheDocument()
  })
  it('confirms student status before mutation and refreshes the detail',async () => {
    mount(studentPath);await screen.findByDisplayValue(student.fullName)
    click('Ngừng hoạt động')
    expect(calls('patch','/api/teacher/students/'+firstId+'/status')).toHaveLength(0)
    const dialog=screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(student.fullName)
    fireEvent.click(within(dialog).getByRole('button',{name:'Ngừng hoạt động'}))
    await screen.findByRole('button',{name:'Kích hoạt'})
    expect(calls('patch','/api/teacher/students/'+firstId+'/status')).toHaveLength(1)
  })
  it('resets a student password once and clears the secret on close',async () => {
    const {client}=mount(studentPath);await screen.findByDisplayValue(student.fullName)
    click('Đặt lại mật khẩu')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Đặt lại mật khẩu'}))
    expect(await screen.findByDisplayValue(generatedPassword)).toBeInTheDocument()
    expect(JSON.stringify(client.getMutationCache().getAll().map(m => m.state.data))).not.toContain(generatedPassword)
    click('Đã lưu an toàn, đóng')
    expect(screen.queryByDisplayValue(generatedPassword)).not.toBeInTheDocument()
  })
  it.each([403,404])('handles student API status %s',async status => {
    backend.failure={url:'/api/teacher/students/'+firstId,status}
    mount(studentPath)
    expect(await screen.findByRole('heading',{name:status===404?'Không tìm thấy bản ghi':'Không thể tải dữ liệu'})).toBeInTheDocument()
    expect(screen.queryByLabelText('Họ và tên')).not.toBeInTheDocument()
  })
})

describe('Teacher chapters',() => {
  it('loads chapters, actual status and server filters',async () => {
    mount('/teacher/chapters');await screen.findByText('Đại số')
    expect(within(screen.getByRole('table')).getByText('Bản nháp')).toBeInTheDocument()
    change('Lọc trạng thái','Archived');click('Áp dụng')
    expect(await screen.findByText('Chưa có dữ liệu')).toBeInTheDocument()
    expect(calls('get','/api/chapters').at(-1)?.params.status).toBe('Archived')
  })
  it('creates a draft with authoritative lookups and no teacher ID',async () => {
    mount('/teacher/chapters/new');await screen.findByLabelText('Tên chương')
    change('Tên chương','Hình học');change('Khối lớp',firstId);change('Môn học',firstId);click('Tạo chương học')
    expect(await screen.findByRole('heading',{name:'Hình học'})).toBeInTheDocument()
    expect(calls('post','/api/teacher/chapters')[0]?.body).toEqual({name:'Hình học',description:null,gradeId:firstId,subjectId:firstId,displayOrder:1})
  })
  it('shows detail and the actual publication validation failure for 199 questions',async () => {
    mount(chapterPath);await screen.findByRole('heading',{name:'Đại số'})
    expect(screen.getByText(/Phiên bản 1/)).toBeInTheDocument()
    click('Xuất bản')
    expect(calls('post',chapterApi+'/publish')).toHaveLength(0)
    expect(screen.getByRole('dialog')).toHaveTextContent('200')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Xuất bản'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('199')
    expect(screen.getByRole('alert')).toHaveTextContent('200')
    expect(screen.getByText('Bản nháp')).toBeInTheDocument()
  })
  it('publishes only after successful backend validation and refreshes status',async () => {
    backend.publishedQuestions=200
    mount(chapterPath);await screen.findByRole('heading',{name:'Đại số'});click('Xuất bản')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Xuất bản'}))
    expect(await screen.findByText('Đã xuất bản')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Xuất bản'})).not.toBeInTheDocument()
  })
  it('archives and refreshes the chapter',async () => {
    mount(chapterPath);await screen.findByRole('heading',{name:'Đại số'});click('Lưu trữ')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Lưu trữ'}))
    expect(await screen.findByText('Đã lưu trữ')).toBeInTheDocument()
  })
  it('confirms soft deletion and returns to the empty list',async () => {
    mount(chapterPath);await screen.findByRole('heading',{name:'Đại số'});click('Xóa chương')
    expect(screen.getByRole('dialog')).toHaveTextContent('xóa mềm')
    expect(calls('delete',chapterApi)).toHaveLength(0)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Xóa chương'}))
    expect(await screen.findByText('Chưa có dữ liệu')).toBeInTheDocument()
  })
  it('handles backend chapter failure and retries',async () => {
    backend.failure={url:'/api/chapters',status:500}
    mount('/teacher/chapters');await screen.findByRole('heading',{name:'Không thể tải dữ liệu'})
    backend.failure=null;click('Thử lại')
    expect(await screen.findByText('Đại số')).toBeInTheDocument()
  })
})

describe('Theory editor and navigation',() => {
  it('renders Markdown and GFM without raw HTML or unsafe links',async () => {
    backend.chapters[0]!.content='# Tiêu đề\n\n**Đậm**\n\n<script>alert(1)</script>\n\n[Nguy hiểm](javascript:alert%281%29)\n\n| A | B |\n| - | - |\n| 1 | 2 |'
    mount(chapterPath+'/content');await screen.findByLabelText('Nội dung Markdown');click('Xem trước')
    const preview=screen.getByRole('article',{name:'Xem trước Markdown'})
    expect(within(preview).getByRole('heading',{name:'Tiêu đề'})).toBeInTheDocument()
    expect(within(preview).getByRole('table')).toBeInTheDocument()
    expect(preview.querySelector('script')).toBeNull()
    expect(preview.querySelector('a')?.getAttribute('href')).not.toMatch(/^javascript:/)
  })
  it('saves content and updates version from backend; unchanged save does not increment',async () => {
    mount(chapterPath+'/content');await screen.findByLabelText('Nội dung Markdown')
    change('Nội dung Markdown','# Mới');click('Lưu nội dung')
    expect(await screen.findByText('Markdown · Phiên bản 2')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu')
    click('Lưu nội dung')
    await waitFor(() => expect(calls('put',chapterApi+'/content')).toHaveLength(2))
    expect(screen.getByText('Markdown · Phiên bản 2')).toBeInTheDocument()
  })
  it('preserves unsaved content after server validation failure',async () => {
    backend.failure={url:chapterApi+'/content',status:400}
    mount(chapterPath+'/content');await screen.findByLabelText('Nội dung Markdown')
    change('Nội dung Markdown','Chưa lưu');click('Lưu nội dung')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Có thay đổi chưa lưu')
    expect(screen.getByLabelText('Nội dung Markdown')).toHaveValue('Chưa lưu')
  })
  it('blocks oversized content before sending a request',async () => {
    mount(chapterPath+'/content');await screen.findByLabelText('Nội dung Markdown')
    change('Nội dung Markdown','x'.repeat(200001));click('Lưu nội dung')
    expect(await screen.findByRole('alert')).toHaveTextContent('200.000')
    expect(calls('put',chapterApi+'/content')).toHaveLength(0)
  })
  it('warns on unload and navigation; supports stay and explicit discard',async () => {
    mount(chapterPath+'/content');await screen.findByLabelText('Nội dung Markdown')
    change('Nội dung Markdown','Chưa lưu')
    const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByRole('link',{name:'Về chương học'}))
    expect(await screen.findByRole('dialog',{name:'Rời trang khi chưa lưu?'})).toBeInTheDocument()
    click('Hủy')
    expect(screen.getByLabelText('Nội dung Markdown')).toHaveValue('Chưa lưu')
    fireEvent.click(screen.getByRole('link',{name:'Về chương học'}));click('Bỏ thay đổi và rời trang')
    expect(await screen.findByRole('heading',{name:'Đại số'})).toBeInTheDocument()
  })
  it.each(['Published','Archived'] as const)('shows %s content as read-only',async status => {
    backend.chapters[0]!.chapter.status=status
    mount(chapterPath+'/content')
    expect(await screen.findByRole('article',{name:'Xem trước Markdown'})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Lưu nội dung'})).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nội dung Markdown')).not.toBeInTheDocument()
  })
})

describe('Teacher authorization',() => {
  it.each(['ADMIN','STUDENT'] as const)('blocks %s before requesting teacher data',async role => {
    backend.base.user.role=role
    mount('/teacher/students')
    expect(await screen.findByRole('heading',{name:'Bạn chưa có quyền truy cập'})).toBeInTheDocument()
    expect(calls('get','/api/teacher/students')).toHaveLength(0)
  })
  it('redirects unauthenticated users to login',async () => {
    backend.base.signedIn=false;mount('/teacher/chapters')
    expect(await screen.findByLabelText('Tên đăng nhập')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    expect(calls('get','/api/chapters')).toHaveLength(0)
  })
  it('preserves forced password change',async () => {
    backend.base.user.mustChangePassword=true;mount('/teacher')
    expect(await screen.findByLabelText('Mật khẩu hiện tại')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/change-password')
    expect(calls('get','/api/teacher/students')).toHaveLength(0)
  })
})

