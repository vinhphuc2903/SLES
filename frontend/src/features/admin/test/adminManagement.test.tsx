import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { apiClient, authApi, setAccessToken } from '@/lib/api/apiClient'
import { createBackend, firstId, generatedPassword, mountAdmin, subject, teacher } from './adminFixture'

const originalAdapter = apiClient.defaults.adapter
const originalAuthAdapter = authApi.defaults.adapter
let backend: ReturnType<typeof createBackend>
let mounted: ReturnType<typeof mountAdmin> | undefined
beforeEach(() => { backend = createBackend() })
afterEach(() => {
  cleanup()
  mounted?.client.clear()
  mounted = undefined
  apiClient.defaults.adapter = originalAdapter
  authApi.defaults.adapter = originalAuthAdapter
  setAccessToken(null)
})
const mount = (path: string) => { mounted = mountAdmin(path); return mounted }
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const submit = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }))
const calls = (method: string, url: string) => backend.requests.filter((request) => request.method === method && request.url === url)

describe('Admin dashboard and teacher management through real frontend routes', () => {
  it('uses full pagination totals for dashboard counts, including inactive records', async () => {
    backend.teachers = Array.from({ length: 25 }, (_, i) => ({ ...teacher, id: String(i), isActive: i < 20 }))
    backend.subjects.push({ ...subject, id: 'second', code: 'HISTORY', name: 'Lịch sử', isActive: false })
    mount('/admin')
    const teachers = await screen.findByRole('region', { name: 'Giáo viên' })
    expect(within(teachers).getByText('25')).toBeInTheDocument()
    expect(within(teachers).getByText('20')).toBeInTheDocument()
    expect(within(teachers).getByText('5')).toBeInTheDocument()
    const subjects = await screen.findByRole('region', { name: 'Môn học' })
    expect(within(subjects).getByText('2')).toBeInTheDocument()
    expect(calls('get', '/api/admin/teachers')).toHaveLength(3)
    expect(calls('get', '/api/admin/teachers').every((request) => request.params.pageSize === 1)).toBe(true)
  })

  it('renders teacher data, paginates on the server and keeps search/status in the URL', async () => {
    backend.teachers = Array.from({ length: 21 }, (_, i) => ({
      ...teacher, id: String(i), username: 'teacher' + i, fullName: 'Giáo viên ' + i, isActive: i !== 20,
    }))
    mount('/admin/teachers')
    expect(await screen.findByText('Giáo viên 0')).toBeInTheDocument()
    submit('Sau')
    expect(await screen.findByText('Giáo viên 20')).toBeInTheDocument()
    expect(window.location.search).toContain('page=2')
    change('Tìm kiếm', 'Giáo viên 20')
    change('Trạng thái', 'false')
    submit('Tìm kiếm')
    await waitFor(() => expect(calls('get', '/api/admin/teachers').at(-1)?.params).toMatchObject({ page: 1, search: 'Giáo viên 20', isActive: false }))
    expect(window.location.search).toContain('isActive=false')
    expect(await screen.findByText('Giáo viên 20')).toBeInTheDocument()
    expect(screen.queryByText('Giáo viên 0')).not.toBeInTheDocument()
  })

  it('validates creation, creates a teacher and clears the one-time password without caching it', async () => {
    const view = mount('/admin/teachers/new')
    await screen.findByLabelText('Tên đăng nhập')
    submit('Tạo giáo viên')
    expect(await screen.findByText('Vui lòng nhập họ và tên.')).toBeInTheDocument()
    expect(calls('post', '/api/admin/teachers')).toHaveLength(0)
    change('Tên đăng nhập', 'newteacher')
    change('Họ và tên', 'Giáo viên mới')
    submit('Tạo giáo viên')
    expect(await screen.findByDisplayValue(generatedPassword)).toBeInTheDocument()
    expect(JSON.stringify(view.client.getQueryCache().getAll().map((query) => query.state.data))).not.toContain(generatedPassword)
    expect(JSON.stringify(view.client.getMutationCache().getAll().map((mutation) => mutation.state))).not.toContain(generatedPassword)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    submit('Đã lưu an toàn, đóng')
    expect(await screen.findByRole('heading', { name: 'Giáo viên mới' })).toBeInTheDocument()
    expect(screen.queryByDisplayValue(generatedPassword)).not.toBeInTheDocument()
    expect(calls('post', '/api/admin/teachers')[0]?.body).toEqual({ username: 'newteacher', fullName: 'Giáo viên mới', email: null, phone: null })
  })

  it('maps duplicate username to the teacher form', async () => {
    mount('/admin/teachers/new')
    await screen.findByLabelText('Tên đăng nhập')
    change('Tên đăng nhập', teacher.username)
    change('Họ và tên', 'Tên trùng')
    submit('Tạo giáo viên')
    expect(await screen.findAllByText('Tên đăng nhập đã được sử dụng.')).not.toHaveLength(0)
    expect(screen.getByLabelText('Tên đăng nhập')).toHaveAttribute('aria-invalid', 'true')
  })

  it('edits the allowed teacher fields and invalidates stale detail and list data', async () => {
    const view = mount('/admin/teachers/' + firstId)
    await screen.findByDisplayValue(teacher.fullName)
    view.client.setQueryData(['admin', 'teachers', 'list', { page: 1 }], { items: [{ ...teacher }] })
    change('Họ và tên', 'Tên giáo viên đã đổi')
    submit('Lưu thay đổi')
    expect(await screen.findByRole('heading', { name: 'Tên giáo viên đã đổi' })).toBeInTheDocument()
    expect(calls('put', '/api/admin/teachers/' + firstId)[0]?.body).toEqual({ fullName: 'Tên giáo viên đã đổi', email: teacher.email, phone: teacher.phone })
    expect(view.client.getQueryState(['admin', 'teachers', 'list', { page: 1 }])?.isInvalidated).toBe(true)
  })

  it('requires confirmation for status changes and blocks repeated submission while pending', async () => {
    let release!: () => void
    backend.holdStatus = new Promise<void>((resolve) => { release = resolve })
    mount('/admin/teachers')
    await screen.findByText(teacher.fullName)
    submit('Ngừng hoạt động: ' + teacher.fullName)
    const dialog = screen.getByRole('dialog', { name: 'Ngừng hoạt động giáo viên?' })
    expect(within(dialog).getByText(new RegExp(teacher.fullName))).toBeInTheDocument()
    expect(calls('patch', '/api/admin/teachers/' + firstId + '/status')).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ngừng hoạt động' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Ngừng hoạt động' })).toBeDisabled())
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: 'Kích hoạt: ' + teacher.fullName })).toBeInTheDocument()
    expect(calls('patch', '/api/admin/teachers/' + firstId + '/status')).toHaveLength(1)
  })

  it('resets the password only after confirmation and removes the secret on close', async () => {
    const view = mount('/admin/teachers')
    await screen.findByText(teacher.fullName)
    submit('Đặt lại mật khẩu: ' + teacher.fullName)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đặt lại mật khẩu' }))
    expect(await screen.findByDisplayValue(generatedPassword)).toBeInTheDocument()
    expect(JSON.stringify(view.client.getMutationCache().getAll().map((mutation) => mutation.state))).not.toContain(generatedPassword)
    submit('Đã lưu an toàn, đóng')
    expect(screen.queryByDisplayValue(generatedPassword)).not.toBeInTheDocument()
    expect(calls('post', '/api/admin/teachers/' + firstId + '/reset-password')).toHaveLength(1)
  })

  it('shows a friendly API failure and retries successfully', async () => {
    backend.failure = { url: '/api/admin/teachers', status: 500 }
    mount('/admin/teachers')
    expect(await screen.findByText('Máy chủ đang gặp sự cố. Vui lòng thử lại sau.')).toBeInTheDocument()
    backend.failure = null
    submit('Thử lại')
    expect(await screen.findByText(teacher.fullName)).toBeInTheDocument()
  })
})

