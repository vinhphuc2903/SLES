import type { PropsWithChildren, ReactNode } from 'react'

export function Card({ children, title, description, actions, className = '' }: PropsWithChildren<{ title?: string; description?: string; actions?: ReactNode; className?: string }>) {
  return <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02] ${className}`}>
    {(title || description || actions) && <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6"><div>{title && <h2 className="font-semibold text-slate-900">{title}</h2>}{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>{actions}</div>}
    <div className="p-5 sm:p-6">{children}</div>
  </section>
}
