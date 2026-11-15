import { useAuth } from '@/features/auth/hooks/useCurrentUser'
import { roleLabels } from '@/components/layout/navigation'
import { Button } from '@/components/ui/Button'
import { Link } from 'react-router'
import { KeyRound, ShieldCheck, UserRound } from 'lucide-react'

export function ProfilePage() {
  const { user } = useAuth()
  if (!user) return null
  return <div className="mx-auto max-w-3xl space-y-6"><div><p className="text-sm font-semibold text-brand-700">Tài khoản</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Hồ sơ cá nhân</h1><p className="mt-2 text-sm text-slate-500">Thông tin từ hồ sơ đăng nhập hiện tại.</p></div><section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><div className="flex items-center gap-4 border-b border-slate-100 pb-6"><div className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700"><UserRound className="size-6" /></div><div><h2 className="text-lg font-bold text-slate-900">{user.fullName}</h2><p className="text-sm text-slate-500">{roleLabels[user.role]}</p></div></div><dl className="grid gap-5 py-6 sm:grid-cols-2"><ProfileField label="Tên đăng nhập" value={user.username} /><ProfileField label="Vai trò" value={roleLabels[user.role]} /><ProfileField label="Mã tài khoản" value={user.id} /><ProfileField label="Mã khối lớp" value={user.gradeId ?? 'Không áp dụng'} /></dl><div className="flex flex-wrap gap-3"><Link to="/change-password"><Button variant="secondary"><KeyRound className="size-4" /> Đổi mật khẩu</Button></Link>{user.mustChangePassword && <p className="flex items-center gap-2 text-sm text-amber-700"><ShieldCheck className="size-4" /> Cần đổi mật khẩu</p>}</div></section></div>
}

function ProfileField({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 break-all text-sm font-medium text-slate-800">{value}</dd></div> }
