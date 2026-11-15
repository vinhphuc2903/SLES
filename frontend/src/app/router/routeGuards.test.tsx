import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { CurrentUser } from '@/types/auth'
import { AuthContext } from '@/features/auth/hooks/authTypes'
import { ProtectedRoute } from './ProtectedRoute'
import { RoleRoute } from './RoleRoute'

const teacher: CurrentUser = { id: 't-1', username: 'teacher', fullName: 'Teacher', role: 'TEACHER', gradeId: null, mustChangePassword: false }

function renderPrivateRoute(user: CurrentUser | null, status: 'authenticated' | 'unauthenticated', passwordChangeRequired = false) {
  const currentUser = user && passwordChangeRequired ? { ...user, mustChangePassword: true } : user
  return render(<MemoryRouter initialEntries={['/private']}><AuthContext.Provider value={{ status, user: currentUser, login: async () => teacher, logout: async () => undefined, changePassword: async () => undefined, setUser: () => undefined }}><Routes><Route element={<ProtectedRoute />}><Route element={<RoleRoute roles={['ADMIN']} />}><Route path="/private" element={<p>Protected content</p>} /></Route></Route><Route path="/login" element={<p>Login page</p>} /><Route path="/403" element={<p>Forbidden page</p>} /><Route path="/change-password" element={<p>Change password page</p>} /></Routes></AuthContext.Provider></MemoryRouter>)
}

describe('route guards', () => {
  it('redirects unauthenticated visitors to login', () => {
    renderPrivateRoute(null, 'unauthenticated')
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it('shows forbidden page when an authenticated role is not allowed', () => {
    renderPrivateRoute(teacher, 'authenticated')
    expect(screen.getByText('Forbidden page')).toBeInTheDocument()
  })

  it('requires users with a temporary password to change it first', () => {
    renderPrivateRoute(teacher, 'authenticated', true)
    expect(screen.getByText('Change password page')).toBeInTheDocument()
  })
})
