import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Vui lòng nhập tên đăng nhập.'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu.'),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại.'),
  newPassword: z.string().min(12, 'Mật khẩu mới cần có ít nhất 12 ký tự.'),
  confirmPassword: z.string().min(1, 'Vui lòng xác nhận mật khẩu mới.'),
}).refine((value) => value.newPassword === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Mật khẩu xác nhận không khớp.',
})

export type LoginFormValues = z.infer<typeof loginSchema>
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>
