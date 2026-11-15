import { NavLink } from 'react-router'
import { navigation } from './navigation'
import { useAuth } from '@/features/auth/hooks/useCurrentUser'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()
  if (!user) return null
  const items = navigation[user.role]
  return (
    <nav aria-label="Điều hướng chính" className="flex flex-col gap-1">
      <p className="mb-2 px-3 pt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Không gian làm việc</p>
      {items.map(({ label, to, icon: Icon }, index) => (
        <NavLink key={to} to={to} end={index === 0} onClick={onNavigate} className={({ isActive }) => `group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
          {({ isActive }) => <><Icon className={`size-[18px] ${isActive ? 'text-brand-700' : 'text-slate-400 group-hover:text-slate-600'}`} /><span>{label}</span></>}
        </NavLink>
      ))}
    </nav>
  )
}
