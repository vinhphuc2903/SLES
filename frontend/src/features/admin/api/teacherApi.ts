import { apiClient } from '@/lib/api/apiClient'
import type { CreatedTeacher, CreateTeacher, ListParams, Page, Teacher, TeacherProfile } from '../types/contracts'

const path = '/api/admin/teachers'
export const teacherApi = {
  list: async (params: ListParams, signal?: AbortSignal) =>
    (await apiClient.get<Page<Teacher>>(path, { params, signal })).data,
  get: async (id: string, signal?: AbortSignal) =>
    (await apiClient.get<Teacher>(path + '/' + id, { signal })).data,
  create: async (input: CreateTeacher) =>
    (await apiClient.post<CreatedTeacher>(path, input)).data,
  update: async (id: string, input: TeacherProfile) =>
    (await apiClient.put<Teacher>(path + '/' + id, input)).data,
  setStatus: async (id: string, isActive: boolean) => {
    await apiClient.patch(path + '/' + id + '/status', { isActive })
  },
  resetPassword: async (id: string) =>
    (await apiClient.post<{ temporaryPassword: string }>(path + '/' + id + '/reset-password')).data,
}
