import type { PropsWithChildren } from 'react'

const tones = { neutral: 'bg-slate-100 text-slate-700', success: 'bg-emerald-50 text-emerald-700', warning: 'bg-amber-50 text-amber-800', danger: 'bg-rose-50 text-rose-700', info: 'bg-sky-50 text-sky-700' }

export function Badge({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: keyof typeof tones }>) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}
