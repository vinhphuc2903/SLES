import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { ListSkeleton, QueryError } from '@/features/admin/components/QueryFeedback'
import { applyFormError } from '@/features/admin/utils/adminErrors'
import { useGrades, useSubjects, useTeacherMutation } from '../hooks/queries'
import { chapterApi } from '../api/teacherApi'
const schema = z.object({ name:z.string().trim().min(1,'Vui lòng nhập tên chương.').max(255,'Tối đa 255 ký tự.'),description:z.string(),gradeId:z.string().min(1,'Vui lòng chọn khối lớp.'),subjectId:z.string().min(1,'Vui lòng chọn môn học.'),displayOrder:z.number().int('Thứ tự phải là số nguyên.').min(1,'Thứ tự phải lớn hơn 0.').max(2147483647,'Thứ tự quá lớn.') })
type Values = z.infer<typeof schema>
export function ChapterCreatePage() {
  const grades = useGrades(), subjects = useSubjects(), navigate = useNavigate()
  const mutation = useTeacherMutation('chapters', (v: Values) => chapterApi.create({...v,description:v.description || null}))
  const {register,handleSubmit,setError,formState:{errors,isSubmitting}} = useForm<Values>({resolver:zodResolver(schema),defaultValues:{name:'',description:'',gradeId:'',subjectId:'',displayOrder:1}})
  if (grades.isPending || subjects.isPending) return <ListSkeleton />
  if (grades.isError || subjects.isError) return <QueryError error={grades.error ?? subjects.error} retry={() => { void grades.refetch(); void subjects.refetch() }} />
  return <div className="space-y-6"><PageHeader title="Tạo chương học" description="Chương mới bắt đầu ở trạng thái bản nháp." /><Card><form noValidate onSubmit={handleSubmit(async v => {
    try { const result = await mutation.mutateAsync(v); toast.success('Đã tạo chương học.'); navigate('/teacher/chapters/' + result.id) }
    catch (e) { applyFormError(e,setError,['name','description','gradeId','subjectId','displayOrder']) }
  })}><fieldset disabled={isSubmitting} className="grid gap-5 sm:grid-cols-2">
    <Field label="Tên chương" {...register('name')} error={errors.name?.message} />
    <Field label="Thứ tự hiển thị" type="number" {...register('displayOrder',{valueAsNumber:true})} error={errors.displayOrder?.message} />
    <label>Khối lớp<select className="mt-2 block w-full rounded-xl border p-3" {...register('gradeId')}><option value="">Chọn khối lớp</option>{grades.data.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>{errors.gradeId && <span role="alert">{errors.gradeId.message}</span>}</label>
    <label>Môn học<select className="mt-2 block w-full rounded-xl border p-3" {...register('subjectId')}><option value="">Chọn môn học</option>{subjects.data.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>{errors.subjectId && <span role="alert">{errors.subjectId.message}</span>}</label>
    <label className="sm:col-span-2">Mô tả<textarea className="mt-2 block min-h-28 w-full rounded-xl border p-3" {...register('description')} /></label>
  </fieldset>{errors.root && <p role="alert" className="my-4 text-rose-700">{errors.root.message}</p>}
    {(!grades.data.length || !subjects.data.length) && <p role="alert">Cần khối lớp và môn học đang hoạt động để tạo chương.</p>}
    <Button type="submit" className="mt-5" loading={isSubmitting} disabled={!grades.data.length || !subjects.data.length}>Tạo chương học</Button>
  </form></Card></div>
}

