import {difficultyCodes,difficultyLabels} from './difficulty'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { applyFormError } from '@/features/admin/utils/adminErrors'
import { managementError } from '../management/utils'
import type { QuestionDetail,QuestionInput } from '../management/contracts'
const schema=z.object({difficulty:z.enum(difficultyCodes,{error:'Vui lòng chọn mức độ.'}),content:z.string().trim().min(1,'Vui lòng nhập câu hỏi.'),options:z.array(z.object({content:z.string().trim().min(1,'Vui lòng nhập phương án.')})).length(4),correct:z.string().regex(/^[0-3]$/,'Vui lòng chọn một đáp án đúng.')})
type Values=z.infer<typeof schema>
export function QuestionForm({detail,onSubmit}:{detail?:QuestionDetail;onSubmit:(input:QuestionInput)=>Promise<void>}){
 const options=detail?[...detail.options].sort((a,b)=>a.displayOrder-b.displayOrder):[]
 const {register,handleSubmit,setError,formState:{errors,isSubmitting}}=useForm<Values>({resolver:zodResolver(schema),defaultValues:{difficulty:detail?.question.difficulty as typeof difficultyCodes[number]|undefined??undefined,content:detail?.question.content??'',options:Array.from({length:4},(_,i)=>({content:options[i]?.content??''})),correct:detail?String(options.findIndex(o=>o.isCorrect)):''}})
 return <Card title="Câu hỏi và đáp án"><form noValidate onSubmit={handleSubmit(async v=>{try{await onSubmit({difficulty:v.difficulty,content:v.content,options:v.options.map((o,i)=>({content:o.content,isCorrect:String(i)===v.correct}))})}catch(e){applyFormError(e,setError,['content','options','correct']);setError('root',{message:managementError(e)})}})}>
 <fieldset disabled={isSubmitting} className="space-y-4"><label className="block font-semibold">Nội dung câu hỏi<textarea aria-label="Nội dung câu hỏi" {...register('content')} className="mt-2 block min-h-32 w-full rounded-xl border p-3"/></label>{errors.content&&<p role="alert">{errors.content.message}</p>}
 <label className="block">Mức độ<select aria-label="Mức độ" {...register('difficulty')} className="ml-3 rounded-xl border p-3"><option value="">Chọn mức độ</option>{difficultyCodes.map(d=><option key={d} value={d}>{difficultyLabels[d]}</option>)}</select></label>{errors.difficulty&&<p role="alert">{errors.difficulty.message}</p>}
 <p className="text-sm text-slate-600">Nhập đúng bốn phương án và chọn một đáp án đúng. Nội dung được hiển thị dưới dạng văn bản.</p>
 {[0,1,2,3].map(i=><div key={i} className="rounded-xl border border-slate-200 p-4"><label className="block">Phương án {String.fromCharCode(65+i)}<textarea aria-label={'Phương án '+String.fromCharCode(65+i)} {...register(`options.${i}.content`)} className="mt-2 block w-full rounded-xl border p-3"/></label><label className="mt-2 flex items-center gap-2"><input type="radio" value={i} {...register('correct')}/>Đáp án đúng {String.fromCharCode(65+i)}</label>{errors.options?.[i]?.content&&<p role="alert">{errors.options[i]?.content?.message}</p>}</div>)}
 {errors.correct&&<p role="alert">{errors.correct.message}</p>}</fieldset>{errors.root&&<p role="alert" className="my-4 text-rose-700">{errors.root.message}</p>}<Button className="mt-5" type="submit" loading={isSubmitting}>{detail?'Lưu câu hỏi':'Tạo câu hỏi'}</Button>
 </form></Card>
}

