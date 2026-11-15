import { useSearchParams } from 'react-router'
import { normalizeApiError } from '@/lib/api/apiErrors'
import { adminError } from '@/features/admin/utils/adminErrors'
export const labels:Record<string,string>={Draft:'Bản nháp',Published:'Đã xuất bản',Archived:'Đã lưu trữ',Scheduled:'Đã lên lịch',Active:'Đang mở',Closed:'Đã đóng',Cancelled:'Đã hủy',Granted:'Đã cấp',Revoked:'Đã thu hồi',InProgress:'Đang làm bài',Submitted:'Đã nộp',AutoSubmitted:'Tự động nộp'}
export const localDate=(value:string|null)=>value?new Intl.DateTimeFormat('vi-VN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Không đặt'
export function managementError(error:unknown){
 const e=normalizeApiError(error)
 const messages:Record<string,string>={invaliddifficulty:"Cần chọn mức độ hợp lệ trước khi lưu hoặc xuất bản.",insufficientblueprint:"Chưa đủ câu hỏi theo ma trận 3/3/2/2. Kiểm tra số lượng từng mức độ.",contentrequired:'Vui lòng nhập nội dung câu hỏi.',musthavefouroptions:'Cần đúng bốn phương án.',musthaveexactlyonecorrectanswer:'Cần chọn đúng một đáp án đúng.',emptyoptioncontent:'Các phương án không được để trống.',noteditable:'Chỉ câu hỏi bản nháp mới được sửa.',invalidtransition:'Trạng thái hiện tại không cho phép thao tác.',haslearninghistory:'Câu hỏi có lịch sử học tập, không thể sửa hoặc xóa.',invalidschedule:'Tên, thời lượng hoặc lịch kiểm tra chưa hợp lệ.',chapterhasinvalidquestioncount:'Chương cần đúng 200 câu hỏi đã xuất bản hợp lệ.',invalidlifecycle:'Trạng thái hiện tại không cho phép thao tác.',permissioninvalid:'Học sinh phải đang hoạt động, thuộc giáo viên và cùng khối với chương.',resultunavailable:'Bài làm chưa hoàn tất nên chưa có kết quả.'}
 if(e.message==='Permission cannot be revoked after an attempt has started.')return 'Không thể thu hồi quyền vì học sinh đã bắt đầu làm bài.'
 return messages[e.code]??adminError(error).message
}
export function usePageQuery(){
 const [search,setSearch]=useSearchParams()
 return {page:Math.max(1,Math.min(100000,Math.floor(Number(search.get('page'))||1))),keyword:search.get('keyword')||undefined,status:search.get('status')||undefined,
 setPage:(page:number)=>{const next=new URLSearchParams(search);next.set('page',String(page));setSearch(next)},
 filter:(form:HTMLFormElement)=>{const next=new URLSearchParams();new FormData(form).forEach((v,k)=>{if(String(v).trim())next.set(k,String(v).trim())});setSearch(next)}}
}

