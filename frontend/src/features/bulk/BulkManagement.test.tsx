import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '@/features/auth/hooks/authTypes'
import type { CurrentUser } from '@/types/auth'
import { DataTable } from '@/components/ui/DataTable'
import { apiClient } from '@/lib/api/apiClient'
import { BulkManagement, type BulkResult } from './BulkManagement'

const first = '81000000-0000-0000-0000-000000000001', second = '81000000-0000-0000-0000-000000000002'
const initial = [{ id: first, name: 'Bản nháp một', active: true }, { id: second, name: 'Bản nháp hai', active: true }, { id: '81000000-0000-0000-0000-000000000003', name: 'Đã xuất bản', active: false }]
const teacher: CurrentUser = { id: '82000000-0000-0000-0000-000000000001', username: 'teacher', fullName: 'Teacher', role: 'TEACHER', gradeId: null, mustChangePassword: false }
const clients: QueryClient[] = []
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.restoreAllMocks() })
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client)
  const view = (rows = initial, scope = 'page=1', user = teacher) => <QueryClientProvider client={client}>
    <AuthContext.Provider value={{ user, status: 'authenticated', login: vi.fn(), logout: vi.fn(), changePassword: vi.fn(), setUser: vi.fn() }}>
      <BulkManagement rows={rows} scope={scope} endpoint="/api/teacher/questions/bulk-delete" action="Xóa đã chọn" consequence="Giữ lịch sử." eligible={row => row.active} label={row => row.name}>
        {selection => <DataTable rows={rows} getRowKey={row => row.id} columns={[...(selection ? [selection] : []), { key: 'name', header: 'Tên', render: row => row.name }]} />}
      </BulkManagement>
    </AuthContext.Provider>
  </QueryClientProvider>
  const rendered = render(view())
  return { client, update: (rows = initial, scope = 'page=1', user = teacher) => rendered.rerender(view(rows, scope, user)) }
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const select = (name: string) => fireEvent.click(screen.getByRole('checkbox', { name }))
const all = 'Chọn tất cả trên trang để xóa đã chọn'
function response(ids: string[]): BulkResult { return { requestedCount: ids.length, successCount: ids.length, failedCount: 0, results: ids.map(id => ({ id, success: true })) } }

describe('Shared bulk management UX', () => {
  it('selects eligible current-page rows, shows indeterminate and clears selection', () => {
    mount(); expect(screen.getByRole('checkbox', { name: 'Chọn xử lý: Đã xuất bản' })).toBeDisabled()
    select('Chọn xử lý: Bản nháp một')
    expect(screen.getByRole('checkbox', { name: all })).toBePartiallyChecked()
    select(all); expect(screen.getByText('Đã chọn: 2 (chỉ trang hiện tại)')).toBeVisible()
    expect(screen.getByRole('checkbox', { name: all })).toBeChecked()
    click('Bỏ chọn'); expect(screen.getByRole('button', { name: 'Xóa đã chọn' })).toBeDisabled()
    select(all); select(all); expect(screen.getByText('Đã chọn: 0 (chỉ trang hiện tại)')).toBeVisible()
  })
  it('clears stale selection and confirmation on filter/page/data or ownership changes', () => {
    const mounted = mount(); select(all); click('Xóa đã chọn'); expect(screen.getByRole('dialog')).toHaveTextContent('2 bản ghi')
    mounted.update(initial, 'page=2'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Đã chọn: 0 (chỉ trang hiện tại)')).toBeVisible()
    mounted.update(initial, 'page=1'); expect(screen.getByRole('checkbox', { name: all })).not.toBeChecked()
    select(all); mounted.update(initial.map(row => ({ ...row, active: false })))
    expect(screen.getByText('Đã chọn: 0 (chỉ trang hiện tại)')).toBeVisible()
    mounted.update(); select(all); mounted.update(initial, 'page=1', { ...teacher, id: crypto.randomUUID() })
    expect(screen.getByText('Đã chọn: 0 (chỉ trang hiện tại)')).toBeVisible()
  })
  it('requires confirmation and allows cancel without sending a request', () => {
    const post = vi.spyOn(apiClient, 'post'); mount(); select(all); click('Xóa đã chọn')
    expect(screen.getByRole('dialog')).toHaveTextContent('Giữ lịch sử.'); click('Hủy')
    expect(post).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('sends one bulk request, invalidates management queries and shows partial failures', async () => {
    const value: BulkResult = { requestedCount: 2, successCount: 1, failedCount: 1, results: [{ id: first, success: true }, { id: second, success: false, code: 'has_dependencies', message: 'Có lịch sử học tập' }] }
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: value })
    const { client } = mount(), invalidate = vi.spyOn(client, 'invalidateQueries')
    select(all); click('Xóa đã chọn'); click('Xác nhận thao tác')
    expect(await screen.findByText('Thành công: 1 · Thất bại: 1')).toBeVisible()
    expect(screen.getByText(/Bản nháp hai .*Có lịch sử học tập/)).toBeVisible()
    expect(post).toHaveBeenCalledWith('/api/teacher/questions/bulk-delete', { ids: [first, second] })
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Đã chọn: 0 (chỉ trang hiện tại)')).toBeVisible()
  })
  it('reports full success and preserves the report after dataset refresh', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: response([first, second]) })
    const mounted = mount(); select(all); click('Xóa đã chọn'); click('Xác nhận thao tác')
    await screen.findByText('Thành công: 2 · Thất bại: 0'); mounted.update([], 'page=1')
    expect(screen.getByText('Thành công: 2 · Thất bại: 0')).toBeVisible()
  })
  it('reports HTTP failure and retains selection for explicit retry', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('network'))
    mount(); select(all); click('Xóa đã chọn'); click('Xác nhận thao tác')
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể kết nối')
    expect(screen.getByText('Đã chọn: 2 (chỉ trang hiện tại)')).toBeVisible()
  })
  it('disables selection/confirmation and prevents repeated submits while pending', async () => {
    let resolve!: (value: { data: BulkResult }) => void
    const post = vi.spyOn(apiClient, 'post').mockImplementation(() => new Promise(done => { resolve = done }))
    mount(); select(all); click('Xóa đã chọn'); click('Xác nhận thao tác'); click('Xác nhận thao tác')
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('checkbox', { name: all })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled()
    resolve({ data: response([first, second]) }); await screen.findByText('Thành công: 2 · Thất bại: 0')
  })
  it.each(['ADMIN', 'STUDENT'] as const)('does not expose teacher actions to %s', role => {
    const mounted = mount(); mounted.update(initial, 'page=1', { ...teacher, role })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Xóa đã chọn' })).not.toBeInTheDocument()
  })
})
