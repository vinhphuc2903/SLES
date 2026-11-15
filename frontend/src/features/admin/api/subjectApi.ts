import { apiClient } from '@/lib/api/apiClient'
import type { CreateSubject, ListParams, Page, Subject, SubjectProfile } from '../types/contracts'

const path = '/api/admin/subjects'
export const subjectApi = {
  list: async (params: ListParams, signal?: AbortSignal) =>
    (await apiClient.get<Page<Subject>>(path, { params, signal })).data,
  get: async (id: string, signal?: AbortSignal) =>
    (await apiClient.get<Subject>(path + '/' + id, { signal })).data,
  create: async (input: CreateSubject) =>
    (await apiClient.post<Subject>(path, input)).data,
  update: async (id: string, input: SubjectProfile) =>
    (await apiClient.put<Subject>(path + '/' + id, input)).data,
  setStatus: async (id: string, isActive: boolean) => {
    await apiClient.patch(path + '/' + id + '/status', { isActive })
  },
}
