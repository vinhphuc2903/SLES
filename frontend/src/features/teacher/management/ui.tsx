import { labels, managementError } from './utils'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { useManagementMutation } from './queries'
export function Status({value}:{value:string|null}){return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{value?labels[value]??value:'Chưa làm bài'}</span>}
export function ConfirmAction({label,description,resource,run,onDone,destructive=false,disabled=false}:{label:string;description:string;resource:'questions'|'exams';run:()=>Promise<unknown>;onDone?:()=>void;destructive?:boolean;disabled?:boolean}){
 const [open,setOpen]=useState(false),[error,setError]=useState('')
 const mutation=useManagementMutation(resource,run)
 return <><Button variant={destructive?'danger':'secondary'} disabled={disabled} onClick={()=>{setError('');setOpen(true)}}>{label}</Button>
 <ConfirmationDialog open={open} title={label+'?'} description={description} confirmLabel={label} busy={mutation.isPending} destructive={destructive} onCancel={()=>setOpen(false)} onConfirm={async()=>{if(mutation.isPending)return;try{await mutation.mutateAsync();setOpen(false);toast.success('Thao tác thành công.');onDone?.()}catch(e){setError(managementError(e));setOpen(false)}}}/>
 {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}</>
}
export function SearchToolbar({keyword,status,statuses=[],filter}:{keyword?:string;status?:string;statuses?:string[];filter:(form:HTMLFormElement)=>void}){
 return <form key={(keyword??'')+(status??'')} className="flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();filter(e.currentTarget)}}><input aria-label="Tìm kiếm" name="keyword" defaultValue={keyword} className="min-h-11 rounded-xl border border-slate-200 px-3" placeholder="Tìm kiếm..." />
 {statuses.length>0&&<select aria-label="Lọc trạng thái" name="status" defaultValue={status??''} className="rounded-xl border border-slate-200 p-3"><option value="">Tất cả trạng thái</option>{statuses.map(s=><option key={s} value={s}>{labels[s]}</option>)}</select>}<Button type="submit" variant="secondary">Áp dụng</Button></form>
}

