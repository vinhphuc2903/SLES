import { Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { subjectSchema, type SubjectValues } from '../schemas/adminSchemas'
import { applyFormError } from '../utils/adminErrors'
import type { Subject } from '../types/contracts'

export function SubjectForm({ subject, onSubmit }: { subject?: Subject; onSubmit: (values: SubjectValues) => Promise<void> }) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<SubjectValues>({
    resolver: zodResolver(subjectSchema),
    defaultValues: { code: subject?.code ?? '', name: subject?.name ?? '', description: subject?.description ?? '' },
  })
  return <Card title={subject ? 'Thông tin môn học' : 'Môn học mới'}>
    <form noValidate onSubmit={handleSubmit(async (values) => {
      try { await onSubmit(values) }
      catch (error) { applyFormError(error, setError, ['code', 'name', 'description']) }
    })}>
      <fieldset disabled={isSubmitting} className="grid gap-5 sm:grid-cols-2">
        <Field label="Mã môn học" readOnly={Boolean(subject)} {...register('code')} error={errors.code?.message}
          hint={subject ? 'Mã môn học không thể thay đổi.' : 'Hệ thống chuẩn hóa mã thành chữ hoa.'} />
        <Field label="Tên môn học" {...register('name')} error={errors.name?.message} />
        <label className="space-y-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">Mô tả (không bắt buộc)
          <textarea rows={5} {...register('description')} className="mt-1.5 block w-full rounded-xl border border-slate-200 p-3 text-sm font-normal focus:outline-brand-500" />
        </label>
      </fieldset>
      {errors.root && <p role="alert" className="mt-4 text-sm text-rose-700">{errors.root.message}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {!isSubmitting && <Link className="rounded-xl px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50" to="/admin/subjects">Về danh sách</Link>}
        <Button type="submit" loading={isSubmitting}>{subject ? 'Lưu thay đổi' : 'Tạo môn học'}</Button>
      </div>
    </form>
  </Card>
}
