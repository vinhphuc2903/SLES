import { lazy, Suspense, useState } from 'react'
import { createBrowserRouter, createRoutesFromElements, RouterProvider, Navigate, Route, Outlet } from 'react-router'
import { AuthProvider } from '@/features/auth/hooks/AuthContext'
import { useAuth } from '@/features/auth/hooks/useCurrentUser'
import { ProtectedRoute } from './ProtectedRoute'
import { RoleRoute } from './RoleRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { dashboardPaths } from '@/components/layout/navigation'
import { LoadingScreen } from '@/components/feedback/LoadingScreen'

const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const ChangePasswordPage = lazy(() => import('@/features/auth/pages/ChangePasswordPage').then((module) => ({ default: module.ChangePasswordPage })))
const AdminDashboard = lazy(() => import('@/features/admin/pages/AdminDashboard').then((module) => ({ default: module.AdminDashboard })))
const TeachersPage = lazy(() => import('@/features/admin/pages/TeachersPage').then((module) => ({ default: module.TeachersPage })))
const TeacherCreatePage = lazy(() => import('@/features/admin/pages/TeacherCreatePage').then((module) => ({ default: module.TeacherCreatePage })))
const TeacherDetailPage = lazy(() => import('@/features/admin/pages/TeacherDetailPage').then((module) => ({ default: module.TeacherDetailPage })))
const SubjectsPage = lazy(() => import('@/features/admin/pages/SubjectsPage').then((module) => ({ default: module.SubjectsPage })))
const SubjectCreatePage = lazy(() => import('@/features/admin/pages/SubjectCreatePage').then((module) => ({ default: module.SubjectCreatePage })))
const SubjectDetailPage = lazy(() => import('@/features/admin/pages/SubjectDetailPage').then((module) => ({ default: module.SubjectDetailPage })))
const TeacherDashboard = lazy(() => import('@/features/teacher/pages/TeacherDashboard').then((module) => ({ default: module.TeacherDashboard })))
const QuestionBankPage = lazy(() => import('@/features/teacher/questions/QuestionPages').then(m => ({default:m.QuestionBankPage})))
const ChapterQuestionsPage = lazy(() => import('@/features/teacher/questions/QuestionPages').then(m => ({default:m.ChapterQuestionsPage})))
const QuestionCreatePage = lazy(() => import('@/features/teacher/questions/QuestionPages').then(m => ({default:m.QuestionCreatePage})))
const QuestionDetailPage = lazy(() => import('@/features/teacher/questions/QuestionPages').then(m => ({default:m.QuestionDetailPage})))
const ExamsPage = lazy(() => import('@/features/teacher/exams/ExamPages').then(m => ({default:m.ExamsPage})))
const ExamCreatePage = lazy(() => import('@/features/teacher/exams/ExamPages').then(m => ({default:m.ExamCreatePage})))
const ExamDetailPage = lazy(() => import('@/features/teacher/exams/ExamPages').then(m => ({default:m.ExamDetailPage})))
const ExamPermissionsPage = lazy(() => import('@/features/teacher/exams/ExamPermissions').then(m => ({default:m.ExamPermissionsPage})))
const ExamResultsPage = lazy(() => import('@/features/teacher/exams/ExamResults').then(m => ({default:m.ExamResultsPage})))
const ExamAttemptPage = lazy(() => import('@/features/teacher/exams/ExamResults').then(m => ({default:m.ExamAttemptPage})))
const StudentsPage = lazy(() => import('@/features/teacher/pages/StudentsPage').then(m => ({default:m.StudentsPage})))
const StudentCreatePage = lazy(() => import('@/features/teacher/pages/StudentCreatePage').then(m => ({default:m.StudentCreatePage})))
const StudentDetailPage = lazy(() => import('@/features/teacher/pages/StudentDetailPage').then(m => ({default:m.StudentDetailPage})))
const ChaptersPage = lazy(() => import('@/features/teacher/pages/ChaptersPage').then(m => ({default:m.ChaptersPage})))
const ChapterCreatePage = lazy(() => import('@/features/teacher/pages/ChapterCreatePage').then(m => ({default:m.ChapterCreatePage})))
const ChapterDetailPage = lazy(() => import('@/features/teacher/pages/ChapterDetailPage').then(m => ({default:m.ChapterDetailPage})))
const ChapterContentPage = lazy(() => import('@/features/teacher/pages/ChapterContentPage').then(m => ({default:m.ChapterContentPage})))
const StudentDashboard = lazy(() => import('@/features/student/pages/StudentDashboard').then((module) => ({ default: module.StudentDashboard })))
const StudentSubjectsPage = lazy(() => import('@/features/student/learning/LearningPages').then(m => ({default:m.SubjectsPage})))
const StudentSubjectPage = lazy(() => import('@/features/student/learning/LearningPages').then(m => ({default:m.SubjectPage})))
const StudentChapterReader = lazy(() => import('@/features/student/learning/LearningPages').then(m => ({default:m.ChapterReader})))
const PracticeStart = lazy(() => import('@/features/student/practice/PracticeStart').then(m => ({default:m.PracticeStart})))
const PracticeWorkspace = lazy(() => import('@/features/student/practice/PracticeWorkspace').then(m => ({default:m.PracticeWorkspace})))
const PracticeResultPage = lazy(() => import('@/features/student/practice/PracticeResult').then(m => ({default:m.PracticeResultPage})))
const PracticeHistoryPage = lazy(() => import('@/features/student/practice/HistoryPage').then(m => ({default:m.PracticeHistoryPage})))
const StudentExamsPage = lazy(() => import('@/features/student/exams/ExamPages').then(m => ({default:m.StudentExamsPage})))
const StudentExamDetail = lazy(() => import('@/features/student/exams/ExamPages').then(m => ({default:m.StudentExamDetail})))
const StudentExamHistory = lazy(() => import('@/features/student/exams/ExamPages').then(m => ({default:m.StudentExamHistory})))
const StudentExamWorkspace = lazy(() => import('@/features/student/exams/ExamWorkspace').then(m => ({default:m.StudentExamWorkspace})))
const StudentExamResult = lazy(() => import('@/features/student/exams/ExamResult').then(m => ({default:m.StudentExamResult})))
const ForbiddenPage = lazy(() => import('@/features/shared/pages/StatusPages').then((module) => ({ default: module.ForbiddenPage })))
const NotFoundPage = lazy(() => import('@/features/shared/pages/StatusPages').then((module) => ({ default: module.NotFoundPage })))
const ProfilePage = lazy(() => import('@/features/shared/pages/ProfilePage').then((module) => ({ default: module.ProfilePage })))

