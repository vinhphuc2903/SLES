import { useSearchParams } from 'react-router'
import type { Filters as Params, ChapterStatus } from '../types/contracts'
export function useFilters(chapters = false) {
  const [search, setSearch] = useSearchParams()
  const params: Params = { page: Math.min(100000, Math.max(1, Number(search.get('page')) || 1)), pageSize: 20,
    search: search.get('search') || undefined, gradeId: search.get('gradeId') || undefined }
  if (chapters) {
    params.subjectId = search.get('subjectId') || undefined
    const status = search.get('status')
    params.status = ['Draft','Published','Archived'].includes(status ?? '') ? status as ChapterStatus : undefined
  } else params.isActive = search.get('isActive') === 'true' ? true : search.get('isActive') === 'false' ? false : undefined
  return { params, setPage: (page: number) => { const next = new URLSearchParams(search); next.set('page', String(page)); setSearch(next) },
    filter: (form: HTMLFormElement) => { const next = new URLSearchParams(); new FormData(form).forEach((value,key) => { if (String(value).trim()) next.set(key, String(value).trim()) }); setSearch(next) } }
}

