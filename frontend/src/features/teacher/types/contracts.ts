import type { Teacher, Page, Subject } from '@/features/admin/types/contracts'
export type { Page, Subject }
export type Student = Omit<Teacher, 'role'> & { role: 'STUDENT' }
export interface StudentInput { username: string; fullName: string; gradeId: string; email: string | null; phone: string | null }
export interface Grade { id: string; name: string; code: string; displayOrder: number }
export type ChapterStatus = 'Draft' | 'Published' | 'Archived'
export interface ChapterInput { name: string; description: string | null; gradeId: string; subjectId: string; displayOrder: number }
export interface Chapter extends ChapterInput { id: string; gradeName: string; subjectName: string; teacherId: string; teacherName: string | null; status: ChapterStatus; publishedAt: string | null; createdAt: string; updatedAt: string; hasContent: boolean }
export interface ChapterDetail { chapter: Chapter; content: string; contentFormat: 'Markdown'; version: number }
export interface Filters { page: number; pageSize: number; search?: string; isActive?: boolean; gradeId?: string; subjectId?: string; status?: ChapterStatus }

