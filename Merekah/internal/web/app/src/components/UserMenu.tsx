import { useEffect, useRef, useState } from 'react'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Avatar } from './ui'
import { cn } from '@/lib/cn'

/**
 * Mobile-only account menu shown in the header. On desktop the sidebar footer
 * carries profile + logout, so this is wrapped in `md:hidden` by the caller.
 */
export function UserMenu({ className }: { className?: string }) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const label = user?.name || user?.email || 'U'

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="grid place-items-center rounded-full"
      >
        <Avatar name={label} size={32} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-30 w-56 overflow-hidden rounded-card border border-line bg-surface shadow-lg">
          <div className="flex items-center gap-2.5 border-b border-line px-3 py-3">
            <Avatar name={label} size={34} />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-body font-semibold text-ink">{user?.name || 'Anggota tim'}</div>
              <div className="text-meta capitalize text-ink-dim">{user?.role}</div>
            </div>
          </div>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false)
              void logout()
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-body font-medium text-ink transition hover:bg-surface-soft"
          >
            <LogOut className="size-[18px] text-ink-muted" /> Keluar
          </button>
        </div>
      )}
    </div>
  )
}
