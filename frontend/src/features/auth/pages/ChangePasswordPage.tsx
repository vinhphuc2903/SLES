import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { useAuth } from '@/features/auth/hooks/useCurrentUser'
import { changePasswordSchema, type ChangePasswordFormValues } from '@/features/auth/schemas/authSchemas'
import { normalizeApiError } from '@/lib/api/apiErrors'

export function ChangePasswordPage() {
  const { changePassword, user, logout } = useAuth()
  const navigate = useNavigate()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ChangePasswordFormValues>({ resolver: zodResolver(changePasswordSchema) })

  useEffect(() => {
    if (user && !user.mustChangePassword) navigate('/profile', { replace: true })
  }, [navigate, user])

  async function onSubmit(values: ChangePasswordFormValues) {
    try {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword })
      toast.success('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.')
      navigate('/login', { replace: true })
    } catch (error) {
      const normalized = normalizeApiError(error)
      setError(normalized.status === 401 ? 'currentPassword' : 'root', { message: normalized.status === 401 ? 'Mật khẩu hiện tại không chính xác.' : normalized.message })
    }
  }

  async function handleCancel() {
    if (user?.mustChangePassword) { await logout(); navigate('/login', { replace: true }) }
    else navigate(-1)
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f8fc] px-4 py-10">
      <section className="w-full max-w-[520px] rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/[0.04] sm:p-9">
        <div className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700"><KeyRound className="size-6" /></div>
        <div className="mt-6"><p className="text-sm font-semibold text-brand-700">Bảo mật tài khoản</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Đổi mật khẩu</h1><p className="mt-2 text-sm leading-6 text-slate-500">Mật khẩu mới cần có ít nhất 12 ký tự. Sau khi đổi, bạn sẽ cần đăng nhập lại.</p></div>
        {user?.mustChangePassword && <div className="mt-5 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-800"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><p>Bạn cần đổi mật khẩu tạm thời trước khi tiếp tục sử dụng hệ thống.</p></div>}
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Field label="Mật khẩu hiện tại" type="password" autoComplete="current-password" {...register('currentPassword')} error={errors.currentPassword?.message} />
          <Field label="Mật khẩu mới" type="password" autoComplete="new-password" {...register('newPassword')} error={errors.newPassword?.message} />
          <Field label="Xác nhận mật khẩu mới" type="password" autoComplete="new-password" {...register('confirmPassword')} error={errors.confirmPassword?.message} />
          {errors.root?.message && <p role="alert" className="text-sm text-rose-600">{errors.root.message}</p>}
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" onClick={handleCancel}><LogOut className="size-4" />{user?.mustChangePassword ? 'Đăng xuất' : 'Hủy'}</Button><Button type="submit" loading={isSubmitting}>{isSubmitting ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}</Button></div>
        </form>
      </section>
    </main>
  )
}
