import { Button } from '@/components/ui/Button'
import { useGrades, useSubjects } from '../hooks/queries'
import type { Filters as Params } from '../types/contracts'
const selectClass = 'min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm'
export function Filters({ chapters = false, params, onFilter }: { chapters?: boolean; params: Params; onFilter: (form: HTMLFormElement) => void }) {
  const grades = useGrades()
  return <form key={JSON.stringify(params)} className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); onFilter(event.currentTarget) }}>
    <input aria-label="Tìm kiếm" name="search" defaultValue={params.search} placeholder="Tìm kiếm..." className={selectClass} />
    <select aria-label="Lọc khối lớp" name="gradeId" defaultValue={params.gradeId ?? ''} className={selectClass}><option value="">Tất cả khối lớp</option>{grades.data?.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
    {chapters ? <><SubjectFilter selected={params.subjectId} /><select aria-label="Lọc trạng thái" name="status" defaultValue={params.status ?? ''} className={selectClass}><option value="">Tất cả trạng thái</option><option value="Draft">Bản nháp</option><option value="Published">Đã xuất bản</option><option value="Archived">Đã lưu trữ</option></select></> :
      <select aria-label="Lọc trạng thái" name="isActive" defaultValue={params.isActive === undefined ? '' : String(params.isActive)} className={selectClass}><option value="">Tất cả trạng thái</option><option value="true">Đang hoạt động</option><option value="false">Ngừng hoạt động</option></select>}
    <Button type="submit" variant="secondary">Áp dụng</Button>
    {grades.isError && <button type="button" onClick={() => void grades.refetch()}>Thử tải lại khối lớp</button>}
  </form>
}
function SubjectFilter({ selected }: { selected?: string }) {
  const subjects = useSubjects()
  return <><select aria-label="Lọc môn học" name="subjectId" defaultValue={selected ?? ''} className={selectClass}><option value="">Tất cả môn học</option>{subjects.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>{subjects.isError && <button type="button" onClick={() => void subjects.refetch()}>Thử tải lại môn học</button>}</>
}

