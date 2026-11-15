import type { InputHTMLAttributes } from 'react'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export function Field({ label, error, hint, id, className = '', ...props }: FieldProps) {
  const inputId = id ?? props.name
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold text-slate-700">{label}</label>
      <input id={inputId} aria-invalid={Boolean(error)} aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined} className={`min-h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 ${error ? 'border-rose-400' : 'border-slate-200'} ${className}`} {...props} />
      {error ? <p id={`${inputId}-error`} role="alert" className="text-xs text-rose-600">{error}</p> : hint ? <p id={`${inputId}-hint`} className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}
