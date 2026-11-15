import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } }).response?.status
        return status !== 401 && status !== 403 && failureCount < 1
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
})