describe('Admin subject management', () => {
  it('lists inactive subjects and filters using the admin endpoint', async () => {
    backend.subjects.push({ ...subject, id: 'inactive', code: 'HISTORY', name: 'Lịch sử', isActive: false })
    mount('/admin/subjects?isActive=false')
    expect(await screen.findByText('Lịch sử')).toBeInTheDocument()
    expect(screen.queryByText('Toán học')).not.toBeInTheDocument()
    expect(calls('get', '/api/admin/subjects')[0]?.params.isActive).toBe(false)
  })

  it('creates a subject, follows the detail route, and updates name/description only', async () => {
    mount('/admin/subjects/new')
    await screen.findByLabelText('Mã môn học')
    change('Mã môn học', 'chem')
    change('Tên môn học', 'Hóa học')
    submit('Tạo môn học')
    await screen.findByRole('heading', { name: 'Hóa học' })
    expect(screen.getByLabelText('Mã môn học')).toHaveAttribute('readonly')
    change('Tên môn học', 'Hóa học nâng cao')
    submit('Lưu thay đổi')
    expect(await screen.findByRole('heading', { name: 'Hóa học nâng cao' })).toBeInTheDocument()
    const update = backend.requests.find((request) => request.method === 'put')
    expect(update?.body).toEqual({ name: 'Hóa học nâng cao', description: null })
  })

  it('handles duplicate subject code and keeps the form available for correction', async () => {
    mount('/admin/subjects/new')
    await screen.findByLabelText('Mã môn học')
    change('Mã môn học', 'MATH')
    change('Tên môn học', 'Môn trùng')
    submit('Tạo môn học')
    expect(await screen.findByText('Mã môn học đã được sử dụng.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo môn học' })).toBeEnabled()
  })

  it('updates subject status after confirmation and refreshes the list', async () => {
    mount('/admin/subjects')
    await screen.findByText('Toán học')
    submit('Ngừng hoạt động: Toán học')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ngừng hoạt động' }))
    expect(await screen.findByRole('button', { name: 'Kích hoạt: Toán học' })).toBeInTheDocument()
    expect(calls('patch', '/api/admin/subjects/' + firstId + '/status')[0]?.body).toEqual({ isActive: false })
  })

  it('handles an empty subject list', async () => {
    backend.subjects = []
    mount('/admin/subjects')
    expect(await screen.findByText('Không tìm thấy môn học')).toBeInTheDocument()
  })

  it('handles missing subject details', async () => {
    backend.failure = { url: '/api/admin/subjects/' + firstId, status: 404 }
    mount('/admin/subjects/' + firstId)
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy bản ghi' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lưu thay đổi' })).not.toBeInTheDocument()
  })
})

