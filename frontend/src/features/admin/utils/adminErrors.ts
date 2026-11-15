import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { normalizeApiError, type ApiError } from '@/lib/api/apiErrors'

export function adminError(error: unknown): ApiError {
  const normalized = error && typeof error === 'object' && 'fieldErrors' in error && 'status' in error
    ? error as ApiError : normalizeApiError(error)
  const messages: Record<number, string> = {
    400: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra các trường bên dưới.',
    401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    403: 'Bạn không có quyền thực hiện thao tác này.',
    404: 'Không tìm thấy bản ghi. Bản ghi có thể đã bị xóa hoặc không còn khả dụng.',
    409: 'Dữ liệu bị trùng hoặc đã thay đổi. Vui lòng kiểm tra rồi thử lại.',
  }
  const message = normalized.code === 'duplicate_username'
    ? 'Tên đăng nhập đã được sử dụng.'
    : normalized.status === null
      ? 'Không thể kết nối máy chủ. Vui lòng thử lại.'
      : messages[normalized.status] ?? 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.'
  return { ...normalized, message }
}

export function applyFormError<T extends FieldValues>(
  error: unknown, setError: UseFormSetError<T>, fields: Path<T>[],
) {
  const normalized = adminError(error)
  setError('root', { message: normalized.message })
  for (const key of Object.keys(normalized.fieldErrors)) {
    const field = fields.find((name) => name.toLowerCase() === key.replace(/^.*\./, '').toLowerCase())
    if (field) setError(field, { message: 'Giá trị chưa hợp lệ. Vui lòng kiểm tra lại.' })
  }
  if (normalized.code === 'duplicate_username' && fields.includes('username' as Path<T>))
    setError('username' as Path<T>, { message: normalized.message })
  if (normalized.status === 409 && fields.includes('code' as Path<T>))
    setError('code' as Path<T>, { message: 'Mã môn học đã được sử dụng.' })
}

export const formatDate = (date: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(date))
