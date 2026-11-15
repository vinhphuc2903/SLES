import type { PropsWithChildren } from 'react'
import { Toaster } from 'sonner'
import { QueryProvider } from './QueryProvider'

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryProvider>
      {children}
      <Toaster position="top-right" richColors closeButton />
    </QueryProvider>
  )
}
