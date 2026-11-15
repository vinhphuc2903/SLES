import { describe, expect, it } from 'vitest'
import { changePasswordSchema, loginSchema } from './authSchemas'

describe('authentication form schemas', () => {
  it('requires a username and password for login', () => {
    expect(loginSchema.safeParse({ username: '', password: '' }).success).toBe(false)
    expect(loginSchema.safeParse({ username: 'teacher', password: 'secret' }).success).toBe(true)
  })

  it('enforces backend password length and confirmation', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'short', confirmPassword: 'short' }).success).toBe(false)
    expect(changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'new-password-123', confirmPassword: 'different-password' }).success).toBe(false)
    expect(changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'new-password-123', confirmPassword: 'new-password-123' }).success).toBe(true)
  })
})
