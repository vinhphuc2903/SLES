import {difficultyLabel} from './difficulty'
import { Card } from '@/components/ui/Card'
import { ListSkeleton,QueryError } from '@/features/admin/components/QueryFeedback'
import { useProgress } from '../management/queries'
export function QuestionProgress({chapterId}:{chapterId:string}){
 const q=useProgress(chapterId)
 if(q.isPending)return <ListSkeleton/>
 if(q.isError)return <QueryError error={q.error} retry={()=>void q.refetch()}/>
 const p=q.data
 return <Card title="Tiến độ ngân hàng câu hỏi"><div className="grid gap-3 sm:grid-cols-3"><p>Đã xuất bản: {p.published}</p><p>Bản nháp: {p.draft}</p><p>Lưu trữ: {p.archived}</p></div>
 <div className="mt-4 grid gap-2 sm:grid-cols-2">{p.difficulties?.map(d=><p key={d.difficulty??"missing"}>{difficultyLabel(d.difficulty)}: {d.total} · Đã xuất bản đủ điều kiện thi: {d.eligiblePublished}</p>)}</div><p className="mt-4 font-semibold">Câu hỏi đã xuất bản hợp lệ: {p.validPublished} / 200</p><progress aria-label="Tiến độ 200 câu hỏi hợp lệ" value={Math.min(200,p.validPublished)} max={200} className="my-3 w-full"/>
 <p>{p.validPublished<200?'Chưa đủ 200 câu hỏi hợp lệ.':p.validPublished>200?'Vượt quá 200 câu hỏi hợp lệ; chưa đáp ứng điều kiện xuất bản.':'Đủ đúng 200 câu hỏi hợp lệ; máy chủ vẫn cần kiểm tra nội dung, khối lớp, môn học và trạng thái chương.'}</p></Card>
}

