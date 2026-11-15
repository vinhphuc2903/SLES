import { useState } from 'react'
import { Outlet } from 'react-router'
import { X } from 'lucide-react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="min-h-screen bg-[#f6f8fc]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[260px] border-r border-slate-200/80 bg-white px-4 py-5 lg:block">
        <Brand />
        <div className="mt-8"><Sidebar /></div>
        <div className="absolute inset-x-4 bottom-5 rounded-2xl bg-gradient-to-br from-brand-50 to-cyan-50 p-4"><div className="grid size-9 place-items-center rounded-xl bg-white text-brand-700 shadow-sm"><BookIcon /></div><p className="mt-3 text-sm font-semibold text-slate-800">Học tập chủ động</p><p className="mt-1 text-xs leading-5 text-slate-500">Không gian hỗ trợ dạy và học hiệu quả hơn mỗi ngày.</p></div>
      </aside>
      <div className="lg:pl-[260px]"><Header onMenuClick={() => setMobileOpen(true)} /><main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8"><Outlet /></main></div>
      {mobileOpen && <div className="fixed inset-0 z-50 bg-slate-950/35 lg:hidden" onClick={() => setMobileOpen(false)}><aside aria-label="Điều hướng di động" className="h-full w-[min(84vw,320px)] bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><Brand /><button type="button" aria-label="Đóng điều hướng" onClick={() => setMobileOpen(false)} className="grid size-10 place-items-center rounded-xl hover:bg-slate-100"><X className="size-5" /></button></div><div className="mt-7"><Sidebar onNavigate={() => setMobileOpen(false)} /></div></aside></div>}
    </div>
  )
}

function Brand() {
  return <div className="flex items-center gap-3 px-2"><div className="grid size-10 place-items-center rounded-[14px] bg-brand-700 text-white shadow-lg shadow-brand-700/20"><BookIcon /></div><div><div className="text-lg font-extrabold tracking-tight text-slate-900">SLES</div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Smart learning</div></div></div>
}

function BookIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5"><path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12v16H7a2.5 2.5 0 0 0-2.5 2v-15.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M4.5 18.5A2.5 2.5 0 0 1 7 16h12M8 7h7M8 10h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
}
