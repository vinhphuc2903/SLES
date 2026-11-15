import { useState } from 'react'
import { Eye, EyeOff, LockKeyhole, LogIn, ShieldCheck, Sparkles } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { dashboardPaths } from '@/components/layout/navigation'
import { useAuth } from '@/features/auth/hooks/useCurrentUser'
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas/authSchemas'
import { normalizeApiError } from '@/lib/api/apiErrors'
import { LoadingScreen } from '@/components/feedback/LoadingScreen'

export function LoginPage() {
  const { login, status, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema), defaultValues: { username: '', password: '' } })

  if (status === 'initializing') return <LoadingScreen label="Đang kiểm tra phiên đăng nhập..." />
  if (status === 'authenticated' && user) return <Navigate to={user.mustChangePassword ? '/change-password' : dashboardPaths[user.role]} replace />

  async function onSubmit(values: LoginFormValues) {
    try {
      const currentUser = await login(values)
      toast.success(`Xin chào ${currentUser.fullName}!`)
      const target = (location.state as { from?: string } | null)?.from
      const safeTarget = target?.startsWith('/') && !target.startsWith('//') && target !== '/login' ? target : dashboardPaths[currentUser.role]
      navigate(currentUser.mustChangePassword ? '/change-password' : safeTarget, { replace: true })
    } catch (error) {
      const normalized = normalizeApiError(error)
      if (normalized.status === 401) setError('root', { message: 'Tên đăng nhập hoặc mật khẩu chưa chính xác.' })
      else setError('root', { message: normalized.message })
    }
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-cyan-800 p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="absolute -right-36 -top-32 size-[520px] rounded-full border border-white/10" /><div className="absolute -right-20 -top-16 size-[390px] rounded-full border border-white/10" /><div className="absolute -bottom-48 -left-20 size-[480px] rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-white/15"><Sparkles className="size-5" /></div><div><div className="text-xl font-bold">SLES</div><div className="text-xs tracking-wide text-white/65">SMART LEARNING & EXAMINATION</div></div></div>
        <div className="relative max-w-xl"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-cyan-50"><ShieldCheck className="size-4" /> Học tập trong một không gian an toàn</div><h1 className="text-4xl font-semibold leading-[1.15] tracking-tight xl:text-5xl">Mỗi ngày học tập,<br />một bước tiến mới.</h1><p className="mt-6 max-w-md text-base leading-7 text-white/70">Kết nối giáo viên và học sinh với trải nghiệm học tập, luyện tập và kiểm tra rõ ràng.</p></div>
        <p className="relative text-xs text-white/45">© 2026 SLES · Nền tảng học tập thông minh</p>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 lg:hidden"><div className="grid size-12 place-items-center rounded-2xl bg-brand-700 text-white"><Sparkles className="size-6" /></div><p className="mt-3 text-lg font-bold text-slate-900">SLES</p></div>
          <div className="mb-8"><p className="text-sm font-semibold text-brand-700">Chào mừng bạn quay lại</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Đăng nhập</h2><p className="mt-2 text-sm leading-6 text-slate-500">Nhập thông tin tài khoản để tiếp tục vào không gian học tập.</p></div>
          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Field label="Tên đăng nhập" placeholder="Nhập tên đăng nhập" autoComplete="username" autoFocus error={errors.username?.message} {...register('username')} />
            <div className="relative"><Field label="Mật khẩu" type={showPassword ? 'text' : 'password'} placeholder="Nhập mật khẩu" autoComplete="current-password" error={errors.password?.message} {...register('password')} /><button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-[35px] grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">{showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}</button></div>
            {errors.root?.message && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{errors.root.message}</p>}
            <Button type="submit" loading={isSubmitting} className="mt-2 w-full">{isSubmitting ? 'Đang xác thực...' : 'Đăng nhập'} {!isSubmitting && <LogIn className="size-4" />}</Button>
          </form>
          <div className="mt-7 flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-xs leading-5 text-slate-500"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-brand-700" /><p>Thông tin đăng nhập được bảo vệ. Nếu đây là lần đầu sử dụng, bạn sẽ được yêu cầu đổi mật khẩu.</p></div>
          <p className="mt-8 text-center text-xs text-slate-400">Cần hỗ trợ? Vui lòng liên hệ quản trị viên hệ thống.</p>
          <Link className="sr-only" to="/404">Trang không tồn tại</Link>
        </div>
      </section>
    </main>
  )
}