export function AppRouter() {
  const [router] = useState(() => createBrowserRouter(createRoutesFromElements(
    <Route element={<AuthProvider><Suspense fallback={<LoadingScreen />}><Outlet /></Suspense></AuthProvider>}>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/403" element={<ForbiddenPage />} />
    <Route path="/404" element={<NotFoundPage />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<RoleHome />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route element={<RoleRoute roles={['ADMIN']} />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/teachers" element={<TeachersPage />} />
          <Route path="/admin/teachers/new" element={<TeacherCreatePage />} />
          <Route path="/admin/teachers/:id" element={<TeacherDetailPage />} />
          <Route path="/admin/subjects" element={<SubjectsPage />} />
          <Route path="/admin/subjects/new" element={<SubjectCreatePage />} />
          <Route path="/admin/subjects/:id" element={<SubjectDetailPage />} />
        </Route>
        <Route element={<RoleRoute roles={['TEACHER']} />}>
          <Route path="/teacher" element={<TeacherDashboard />} />
          <Route path="/teacher/students" element={<StudentsPage />} />
          <Route path="/teacher/students/new" element={<StudentCreatePage />} />
          <Route path="/teacher/students/:id" element={<StudentDetailPage />} />
          <Route path="/teacher/chapters" element={<ChaptersPage />} />
          <Route path="/teacher/chapters/new" element={<ChapterCreatePage />} />
          <Route path="/teacher/chapters/:id" element={<ChapterDetailPage />} />
          <Route path="/teacher/chapters/:id/content" element={<ChapterContentPage />} />
          <Route path="/teacher/questions" element={<QuestionBankPage />} />
          <Route path="/teacher/chapters/:chapterId/questions" element={<ChapterQuestionsPage />} />
          <Route path="/teacher/chapters/:chapterId/questions/new" element={<QuestionCreatePage />} />
          <Route path="/teacher/questions/:questionId" element={<QuestionDetailPage />} />
          <Route path="/teacher/exams" element={<ExamsPage />} />
          <Route path="/teacher/exams/new" element={<ExamCreatePage />} />
          <Route path="/teacher/exams/:examId" element={<ExamDetailPage />} />
          <Route path="/teacher/exams/:examId/permissions" element={<ExamPermissionsPage />} />
          <Route path="/teacher/exams/:examId/results" element={<ExamResultsPage />} />
          <Route path="/teacher/exams/:examId/attempts/:attemptId" element={<ExamAttemptPage />} />
          <Route path="/teacher/results" element={<Navigate to="/teacher/exams" replace />} />
        </Route>
        <Route element={<RoleRoute roles={['STUDENT']} />}>
          <Route path="/student" element={<StudentDashboard />} />
          <Route path="/student/dashboard" element={<Navigate to="/student" replace />} />
          <Route path="/student/learning" element={<Navigate to="/student/subjects" replace />} />
          <Route path="/student/subjects" element={<StudentSubjectsPage />} />
          <Route path="/student/subjects/:subjectId" element={<StudentSubjectPage />} />
          <Route path="/student/chapters/:chapterId" element={<StudentChapterReader />} />
          <Route path="/student/chapters/:chapterId/practice" element={<PracticeStart />} />
          <Route path="/student/practice" element={<Navigate to="/student/practice/history" replace />} />
          <Route path="/student/practice/history" element={<PracticeHistoryPage />} />
          <Route path="/student/practice/:attemptId" element={<PracticeWorkspace />} />
          <Route path="/student/practice/:attemptId/result" element={<PracticeResultPage />} />
          <Route path="/student/exams" element={<StudentExamsPage />} />
          <Route path="/student/exams/history" element={<StudentExamHistory />} />
          <Route path="/student/exams/:examId" element={<StudentExamDetail />} />
          <Route path="/student/exam-attempts/:attemptId" element={<StudentExamWorkspace />} />
          <Route path="/student/exam-attempts/:attemptId/result" element={<StudentExamResult />} />
          <Route path="/student/results" element={<Navigate to="/student/practice/history" replace />} />
        </Route>
      </Route>
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Route>)))
  return <RouterProvider router={router} />
}

function RoleHome() {
  const { status, user } = useAuth()
  if (status === 'initializing') return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.mustChangePassword ? '/change-password' : dashboardPaths[user.role]} replace />
}
