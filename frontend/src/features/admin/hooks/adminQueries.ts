import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { teacherApi } from '../api/teacherApi'
import { subjectApi } from '../api/subjectApi'
import type { ListParams } from '../types/contracts'
import { adminError } from '../utils/adminErrors'

export const adminKeys = {
  teachers: ['admin', 'teachers'] as const,
  subjects: ['admin', 'subjects'] as const,
}

export const teacherListOptions = (params: ListParams) => ({
  queryKey: [...adminKeys.teachers, 'list', params],
  queryFn: ({ signal }: { signal: AbortSignal }) => teacherApi.list(params, signal),
})
export const subjectListOptions = (params: ListParams) => ({
  queryKey: [...adminKeys.subjects, 'list', params],
  queryFn: ({ signal }: { signal: AbortSignal }) => subjectApi.list(params, signal),
})
export const useTeachers = (params: ListParams) => useQuery(teacherListOptions(params))
export const useSubjects = (params: ListParams) => useQuery(subjectListOptions(params))
export const useTeacher = (id: string) => useQuery({
  queryKey: [...adminKeys.teachers, 'detail', id],
  queryFn: ({ signal }) => teacherApi.get(id, signal),
})
export const useSubject = (id: string) => useQuery({
  queryKey: [...adminKeys.subjects, 'detail', id],
  queryFn: ({ signal }) => subjectApi.get(id, signal),
})

// Secret-bearing responses must be stripped inside mutationFn, before TanStack stores data.
export function useAdminMutation<Data, Variables>(
  resource: keyof typeof adminKeys,
  mutationFn: (variables: Variables) => Promise<Data>,
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (variables: Variables) => {
      try { return await mutationFn(variables) }
      catch (error) { throw adminError(error) }
    },
    retry: false,
    gcTime: 0,
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys[resource] }),
  })
}
