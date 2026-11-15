import { useEffect, useId, useRef, type PropsWithChildren } from 'react'
import { createPortal } from 'react-dom'

export function Dialog({ open, title, children, onClose, busy = false }: PropsWithChildren<{
  open: boolean; title: string; onClose: () => void; busy?: boolean
}>) {
  const titleId = useId()
  const panel = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  useEffect(() => { closeRef.current = onClose; busyRef.current = busy }, [onClose, busy])
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => [...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex="0"]') ?? [])]
    ;(focusable()[0] ?? panel.current)?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current()
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0]
      const last = elements.at(-1)
      if (!first) { event.preventDefault(); panel.current?.focus(); return }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (previous?.isConnected) previous.focus()
    }
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/40 px-4 py-8"
      onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose() }}>
      <section ref={panel} role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby={titleId} aria-busy={busy}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id={titleId} className="text-lg font-bold text-slate-900">{title}</h2>
        {children}
      </section>
    </div>, document.body,
  )
}
