import { Bell, ChevronDown, LogOut, Menu, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks/useCurrentUser'
import { roleLabels } from './navigation'
import { Button } from '@/components/ui/Button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const navigate = useNavigate()
  if (!user) return null
  const initials = user.fullName.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase()

  async function handleLogout() {
    await logout()
    setLogoutConfirmOpen(false)
    toast.success('Bạn đã đăng xuất.')
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-7">
      <div className="flex items-center gap-3">
        <button type="button" aria-label="Mở điều hướng" onClick={onMenuClick} className="grid size-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden"><Menu className="size-5" /></button>
        <div className="hidden text-sm text-slate-500 sm:block">Nền tảng học tập và kiểm tra thông minh</div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <button type="button" aria-label="Thông báo" className="grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><Bell className="size-[18px]" /></button>
        <div className="relative">
          <button type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="flex min-h-11 items-center gap-2 rounded-xl px-1.5 text-left hover:bg-slate-50 sm:gap-3 sm:px-2">
            <span className="grid size-9 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{initials}</span>
            <span className="hidden min-w-0 sm:block"><span className="block max-w-36 truncate text-sm font-semibold text-slate-800">{user.fullName}</span><span className="block text-xs text-slate-500">{roleLabels[user.role]}</span></span>
            <ChevronDown className="hidden size-4 text-slate-400 sm:block" />
          </button>
          {menuOpen && <div className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"><Link onClick={() => setMenuOpen(false)} to="/profile" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><UserRound className="size-4" /> Hồ sơ cá nhân</Link><Button variant="ghost" className="w-full justify-start px-3" onClick={() => { setMenuOpen(false); setLogoutConfirmOpen(true) }}><LogOut className="size-4" /> Đăng xuất</Button></div>}
        </div>
      </div>
      <ConfirmationDialog open={logoutConfirmOpen} title="Đăng xuất khỏi SLES?" description="Phiên đăng nhập hiện tại sẽ được kết thúc trên thiết bị này." confirmLabel="Đăng xuất" destructive onConfirm={handleLogout} onCancel={() => setLogoutConfirmOpen(false)} />
    </header>
  )
}
