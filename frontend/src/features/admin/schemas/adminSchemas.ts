import { z } from 'zod'

export const teacherSchema = z.object({
  username: z.string().trim().min(3, 'Tên đăng nhập cần ít nhất 3 ký tự.').max(100, 'Tối đa 100 ký tự.'),
  fullName: z.string().trim().min(1, 'Vui lòng nhập họ và tên.').max(255, 'Tối đa 255 ký tự.'),
  email: z.string().trim().max(255, 'Tối đa 255 ký tự.').refine(
    (value) => value === '' || z.email().safeParse(value).success, 'Địa chỉ email chưa hợp lệ.',
  ),
  phone: z.string().trim().max(30, 'Số điện thoại tối đa 30 ký tự.'),
})
export type TeacherValues = z.infer<typeof teacherSchema>

export const subjectSchema = z.object({
  code: z.string().trim().min(1, 'Vui lòng nhập mã môn học.').max(50, 'Mã môn học tối đa 50 ký tự.'),
  name: z.string().trim().min(1, 'Vui lòng nhập tên môn học.').max(255, 'Tên môn học tối đa 255 ký tự.'),
  description: z.string().trim(),
})
export type SubjectValues = z.infer<typeof subjectSchema>
