import { BookOpenCheck, BookOpenText, ChartNoAxesColumn, ClipboardList, GraduationCap, LayoutDashboard, Library, Users, UserRound, type LucideIcon } from 'lucide-react'
import type { UserRole } from '@/types/auth'

export interface NavItem { label: string; to: string; icon: LucideIcon; implemented?: boolean }

export const roleLabels: Record<UserRole, string> = { ADMIN: 'Quản trị viên', TEACHER: 'Giáo viên', STUDENT: 'Học sinh' }
export const dashboardPaths: Record<UserRole, string> = { ADMIN: '/admin', TEACHER: '/teacher', STUDENT: '/student' }

export const navigation: Record<UserRole, NavItem[]> = {
  ADMIN: [
    { label: 'Tổng quan', to: '/admin', icon: LayoutDashboard },
    { label: 'Quản lý giáo viên', to: '/admin/teachers', icon: Users },
    { label: 'Quản lý môn học', to: '/admin/subjects', icon: Library },
    { label: 'Hồ sơ cá nhân', to: '/profile', icon: UserRound },
  ],
  TEACHER: [
    { label: 'Tổng quan', to: '/teacher', icon: LayoutDashboard },
    { label: 'Quản lý học sinh', to: '/teacher/students', icon: Users },
    { label: 'Quản lý chương', to: '/teacher/chapters', icon: BookOpenText },
    { label: 'Ngân hàng câu hỏi', to: '/teacher/questions', icon: Library },
    { label: 'Quản lý bài kiểm tra', to: '/teacher/exams', icon: ClipboardList },
    { label: 'Kết quả theo bài kiểm tra', to: '/teacher/results', icon: ChartNoAxesColumn },
    { label: 'Hồ sơ cá nhân', to: '/profile', icon: UserRound },
  ],
  STUDENT: [
    { label: 'Tổng quan', to: '/student', icon: LayoutDashboard },
    { label: 'Môn học', to: '/student/subjects', icon: BookOpenText },
    { label: 'Lịch sử luyện tập', to: '/student/practice/history', icon: BookOpenCheck },
    { label: 'Bài kiểm tra', to: '/student/exams', icon: ClipboardList },
    { label: 'Lịch sử thi', to: '/student/exams/history', icon: ChartNoAxesColumn },
    { label: 'Hồ sơ cá nhân', to: '/profile', icon: UserRound },
  ],
}

export const roleIcon = { ADMIN: Library, TEACHER: GraduationCap, STUDENT: BookOpenCheck } satisfies Record<UserRole, LucideIcon>
