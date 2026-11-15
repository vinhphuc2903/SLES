import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { teacherSchema } from '@/features/admin/schemas/adminSchemas'
import { applyFormError } from '@/features/admin/utils/adminErrors'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ListSkeleton, QueryError } from '@/features/admin/components/QueryFeedback'
import { useGrades } from '../hooks/queries'
import type { Student } from '../types/contracts'
const schema = teacherSchema.extend({ gradeId: z.string().min(1, 'Vui lòng chọn khối lớp.') })
export type StudentValues = z.infer<typeof schema>
export function StudentForm({ student, onSubmit }: { student?: Student; onSubmit: (values: StudentValues) => Promise<void> }) {
  const grades = useGrades()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<StudentValues>({
    resolver: zodResolver(schema), defaultValues: { username: student?.username ?? '', fullName: student?.fullName ?? '', email: student?.email ?? '', phone: student?.phone ?? '', gradeId: student?.gradeId ?? '' } })
  if (grades.isPending) return <ListSkeleton />
  if (grades.isError) return <QueryError error={grades.error} retry={() => void grades.refetch()} />
  return <Card title="Thông tin học sinh"><form noValidate onSubmit={handleSubmit(async values => { try { await onSubmit(values) } catch (e) { applyFormError(e, setError, ['username','fullName','email','phone','gradeId']) } })}>
    <fieldset disabled={isSubmitting} className="grid gap-5 sm:grid-cols-2">
      <Field label="Tên đăng nhập" readOnly={!!student} {...register('username')} error={errors.username?.message} />
      <Field label="Họ và tên" {...register('fullName')} error={errors.fullName?.message} />
      <Field label="Email" type="email" {...register('email')} error={errors.email?.message} />
      <Field label="Số điện thoại" {...register('phone')} error={errors.phone?.message} />
      <label className="space-y-2 text-sm font-semibold">Khối lớp<select aria-label="Khối lớp" {...register('gradeId')} aria-invalid={!!errors.gradeId} className="block min-h-11 w-full rounded-xl border border-slate-200 p-3"><option value="">Chọn khối lớp</option>
        {student?.gradeId && !grades.data.some(g => g.id === student.gradeId) && <option value={student.gradeId} disabled>Khối lớp không còn hoạt động — chọn lại</option>}
        {grades.data.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>{errors.gradeId && <span role="alert">{errors.gradeId.message}</span>}</label>
    </fieldset>
    {!student && <p className="my-4 text-sm text-slate-600">Mật khẩu tạm được hệ thống tạo và chỉ hiển thị sau khi tạo tài khoản.</p>}
    {errors.root && <p role="alert" className="my-4 text-rose-700">{errors.root.message}</p>}
    <Button className="mt-5" type="submit" loading={isSubmitting} disabled={!grades.data.length}>{student ? 'Lưu thay đổi' : 'Tạo học sinh'}</Button>
  </form></Card>
}

