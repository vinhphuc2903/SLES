import { useSearchParams } from 'react-router'
import type { ListParams } from '../types/contracts'

export function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawPage = Number(searchParams.get('page') || 1)
  const rawSize = Number(searchParams.get('pageSize') || 20)
  const status = searchParams.get('isActive')
  const params: ListParams = {
    page: Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 100000 ? rawPage : 1,
    pageSize: [10, 20, 50, 100].includes(rawSize) ? rawSize : 20,
    search: searchParams.get('search')?.trim() || undefined,
    isActive: status === 'true' ? true : status === 'false' ? false : undefined,
  }
  const setPage = (page: number) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(page))
    setSearchParams(next)
  }
  const setFilters = (search: string, isActive: string, pageSize: string) => {
    const next = new URLSearchParams()
    if (search.trim()) next.set('search', search.trim())
    if (isActive === 'true' || isActive === 'false') next.set('isActive', isActive)
    next.set('pageSize', pageSize)
    next.set('page', '1')
    setSearchParams(next)
  }
  return { params, setPage, setFilters }
}
