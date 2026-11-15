import {normalizeApiError} from '@/lib/api/apiErrors'
import {adminError} from '@/features/admin/utils/adminErrors'
export function practiceError(error:unknown){
 const e=normalizeApiError(error)
 const messages:Record<string,string>={chapterhasinvalidquestioncount:'Chương chưa có đúng 200 câu hỏi hợp lệ. Vui lòng liên hệ giáo viên.',attemptsubmitted:'Bài đã được nộp. Hãy mở kết quả.',answeroptioninvalid:'Phương án không thuộc câu hỏi này.',questionnotinattempt:'Câu hỏi không thuộc bài luyện tập.',resultunavailable:'Chưa nộp bài nên chưa thể xem đáp án và kết quả.',conflict:'Trạng thái bài đã thay đổi. Hãy kiểm tra lại.'}
 return messages[e.code]??adminError(error).message
}

