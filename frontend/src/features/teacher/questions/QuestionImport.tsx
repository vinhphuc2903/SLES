import {useEffect,useRef,useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {apiClient} from '@/lib/api/apiClient'
import {normalizeApiError} from '@/lib/api/apiErrors'
import {Button} from '@/components/ui/Button'
import {Card} from '@/components/ui/Card'
import {Pagination} from '@/components/ui/Pagination'
import {ConfirmationDialog} from '@/components/ui/ConfirmationDialog'
import {useManagementKeys} from '../management/queries'
import {managementError} from '../management/utils'
interface ImportRow {rowNumber:number;questionText:string;optionA:string;optionB:string;optionC:string;optionD:string;correctAnswer:string;difficulty:string;explanation:string|null;errors:string[]}
interface Preview {token:string|null;expiresAt:string|null;totalRows:number;validRows:number;invalidRows:number;rows:ImportRow[]}
interface ImportStatus {state:'Ready'|'Processing'|'Completed'|'Failed'|'Unknown';importedCount:number;message:string|null}
const base='/api/teacher'
function importError(error:unknown){const e=normalizeApiError(error);return ['importinvalid','importconflict','importnotfound','invalidrequest'].includes(e.code)?e.message:managementError(error)}
export function DownloadQuestionTemplate(){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false)
 async function download(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const {data}=await apiClient.get<Blob>(base+'/questions/import/template',{responseType:'blob'});const url=URL.createObjectURL(data);const link=document.createElement('a');link.href=url;link.download='SLES_Question_Import_Template.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError(managementError(e))}finally{lock.current=false;setBusy(false)}}
 return <div><Button variant="secondary" loading={busy} onClick={()=>void download()}>Tải mẫu Excel</Button>{error&&<p role="alert">{error}</p>}</div>
}
export function QuestionImport({chapterId}:{chapterId:string}){
 const client=useQueryClient(),keys=useManagementKeys(),active=useRef(true),lock=useRef(false)
 const [open,setOpen]=useState(false),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<Preview|null>(null),[status,setStatus]=useState<ImportStatus|null>(null),[uncertain,setUncertain]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false),[page,setPage]=useState(1)
 const url=base+'/chapters/'+chapterId+'/questions/import'
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 async function refresh(){await Promise.all([client.invalidateQueries({queryKey:keys.questions}),client.invalidateQueries({queryKey:keys.chapters})])}
 async function accept(s:ImportStatus){if(!active.current)return;setStatus(s);setUncertain(s.state==='Processing'||s.state==='Unknown');if(s.state==='Completed'){setError('');await refresh()}}
 async function upload(){
  if(lock.current||!file||uncertain)return
  setError('');setPreview(null);setStatus(null);setPage(1)
  if(!file.name.toLowerCase().endsWith('.xlsx')||file.size===0||file.size>4*1024*1024){setError('Chọn file .xlsx từ 1 byte đến 4 MiB.');return}
  lock.current=true;setBusy(true)
  try{const body=new FormData();body.append('file',file);const {data}=await apiClient.post<Preview>(url+'/preview',body,{headers:{'Content-Type':'multipart/form-data'}});if(active.current)setPreview(data)}catch(e){if(active.current)setError(importError(e))}finally{lock.current=false;if(active.current)setBusy(false)}
 }
 async function check(){if(!preview?.token)return;try{const {data}=await apiClient.get<ImportStatus>(url+'/status',{params:{token:preview.token}});await accept(data);if(data.state==='Ready')setUncertain(false)}catch(e){if(active.current){setUncertain(true);setError('Chưa xác định kết quả. Kiểm tra ngân hàng câu hỏi trước khi tải file lại. '+importError(e))}}}
 async function submit(){
  if(lock.current||!preview?.token||preview.invalidRows||uncertain||status?.state==='Completed'||status?.state==='Failed')return
  lock.current=true;setBusy(true);setError('')
  try{const {data}=await apiClient.post<ImportStatus>(url+'/confirm',{token:preview.token});await accept(data)}catch(e){if(active.current){setError(importError(e));setUncertain(true);await check()}}finally{lock.current=false;if(active.current){setBusy(false);setConfirm(false)}}
 }
 async function inspect(){if(lock.current)return;lock.current=true;setBusy(true);try{await check()}finally{lock.current=false;if(active.current)setBusy(false)}}
 const terminal=status?.state==='Completed'||status?.state==='Failed'
 return <div className="space-y-4"><Button variant="secondary" onClick={()=>setOpen(!open)}>{open?'Ẩn import Excel':'Import Excel'}</Button>{open&&<Card title="Import câu hỏi từ Excel"><p>Chỉ nhập vào chương bản nháp. Tối đa 4 MiB, 1000 dòng (không phải giới hạn 200 câu). Xóa các câu ví dụ trước khi tải lên. Toàn bộ câu hỏi sẽ được tạo ở trạng thái bản nháp, không tự xuất bản.</p><p>Giữ nguyên 8 cột của mẫu. Không dùng công thức, macro hoặc liên kết ngoài. Difficulty bắt buộc: RECOGNITION, COMPREHENSION, LOW_APPLICATION hoặc HIGH_APPLICATION. Explanation được lưu cùng câu hỏi.</p>
 <DownloadQuestionTemplate/><label className="my-4 block">File Excel<input aria-label="File Excel" type="file" accept=".xlsx" disabled={busy||uncertain} className="mt-2 block" onChange={e=>{setFile(e.target.files?.[0]??null);setPreview(null);setStatus(null);setError('')}}/></label><Button disabled={!file||uncertain} loading={busy} onClick={()=>void upload()}>Kiểm tra file</Button>
 {error&&<p role="alert" className="my-3 text-rose-700">{error}</p>}
 {status&&<p role="status" className="my-3 font-semibold">{status.state==='Completed'?'Đã nhập '+status.importedCount+' câu hỏi bản nháp.':status.state==='Processing'?'Máy chủ đang nhập. Kiểm tra trạng thái để nhận kết quả.':status.message??'Preview sẵn sàng xác nhận.'}</p>}
 {uncertain&&<Button variant="secondary" disabled={busy} onClick={()=>void inspect()}>Kiểm tra trạng thái import</Button>}
 {preview&&<section aria-label="Preview Excel" className="mt-5 space-y-4"><p>Tổng dòng: {preview.totalRows} · Hợp lệ: {preview.validRows} · Không hợp lệ: {preview.invalidRows}</p>{preview.expiresAt&&<p>Preview hết hạn: {new Date(preview.expiresAt).toLocaleString('vi-VN')}. Sau khi xác nhận, hãy giữ trang mở cho đến khi nhận được kết quả.</p>}{preview.invalidRows>0&&<p role="alert">Có dòng lỗi. Sửa file rồi kiểm tra lại; không nhập một phần.</p>}
 {preview.rows.slice((page-1)*20,page*20).map(r=><details key={r.rowNumber} open={r.errors.length>0} className="rounded-xl border p-3"><summary>Hàng Excel {r.rowNumber}: {r.questionText.slice(0,120)||'(Thiếu câu hỏi)'} · {r.errors.length?'Không hợp lệ':'Hợp lệ'}</summary><p className="whitespace-pre-wrap">{r.questionText}</p>{['optionA','optionB','optionC','optionD'].map((k,i)=><p key={k} className="whitespace-pre-wrap">{String.fromCharCode(65+i)}. {r[k as 'optionA']}</p>)}<p>Đáp án đúng: {r.correctAnswer}</p><p>Mức độ: {r.difficulty}</p>{r.explanation&&<p className="whitespace-pre-wrap">Giải thích: {r.explanation}</p>}<ul className="text-rose-700">{r.errors.map((e,i)=><li key={i}>Hàng {r.rowNumber}: {e}</li>)}</ul></details>)}
 <Pagination page={page} pageSize={20} totalCount={preview.rows.length} onPageChange={setPage}/><Button disabled={!preview.token||preview.invalidRows>0||busy||uncertain||terminal} onClick={()=>setConfirm(true)}>Xác nhận import</Button></section>}
 <ConfirmationDialog open={confirm} title="Nhập câu hỏi bản nháp?" description={'Nhập toàn bộ '+(preview?.totalRows??0)+' câu hỏi vào chương đang chọn. Không tự xuất bản câu hỏi hoặc chương.'} confirmLabel="Nhập tất cả" busy={busy} onCancel={()=>setConfirm(false)} onConfirm={()=>void submit()}/></Card>}</div>
}
