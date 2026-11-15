import { Link,useParams } from 'react-router'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {PageHeader} from '@/components/ui/PageHeader'
import {Card} from '@/components/ui/Card'
import {Pagination} from '@/components/ui/Pagination'
import {EmptyState} from '@/components/feedback/EmptyState'
import {ListSkeleton,QueryError} from '@/features/admin/components/QueryFeedback'
import {SearchToolbar} from '@/features/teacher/management/ui'
import {usePageQuery} from '@/features/teacher/management/utils'
import {useSubjects,useSubject,useChapters,useChapter} from '../data/queries'
export function SubjectsPage(){
 const p=usePageQuery(),q=useSubjects({page:p.page,pageSize:12,search:p.keyword})
 return <div className="space-y-6"><PageHeader title="Môn học của bạn" description="Các môn đang hoạt động có chương đã xuất bản dành cho bạn."/><SearchToolbar {...p}/>
 {q.isPending?<ListSkeleton/>:q.isError?<QueryError error={q.error} retry={()=>void q.refetch()}/>:<>{!q.data.items.length?<EmptyState title="Chưa có môn học" description="Môn học sẽ xuất hiện khi giáo viên xuất bản chương phù hợp với khối lớp của bạn."/>:<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{q.data.items.map(s=><Card key={s.id} title={s.name}><p>{s.description}</p><p className="my-3 text-sm text-slate-600">{s.gradeName} · {s.chapterCount} chương</p><Link className="font-semibold text-brand-700" to={'/student/subjects/'+s.id}>Học {s.name}</Link></Card>)}</div>}<Pagination page={p.page} pageSize={12} totalCount={q.data.totalCount} onPageChange={p.setPage}/></>}</div>
}
export function SubjectPage(){
 const {subjectId=''}=useParams(),p=usePageQuery(),subject=useSubject(subjectId),chapters=useChapters({page:p.page,pageSize:20,subjectId,search:p.keyword})
 if(subject.isPending)return <ListSkeleton/>
 if(subject.isError)return <QueryError error={subject.error} retry={()=>void subject.refetch()}/>
 return <div className="space-y-6"><PageHeader title={subject.data.name} description={subject.data.description??undefined} actions={<Link to="/student/subjects">Tất cả môn học</Link>}/><SearchToolbar {...p}/>
 {chapters.isPending?<ListSkeleton/>:chapters.isError?<QueryError error={chapters.error} retry={()=>void chapters.refetch()}/>:<>{!chapters.data.items.length&&<EmptyState title="Chưa có chương phù hợp" description="Thử thay đổi tìm kiếm hoặc quay lại sau."/>}{chapters.data.items.map(c=><Card key={c.id} title={c.displayOrder+'. '+c.name}><p>{c.description}</p><div className="mt-4 flex flex-wrap gap-4 text-brand-700"><Link to={'/student/chapters/'+c.id}>Đọc lý thuyết</Link><Link to={'/student/chapters/'+c.id+'/practice'}>Luyện tập</Link></div></Card>)}<Pagination page={p.page} pageSize={20} totalCount={chapters.data.totalCount} onPageChange={p.setPage}/></>}</div>
}
export function ChapterReader(){
 const {chapterId=''}=useParams(),q=useChapter(chapterId)
 if(q.isPending)return <ListSkeleton/>
 if(q.isError)return <QueryError error={q.error} retry={()=>void q.refetch()}/>
 const d=q.data,c=d.chapter
 return <div className="space-y-6"><PageHeader title={c.name} description={c.subjectName+' · '+c.gradeName+' · Phiên bản '+d.version} actions={<Link to={'/student/chapters/'+chapterId+'/practice'}>Luyện tập chương này</Link>}/><Link to={'/student/subjects/'+c.subjectId}>Về danh sách chương của môn</Link><Card><article aria-label="Nội dung lý thuyết" className="markdown-preview overflow-x-auto">{d.contentFormat==='Markdown'?<Markdown skipHtml remarkPlugins={[remarkGfm]}>{d.content||'*Chưa có nội dung.*'}</Markdown>:<p className="whitespace-pre-wrap">{d.content}</p>}</article></Card><Link to="/student/subjects">Tất cả môn học</Link></div>
}

