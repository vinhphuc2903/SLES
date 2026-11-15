# Exam Management

Schema nền là `SLES_Database_v1_2.sql`; bản nâng cấp độ khó yêu cầu migration `database/001_question_difficulty_up.sql`. Xem [QuestionDifficultyAndBulkPublish](QuestionDifficultyAndBulkPublish.md). Mọi thời gian request/response dùng `DateTimeOffset` và được xử lý theo UTC.

## Lifecycle

- Teacher tạo đề ở `DRAFT`, chỉ `DRAFT` được sửa.
- Publish kiểm tra chapter thuộc teacher, đang `PUBLISHED`, có đúng 200 câu hợp lệ và đủ ma trận độ khó 3/3/2/2; sau đó đề thành `SCHEDULED` nếu `startAt` ở tương lai, còn lại là `ACTIVE`.
- Cả `SCHEDULED` lẫn `ACTIVE` chỉ khả dụng trong time window. `CLOSED` chặn attempt mới và vẫn giữ lịch sử.
- Mỗi `(exam_id, student_id)` có tối đa một attempt. Start lặp lại trả lại paper đã lưu, không sinh đề mới.

## Teacher API

- `GET /api/teacher/chapters/{chapterId}/exam-blueprint`: `{ready, validPublished, levels:[{difficulty, required, available}]}`
- `POST /api/teacher/exams`
- `GET /api/teacher/exams?page&pageSize&status&chapterId&keyword`
- `GET|PUT /api/teacher/exams/{examId}`
- `POST /api/teacher/exams/{examId}/publish`
- `POST /api/teacher/exams/{examId}/close`
- `POST /api/teacher/exams/{examId}/permissions`
- `POST /api/teacher/exams/{examId}/permissions/bulk`
- `GET /api/teacher/exams/{examId}/permissions?page&pageSize&status`
- `DELETE /api/teacher/exams/{examId}/permissions/{studentId}`
- `GET /api/teacher/exams/{examId}/results?page&pageSize&studentKeyword`
- `GET /api/teacher/exams/{examId}/attempts/{attemptId}`

Quyền chỉ được cấp cho student active do chính teacher tạo và cùng grade với chapter. Revoke không xóa dữ liệu, và bị chặn khi student đã có attempt.

Bulk grant trả kết quả từng student (`studentId`, `granted`, `detail`), có thể thành công một phần. `permissionCount` gồm quyền đã thu hồi; `attemptCount` gồm bài đang làm.

Teacher attempt review bổ sung các trường nullable `studentId`, `studentUsername`, `studentFullName`, `startedAt` sau khi kiểm tra ownership. Student result cũng điền startedAt từ attempt; các trường identity chỉ được điền ở teacher review. Nội dung câu/options vẫn lấy từ snapshot; không thay đổi cách chấm điểm. Attempt còn InProgress chưa hết hạn trả `resultunavailable`.

## Student API

- `GET /api/student/exams/available?page&pageSize`
- `POST /api/student/exams/{examId}/start`
- `GET /api/student/exams/{examId}/attempt`
- `GET /api/student/exam-attempts/{attemptId}`
- `PUT /api/student/exam-attempts/{attemptId}/questions/{attemptQuestionId}/answer`
- `POST /api/student/exam-attempts/{attemptId}/submit`
- `GET /api/student/exam-attempts/{attemptId}/result`

Mỗi attempt mới server kiểm tra lại pool 200 câu hợp lệ, chọn ngẫu nhiên đúng 3 RECOGNITION, 3 COMPREHENSION, 2 LOW_APPLICATION và 2 HIGH_APPLICATION, rồi xáo trộn thứ tự 10 câu và lưu immutable snapshot: nội dung câu, mã difficulty, 4 option, thứ tự option và đáp án đúng phục vụ chấm điểm. API đang làm bài chỉ trả `id`, label và content của option; không trả snapshot thô hoặc `isCorrect`.

Deadline là `min(startedAt + durationMinutes, exam.endAt)`. Không có background worker: khi đọc, lưu đáp án hoặc nộp bài sau deadline, attempt được lazy auto-submit trong transaction. Điểm raw bằng số câu đúng (0–10); percentage bằng raw score × 10.


## Student frontend 11B additions

- `GET /api/student/exams?page&pageSize`: discovery gồm upcoming/closed exams được cấp quyền đúng teacher/grade, và exam đã có lượt thuộc student. Chỉ student active, chưa deleted. `canStart`, attemptId/status do backend trả; Start vẫn kiểm tra lại.
- `GET /api/student/exams/{examId}`: cùng scope, trả subject/chapter metadata, schedule, duration, canStart và existing attempt summary. Không có câu hỏi/answer keys.
- `GET /api/student/exams/history?page&pageSize`: chỉ lượt của student, StartedAt DESC/Id, totalCount trước paging. Dùng helper lazy finalize hiện có cho lượt quá hạn trên trang trước trả status/score.
- Attempt DTO bổ sung `serverNow` để frontend ước lượng clock offset. Giữ expiresAt đã lưu, không đổi công thức deadline hoặc schema.
- Kết quả student bổ sung giá trị startedAt; snapshot/questions/scoring không đổi. API available cũ và Teacher workflow giữ nguyên.

Chi tiết frontend và kiểm thử: [StudentFrontend11B](StudentFrontend11B.md).

## Thiếu ma trận và lịch sử

Publish/Start từ chối với HTTP 409, `error.code=insufficientblueprint` cùng `error.blueprint` chi tiết nếu thiếu bất kỳ nhóm nào. Không bù bằng nhóm khác, không tạo attempt dở dang. GET blueprint phản ánh ngân hàng câu hỏi; quyền và lifecycle/schedule vẫn kiểm tra riêng tại publish/start.

Chỉ lấy IDs và difficulty trong phạm vi chapter đã kiểm tra; dùng `RandomNumberGenerator.Shuffle` cho từng nhóm và thứ tự cuối, sau đó tải nội dung/options của 10 câu. Start chạy transaction Serializable. Snapshot cũ chỉ có content vẫn đọc được, không sinh lại câu hoặc đổi điểm. Difficulty không đưa vào Student paper DTO. Practice vẫn 200 câu, không áp dụng 3/3/2/2.
