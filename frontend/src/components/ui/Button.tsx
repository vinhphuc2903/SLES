import { LoaderCircle } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type PropsWithChildren } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

const variants = {
  primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800 focus-visible:ring-brand-500',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-brand-500',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-brand-500',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500',
}

export const Button = forwardRef<HTMLButtonElement, PropsWithChildren<ButtonProps>>(function Button({ children, loading, variant = 'primary', className = '', disabled, ...props }, ref) {
  return (
    <button ref={ref} type="button" className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`} disabled={disabled || loading} {...props}>
      {loading && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
      {children}
    </button>
  )
})
