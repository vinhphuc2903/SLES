import { LoaderCircle } from 'lucide-react'

export function LoadingScreen({ label = 'Đang tải...' }: { label?: string }) {
  return <div className="grid min-h-screen place-items-center bg-slate-50"><div role="status" className="flex items-center gap-3 text-sm font-medium text-slate-600"><LoaderCircle className="size-5 animate-spin text-brand-700" />{label}</div></div>
}
