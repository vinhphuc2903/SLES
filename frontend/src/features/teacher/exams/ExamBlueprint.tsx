import {Button} from '@/components/ui/Button'
import {Card} from '@/components/ui/Card'
import {ListSkeleton,QueryError} from '@/features/admin/components/QueryFeedback'
import {useBlueprint} from '../management/queries'
import {difficultyLabel} from '../questions/difficulty'
export function ExamBlueprint({chapterId}:{chapterId:string}){const q=useBlueprint(chapterId);if(q.isPending)return <ListSkeleton/>;if(q.isError)return <QueryError error={q.error} retry={()=>void q.refetch()}/>;return <Card title="Ma trận bài thi 3/3/2/2"><p>Đã xuất bản hợp lệ: {q.data.validPublished}/200 · {q.data.ready?'Sẵn sàng theo ma trận':'Chưa sẵn sàng theo ma trận'}</p><ul>{q.data.levels.map(l=><li key={l.difficulty} className="my-2">{difficultyLabel(l.difficulty)}: cần {l.required}, hiện có {l.available} — {l.available>=l.required?'Đủ':'Chưa đủ'}</li>)}</ul><Button variant="secondary" loading={q.isFetching} onClick={()=>void q.refetch()}>Cập nhật ma trận</Button><p>Máy chủ kiểm tra lại khi xuất bản và khi học sinh bắt đầu thi.</p></Card>}
