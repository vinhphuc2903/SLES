import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { apiClient, authApi } from '@/lib/api/apiClient'
import { AppRouter } from '@/app/router/AppRouter'
import type { CurrentUser } from '@/types/auth'
import type { Subject, Teacher } from '../types/contracts'

export const firstId = '00000000-0000-0000-0000-000000000001'
export const teacher: Teacher = {
  id: firstId, username: 'teacher01', fullName: 'Nguyễn An', role: 'TEACHER', gradeId: null,
  email: 'an@example.test', phone: '0901234567', isActive: true, mustChangePassword: false,
  createdAt: '2026-01-01T00:00:00Z',
}
export const subject: Subject = {
  id: firstId, code: 'MATH', name: 'Toán học', description: 'Môn Toán',
  isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}
export const generatedPassword = 'Only-once-fixture-47!'

export interface RequestRecord { method: string; url: string; params: Record<string, unknown>; body: Record<string, unknown> }

export function createBackend() {
  const state = {
    teachers: [{ ...teacher }],
    subjects: [{ ...subject }],
    user: { id: 'admin-test', username: 'admin', fullName: 'Quản trị thử nghiệm', role: 'ADMIN', gradeId: null, mustChangePassword: false } as CurrentUser,
    signedIn: true,
    failure: null as { url: string; status: number } | null,
    holdStatus: null as Promise<void> | null,
    requests: [] as RequestRecord[],
  }
  const fail = (config: InternalAxiosRequestConfig, status: number, code = 'invalid_request'): never => {
    throw new AxiosError('API failure', 'ERR_BAD_RESPONSE', config, undefined, {
      status, statusText: 'Failure', config, headers: {}, data: { error: { code, message: 'Backend failure.' } },
    })
  }
  const adapter: AxiosAdapter = async (config) => {
    const url = config.url ?? ''
    const method = config.method ?? 'get'
    const params = (config.params ?? {}) as Record<string, unknown>
    const body: Record<string, unknown> = typeof config.data === 'string' ? JSON.parse(config.data) : {}
    state.requests.push({ method, url, params, body })
    const ok = (data: unknown, status = 200) => ({ status, statusText: 'OK', headers: {}, config, data: structuredClone(data) })
    if (state.failure?.url === url) fail(config, state.failure.status)
    if (url === '/api/auth/refresh') {
      if (!state.signedIn) fail(config, 401, 'invalid_refresh_token')
      return ok({ accessToken: 'fixture-access', accessTokenExpiresAt: '2027-01-01T00:00:00Z', user: state.user })
    }
    if (url === '/api/auth/login') {
      if (body.password !== 'fixture-valid-password') fail(config, 401, 'invalid_credentials')
      state.signedIn = true
      return ok({ accessToken: 'fixture-access', accessTokenExpiresAt: '2027-01-01T00:00:00Z', user: state.user })
    }
    if (url === '/api/auth/me') return ok(state.user)
    if (url === '/api/auth/logout') { state.signedIn = false; return ok(null, 204) }
    if (url.startsWith('/api/admin/') && state.user.role !== 'ADMIN') fail(config, 403)
    const isTeacher = url.startsWith('/api/admin/teachers')
    const base = isTeacher ? '/api/admin/teachers' : '/api/admin/subjects'
    if (!url.startsWith(base)) throw new Error('Unexpected API endpoint: ' + url)
    if (url === base && method === 'get') {
      const source = isTeacher ? state.teachers : state.subjects
      const filtered = source.filter((row) => {
        const searchable = 'username' in row ? row.username + ' ' + row.fullName : row.code + ' ' + row.name
        return (params.isActive === undefined || row.isActive === params.isActive) &&
          (!params.search || searchable.includes(String(params.search)))
      })
      const page = Number(params.page ?? 1)
      const pageSize = Number(params.pageSize ?? 20)
      return ok({ items: filtered.slice((page - 1) * pageSize, page * pageSize), totalCount: filtered.length, page, pageSize })
    }
    if (url === base && method === 'post') {
      if (isTeacher) {
        if (state.teachers.some((row) => row.username === body.username)) fail(config, 409, 'duplicate_username')
        const created = { ...teacher, id: '00000000-0000-0000-0000-000000000099', username: String(body.username), fullName: String(body.fullName), email: body.email as string | null, phone: body.phone as string | null, mustChangePassword: true }
        state.teachers.push(created)
        return ok({ user: created, temporaryPassword: generatedPassword })
      }
      if (state.subjects.some((row) => row.code === String(body.code).toUpperCase())) fail(config, 409, 'conflict')
      const created = { ...subject, id: '00000000-0000-0000-0000-000000000099', code: String(body.code).toUpperCase(), name: String(body.name), description: body.description as string | null }
      state.subjects.push(created)
      return ok(created)
    }
    const id = url.slice(base.length + 1).split('/')[0]
    const record = (isTeacher ? state.teachers : state.subjects).find((row) => row.id === id)
    if (!record) return fail(config, 404, 'not_found')
    if (url.endsWith('/status') && method === 'patch') {
      if (state.holdStatus) await state.holdStatus
      record.isActive = Boolean(body.isActive)
      return ok(null, 204)
    }
    if (url.endsWith('/reset-password') && method === 'post' && 'mustChangePassword' in record) {
      record.mustChangePassword = true
      return ok({ temporaryPassword: generatedPassword })
    }
    if (method === 'put') {
      if ('fullName' in record) {
        record.fullName = String(body.fullName); record.email = body.email as string | null; record.phone = body.phone as string | null
      } else {
        record.name = String(body.name); record.description = body.description as string | null
      }
      return ok(record)
    }
    if (method === 'get') return ok(record)
    throw new Error('Unexpected API operation: ' + method + ' ' + url)
  }
  apiClient.defaults.adapter = adapter
  authApi.defaults.adapter = adapter
  return state
}

export function mountAdmin(path: string) {
  window.history.replaceState({}, '', path)
  const client = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity, staleTime: 30_000 },
    mutations: { retry: false, gcTime: 0 },
  } })
  const view = render(<QueryClientProvider client={client}><AppRouter /></QueryClientProvider>)
  return { ...view, client }
}
