import { apiClient } from '@/lib/api/apiClient'
import type { Page, Student, StudentInput, Grade, Subject, Chapter, ChapterInput, ChapterDetail, Filters } from '../types/contracts'
const students = '/api/teacher/students'
const chapters = '/api/teacher/chapters'
export const studentApi = {
  list: async (params: Filters, signal?: AbortSignal) => (await apiClient.get<Page<Student>>(students, { params, signal })).data,
  get: async (id: string, signal?: AbortSignal) => (await apiClient.get<Student>(students + '/' + id, { signal })).data,
  create: async (body: StudentInput) => (await apiClient.post<{user: Student; temporaryPassword: string}>(students, body)).data,
  update: async (id: string, body: Omit<StudentInput, 'username'>) => (await apiClient.put<Student>(students + '/' + id, body)).data,
  status: async (id: string, isActive: boolean) => { await apiClient.patch(students + '/' + id + '/status', { isActive }) },
  reset: async (id: string) => (await apiClient.post<{temporaryPassword: string}>(students + '/' + id + '/reset-password')).data,
}
export const chapterApi = {
  list: async (params: Filters, signal?: AbortSignal) => (await apiClient.get<Page<Chapter>>('/api/chapters', { params, signal })).data,
  get: async (id: string, signal?: AbortSignal) => (await apiClient.get<ChapterDetail>('/api/chapters/' + id, { signal })).data,
  create: async (body: ChapterInput) => (await apiClient.post<Chapter>(chapters, body)).data,
  content: async (id: string, content: string) => (await apiClient.put<ChapterDetail>(chapters + '/' + id + '/content', { content })).data,
  action: async (id: string, action: 'publish' | 'archive' | 'delete') => {
    if (action === 'delete') await apiClient.delete(chapters + '/' + id)
    else await apiClient.post(chapters + '/' + id + '/' + action)
  },
}
export const lookupApi = {
  grades: async (signal?: AbortSignal) => (await apiClient.get<Grade[]>('/api/teacher/grades', { signal })).data,
  subjects: async (signal?: AbortSignal) => {
    const items: Subject[] = []
    for (let page = 1; ; page++) {
      const result = (await apiClient.get<Page<Subject>>('/api/subjects', { params: { page, pageSize: 100 }, signal })).data
      items.push(...result.items)
      if (items.length >= result.totalCount || result.items.length === 0) return items
    }
  },
}

