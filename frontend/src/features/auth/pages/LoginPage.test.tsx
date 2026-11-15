import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AuthContext } from '@/features/auth/hooks/authTypes'
import { LoginPage } from './LoginPage'

describe('login page', () => {
  it('shows required field validation and toggles password visibility', async () => {
    const login = vi.fn()
    render(<MemoryRouter initialEntries={['/login']}><AuthContext.Provider value={{ status: 'unauthenticated', user: null, login, logout: async () => undefined, changePassword: async () => undefined, setUser: () => undefined }}><Routes><Route path="/login" element={<LoginPage />} /></Routes></AuthContext.Provider></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /đăng nhập/i }))
    expect(await screen.findByText('Vui lòng nhập tên đăng nhập.')).toBeInTheDocument()
    expect(await screen.findByText('Vui lòng nhập mật khẩu.')).toBeInTheDocument()
    const password = screen.getByLabelText('Mật khẩu')
    expect(password).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(login).not.toHaveBeenCalled()
  })
})
