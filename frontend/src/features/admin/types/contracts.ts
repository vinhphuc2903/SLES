export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
}

export interface ListParams {
  page: number
  pageSize: number
  search?: string
  isActive?: boolean
}

export interface Teacher {
  id: string
  username: string
  fullName: string
  role: 'TEACHER'
  gradeId: string | null
  email: string | null
  phone: string | null
  isActive: boolean
  mustChangePassword: boolean
  createdAt: string
}

export interface TeacherProfile {
  fullName: string
  email: string | null
  phone: string | null
}

export interface CreateTeacher extends TeacherProfile { username: string }
export interface CreatedTeacher { user: Teacher; temporaryPassword: string }

export interface Subject {
  id: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface SubjectProfile { name: string; description: string | null }
export interface CreateSubject extends SubjectProfile { code: string }
