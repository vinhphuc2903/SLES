import { Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { teacherSchema, type TeacherValues } from '../schemas/adminSchemas'
import { applyFormError } from '../utils/adminErrors'
import type { Teacher } from '../types/contracts'

export function TeacherForm({ teacher, onSubmit }: { teacher?: Teacher; onSubmit: (values: TeacherValues) => Promise<void> }) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<TeacherValues>({
    resolver: zodResolver(teacherSchema),
    defaultValues: { username: teacher?.username ?? '', fullName: teacher?.fullName ?? '', email: teacher?.email ?? '', phone: teacher?.phone ?? '' },
  })
  return <Card title={teacher ? 'Thông tin giáo viên' : 'Thông tin tài khoản mới'}>
    <form noValidate onSubmit={handleSubmit(async (values) => {
      try { await onSubmit(values) }
      catch (error) { applyFormError(error, setError, ['username', 'fullName', 'email', 'phone']) }
    })}>
      <fieldset disabled={isSubmitting} className="grid gap-5 sm:grid-cols-2">
        <Field label="Tên đăng nhập" readOnly={Boolean(teacher)} autoComplete="off" {...register('username')}
          hint={teacher ? 'Tên đăng nhập không thể thay đổi.' : 'Từ 3 đến 100 ký tự.'} error={errors.username?.message} />
        <Field label="Họ và tên" autoComplete="name" {...register('fullName')} error={errors.fullName?.message} />
        <Field label="Email (không bắt buộc)" type="email" autoComplete="email" {...register('email')} error={errors.email?.message} />
        <Field label="Số điện thoại (không bắt buộc)" type="tel" autoComplete="tel" {...register('phone')} error={errors.phone?.message} />
      </fieldset>
      {!teacher && <p className="mt-5 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">Hệ thống tự tạo mật khẩu tạm thời. Bạn sẽ nhận mật khẩu ngay sau khi tạo tài khoản.</p>}
      {errors.root && <p role="alert" className="mt-4 text-sm text-rose-700">{errors.root.message}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {!isSubmitting && <Link className="rounded-xl px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50" to="/admin/teachers">Về danh sách</Link>}
        <Button type="submit" loading={isSubmitting}>{teacher ? 'Lưu thay đổi' : 'Tạo giáo viên'}</Button>
      </div>
    </form>
  </Card>
}