describe('Admin authorization and authentication regression', () => {
  it.each(['TEACHER', 'STUDENT'] as const)('blocks %s before requesting Admin records', async (role) => {
    backend.user.role = role
    mount('/admin/teachers')
    expect(await screen.findByRole('heading', { name: 'Bạn chưa có quyền truy cập' })).toBeInTheDocument()
    expect(calls('get', '/api/admin/teachers')).toHaveLength(0)
  })

  it('keeps login functional for invalid credentials and then a valid admin login', async () => {
    backend.signedIn = false
    mount('/admin/teachers')
    await screen.findByLabelText('Tên đăng nhập')
    change('Tên đăng nhập', 'admin')
    change('Mật khẩu', 'wrong')
    submit('Đăng nhập')
    expect(await screen.findByText('Tên đăng nhập hoặc mật khẩu chưa chính xác.')).toBeInTheDocument()
    change('Mật khẩu', 'fixture-valid-password')
    submit('Đăng nhập')
    expect(await screen.findByRole('heading', { name: 'Quản lý giáo viên' })).toBeInTheDocument()
  })

  it('restores the admin session and clears sensitive query cache after logout', async () => {
    const view = mount('/admin/teachers')
    await screen.findByText(teacher.fullName)
    expect(calls('post', '/api/auth/refresh')).toHaveLength(1)
    view.client.setQueryData(['sensitive-test'], { private: true })
    fireEvent.click(screen.getByRole('button', { name: /Quản trị thử nghiệm/ }))
    submit('Đăng xuất')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đăng xuất' }))
    await screen.findByRole('heading', { name: 'Đăng nhập' })
    expect(view.client.getQueryCache().getAll()).toHaveLength(0)
    expect(screen.queryByText(teacher.fullName)).not.toBeInTheDocument()
  })
})
