import {useState} from 'react'
import {Button} from '@/components/ui/Button'
import {questionApi} from '../management/api'
import {useManagementMutation} from '../management/queries'
import {managementError} from '../management/utils'
import {difficultyCodes,difficultyLabels} from './difficulty'
export function QuestionClassification({id}:{id:string}){
 const [difficulty,setDifficulty]=useState(''),[error,setError]=useState(''),m=useManagementMutation('questions',()=>questionApi.classify(id,difficulty))
 return <section className="rounded-xl border p-4"><p>Câu đã xuất bản chưa phân loại. Chỉ cập nhật mức độ; nội dung và đáp án lịch sử được giữ nguyên.</p><label>Mức độ câu cũ<select aria-label="Mức độ câu cũ" value={difficulty} onChange={e=>setDifficulty(e.target.value)} disabled={m.isPending} className="m-3 rounded-xl border p-3"><option value="">Chọn mức độ</option>{difficultyCodes.map(d=><option key={d} value={d}>{difficultyLabels[d]}</option>)}</select></label><Button disabled={!difficulty} loading={m.isPending} onClick={async()=>{try{await m.mutateAsync();setError('')}catch(e){setError(managementError(e))}}}>Lưu phân loại</Button>{error&&<p role="alert">{error}</p>}</section>
}
