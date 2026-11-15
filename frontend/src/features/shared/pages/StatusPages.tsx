import { Link } from 'react-router'
import { ArrowLeft, Compass, ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function ForbiddenPage() {
  return <StatusPage icon={<ShieldX className="size-7" />} code="403" title="Bạn chưa có quyền truy cập" description="Tài khoản hiện tại không được phép mở khu vực này." />
}

export function NotFoundPage() {
  return <StatusPage icon={<Compass className="size-7" />} code="404" title="Không tìm thấy trang" description="Đường dẫn có thể đã thay đổi hoặc không tồn tại." />
}

function StatusPage({ icon, code, title, description }: { icon: React.ReactNode; code: string; title: string; description: string }) {
  return <main className="grid min-h-screen place-items-center bg-[#f6f8fc] px-4"><div className="max-w-md text-center"><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-700">{icon}</div><p className="mt-6 text-sm font-bold tracking-[0.18em] text-brand-700">{code}</p><h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{description}</p><Link to="/" className="mt-6 inline-block"><Button variant="secondary"><ArrowLeft className="size-4" /> Về trang chủ</Button></Link></div></main>
}
