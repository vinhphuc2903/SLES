import {ExamBlueprint} from './ExamBlueprint'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Field } from '@/components/ui/Field'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { ListSkeleton,QueryError } from '@/features/admin/components/QueryFeedback'
import { applyFormError } from '@/features/admin/utils/adminErrors'
import { useChapters } from '../hooks/queries'
import { useProgress } from '../management/queries'
import { managementError } from '../management/utils'
import type { Exam,ExamInput } from '../management/contracts'
const time=z.string().refine(v=>v===''||!Number.isNaN(new Date(v).getTime()),'Thời gian chưa hợp lệ.')
const schema=z.object({chapterId:z.string().min(1,'Vui lòng chọn chương.'),name:z.string().trim().min(1,'Vui lòng nhập tên bài kiểm tra.').max(255,'Tối đa 255 ký tự.'),description:z.string(),durationMinutes:z.number().int('Thời lượng phải là số nguyên.').min(1,'Thời lượng phải lớn hơn 0.').max(2147483647,'Thời lượng quá lớn.'),startAt:time,endAt:time}).refine(v=>!v.startAt||!v.endAt||new Date(v.endAt)>new Date(v.startAt),{message:'Thời gian kết thúc phải sau bắt đầu.',path:['endAt']})
type Values=z.infer<typeof schema>
function localInput(value:string|null){if(!value)return '';const d=new Date(value);const pad=(n:number)=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())}
export function ExamForm({exam,onSubmit}:{exam?:Exam;onSubmit:(body:ExamInput)=>Promise<void>}){
 const {register,control,setValue,handleSubmit,setError,formState:{errors,isSubmitting}}=useForm<Values>({resolver:zodResolver(schema),defaultValues:{chapterId:exam?.chapterId??'',name:exam?.name??'',description:exam?.description??'',durationMinutes:exam?.durationMinutes??30,startAt:localInput(exam?.startAt??null),endAt:localInput(exam?.endAt??null)}})
 const chapterId=useWatch({control,name:'chapterId'})
 return <Card title={exam?'Sửa bài kiểm tra bản nháp':'Thông tin bài kiểm tra'}><form noValidate onSubmit={handleSubmit(async v=>{try{await onSubmit({...v,description:v.description.trim()||null,startAt:v.startAt?new Date(v.startAt).toISOString():null,endAt:v.endAt?new Date(v.endAt).toISOString():null})}catch(e){applyFormError(e,setError,['name','description','chapterId','durationMinutes','startAt','endAt']);setError('root',{message:managementError(e)})}})}>
 <fieldset disabled={isSubmitting} className="space-y-5">
 {!exam&&<ChapterPicker selected={chapterId} onSelect={id=>setValue('chapterId',id,{shouldValidate:true})}/>}
 {errors.chapterId&&<p role="alert">{errors.chapterId.message}</p>}
 <Field label="Tên bài kiểm tra" {...register('name')} error={errors.name?.message}/><label className="block">Mô tả<textarea {...register('description')} className="mt-2 block w-full rounded-xl border p-3"/></label>
 <Field label="Thời lượng (phút)" type="number" {...register('durationMinutes',{valueAsNumber:true})} error={errors.durationMinutes?.message}/>
 <p className="text-sm text-slate-600">Giờ địa phương: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Thời gian được chuyển sang UTC khi gửi. Có thể để trống lịch; máy chủ quyết định thời điểm mở bài.</p>
 <div className="grid gap-4 sm:grid-cols-2"><Field label="Bắt đầu" type="datetime-local" step="1" {...register('startAt')} error={errors.startAt?.message}/><Field label="Kết thúc" type="datetime-local" step="1" {...register('endAt')} error={errors.endAt?.message}/></div>
 {chapterId&&<ExamBlueprint chapterId={chapterId}/>}<p className="text-sm text-slate-600">Máy chủ chọn và lưu 10 câu hỏi khi từng học sinh bắt đầu bài làm.</p>
 </fieldset>{errors.root&&<p role="alert" className="my-3 text-rose-700">{errors.root.message}</p>}<Button className="mt-5" type="submit" loading={isSubmitting}>{exam?'Lưu bài kiểm tra':'Tạo bài kiểm tra'}</Button></form></Card>
}
function ChapterPicker({selected,onSelect}:{selected:string;onSelect:(id:string)=>void}){
 const [page,setPage]=useState(1),[search,setSearch]=useState(''),q=useChapters({page,pageSize:20,status:'Published',search})
 return <section aria-label="Chọn chương đã xuất bản" className="space-y-3"><h2 className="font-semibold">Chọn chương đã xuất bản</h2><input aria-label="Tìm chương" className="w-full rounded-xl border p-3" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Tìm tên chương"/>
 {q.isPending?<ListSkeleton/>:q.isError?<QueryError error={q.error} retry={()=>void q.refetch()}/>:<>{q.data.items.length===0&&<p>Chưa có chương đã xuất bản.</p>}{q.data.items.map(c=><label key={c.id} className="flex items-center gap-3 rounded-xl border p-3"><input type="radio" name="chapter-choice" checked={selected===c.id} onChange={()=>onSelect(c.id)}/>{c.name} · {c.subjectName} · {c.gradeName}</label>)}<Pagination page={page} pageSize={20} totalCount={q.data.totalCount} onPageChange={setPage}/></>}
 {selected&&<SelectedEligibility id={selected}/>}</section>
}
function SelectedEligibility({id}:{id:string}){const q=useProgress(id);return <p role="status">{q.isPending?'Đang kiểm tra chương đã chọn...':q.isError?'Chưa kiểm tra được ngân hàng câu hỏi. Máy chủ sẽ kiểm tra khi tạo.':'Chương đã chọn có '+q.data.validPublished+' / 200 câu hỏi hợp lệ. '+(q.data.validPublished===200?'Đủ số câu; máy chủ kiểm tra các điều kiện còn lại.':'Chưa đáp ứng điều kiện tạo bài kiểm tra.')}</p>}

