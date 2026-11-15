import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useCurrentUser'
import { studentApi, chapterApi, lookupApi } from '../api/teacherApi'
import type { Filters } from '../types/contracts'
export function useTeacherKeys() {
  const { user } = useAuth()
  return { students: ['teacher', user?.id, 'students'], chapters: ['teacher', user?.id, 'chapters'], lookups: ['teacher', user?.id, 'lookups'] }
}
export function useStudents(params: Filters) { const keys = useTeacherKeys(); return useQuery({ queryKey: [...keys.students, 'list', params], queryFn: ({signal}) => studentApi.list(params, signal) }) }
export function useStudent(id: string) { const keys = useTeacherKeys(); return useQuery({ queryKey: [...keys.students, id], queryFn: ({signal}) => studentApi.get(id, signal) }) }
export function useChapters(params: Filters) { const keys = useTeacherKeys(); return useQuery({ queryKey: [...keys.chapters, 'list', params], queryFn: ({signal}) => chapterApi.list(params, signal) }) }
export function useChapter(id: string) { const keys = useTeacherKeys(); return useQuery({ queryKey: [...keys.chapters, id], queryFn: ({signal}) => chapterApi.get(id, signal) }) }
export function useGrades() { const keys = useTeacherKeys(); return useQuery({ queryKey: [...keys.lookups, 'grades'], queryFn: ({signal}) => lookupApi.grades(signal) }) }
export function useSubjects() { const keys = useTeacherKeys(); return useQuery({ queryKey: [...keys.lookups, 'subjects'], queryFn: ({signal}) => lookupApi.subjects(signal) }) }
export function useTeacherMutation<T, V>(resource: 'students' | 'chapters', mutationFn: (variables: V) => Promise<T>) {
  const client = useQueryClient()
  const keys = useTeacherKeys()
  return useMutation({ mutationFn, retry: false, gcTime: 0, onSuccess: () => client.invalidateQueries({ queryKey: keys[resource] }) })
}

