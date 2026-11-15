import axios from 'axios'

export interface ApiError {
  status: number | null
  code: string
  message: string
  fieldErrors: Record<string, string>
}

const friendlyStatus: Record<number, string> = {
  400: 'Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra lại.',
  401: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy nội dung bạn yêu cầu.',
  409: 'Thao tác chưa thể thực hiện do dữ liệu đã thay đổi.',
  500: 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
}

export function normalizeApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? null
    const body = error.response?.data as { error?: { code?: string; message?: string; errors?: Record<string, string[]> }; errors?: Record<string, string[]>; title?: string } | undefined
    const validationErrors = body?.error?.errors ?? body?.errors ?? {}
    const fieldErrors = Object.fromEntries(
      Object.entries(validationErrors).map(([key, messages]) => [key, messages[0] ?? 'Giá trị không hợp lệ.']),
    )

    return {
      status,
      code: body?.error?.code ?? (status ? `http_${status}` : 'network_error'),
      message: body?.error?.message ?? (status ? friendlyStatus[status] ?? 'Đã xảy ra lỗi. Vui lòng thử lại.' : 'Không thể kết nối máy chủ. Kiểm tra kết nối mạng rồi thử lại.'),
      fieldErrors,
    }
  }

  return { status: null, code: 'unexpected_error', message: 'Đã xảy ra lỗi không mong muốn.', fieldErrors: {} }
}
