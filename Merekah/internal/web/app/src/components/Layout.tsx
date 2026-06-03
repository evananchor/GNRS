import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, Bell, Flower2, KanbanSquare, LayoutDashboard, LogOut, Moon, PenSquare, Search, Sun, Users } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useHealth } from '@/api/hooks'
import { useTheme } from '@/lib/theme'
import { Avatar } from './ui'
import { UserMenu } from './UserMenu'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', icon: KanbanSquare },
  { to: '/composer', label: 'Composer', icon: PenSquare },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
]

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/projects': 'Projects',
  '/composer': 'Composer',
  '/clients': 'Clients',
  '/analytics': 'Analytics',
}

/** Mobile-only bottom tab bar. Hidden at md+ where the sidebar takes over. */
function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
    >
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} className="flex flex-col items-center gap-1 px-1 pt-2 text-meta font-medium">
          {({ isActive }) => (
            <>
              <item.icon className={cn('size-5 transition', isActive ? 'text-brand' : 'text-ink-muted')} />
              <span className={cn('leading-none transition', isActive ? 'font-semibold text-ink' : 'text-ink-muted')}>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export function Layout() {
  const { user, logout } = useAuth()
  const health = useHealth()
  const { theme, toggle } = useTheme()
  const online = health.isSuccess && !health.isError
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? 'Workspace'

  return (
    <div className="grid h-screen grid-cols-1 overflow-hidden md:grid-cols-[250px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-sm focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2 focus:text-body focus:font-semibold focus:text-ink focus:shadow-card"
      >
        Skip to content
      </a>
      {/* Sidebar — desktop only; mobile uses BottomNav + the header avatar menu */}
      <aside className="hidden min-h-0 flex-col bg-gradient-to-b from-sidebar-2 to-sidebar text-[#cfc9d8] md:flex">
        <div className="flex h-[62px] items-center gap-3 border-b border-white/[0.06] px-[14px]">
          <span className="bg-bloom grid size-[34px] place-items-center rounded-sm shadow-[0_3px_8px_rgba(229,68,109,.45)]">
            <Flower2 className="size-5 text-white" />
          </span>
          <div className="leading-tight">
            <div className="text-title font-bold tracking-[-0.2px] text-white">merekah</div>
            <div className="text-meta text-[#8f8a9c]">Agency workspace</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <div className="px-2.5 pb-2 pt-3 text-meta font-bold uppercase tracking-[0.12em] text-[#6f6a7d]">Workspace</div>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'my-0.5 flex items-center gap-3 rounded-sm px-[11px] py-[9px] font-medium transition',
                  isActive ? 'bg-brand/[0.16] text-white' : 'text-[#bdb7c8] hover:bg-white/[0.055] hover:text-white',
                )
              }
            >
              <item.icon className="size-[18px]" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <div className="flex items-center gap-2.5 rounded-[11px] p-1.5">
            <Avatar name={user?.name || user?.email || 'U'} size={34} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-body font-semibold text-white">{user?.name || 'Anggota tim'}</div>
              <div className="text-meta capitalize text-[#8f8a9c]">{user?.role}</div>
            </div>
            <button onClick={() => void logout()} title="Keluar" className="p-1 text-[#8f8a9c] transition hover:text-white">
              <LogOut className="size-[18px]" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-0 min-w-0 flex-col bg-bg">
        <header className="z-10 flex h-[62px] flex-none items-center gap-3.5 border-b border-line bg-surface/80 px-4 backdrop-blur-md md:px-5">
          <span className="bg-bloom grid size-8 flex-none place-items-center rounded-sm shadow-[0_3px_8px_rgba(229,68,109,.45)] md:hidden">
            <Flower2 className="size-[18px] text-white" />
          </span>
          <div className="text-title font-semibold tracking-[-0.2px]">{title}</div>
          <div className="ml-2 hidden w-[280px] items-center gap-2.5 rounded-[11px] border border-line bg-surface-soft px-3 py-2 text-ink-dim md:flex">
            <Search className="size-4" />
            <input
              type="search"
              aria-label="Search"
              className="flex-1 border-0 bg-transparent text-ui text-ink outline-none placeholder:text-ink-dim"
              placeholder="Search…"
            />
          </div>
          <div className="flex-1" />
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full text-label font-semibold md:border md:px-[11px] md:py-[5px]',
              online ? 'text-[#066b4a] md:border-[#cdeede] md:bg-[#e9f8f1]' : 'text-ink-muted md:border-line md:bg-surface-soft',
            )}
          >
            <i className={cn('size-[7px] rounded-full', online ? 'bg-ok shadow-[0_0_0_3px_rgba(16,185,129,.18)]' : 'bg-[#c4c1d0]')} />
            <span className="hidden md:inline">{online ? 'Live' : 'Offline'}</span>
            <span className="sr-only md:hidden">{online ? 'Live' : 'Offline'}</span>
          </span>
          <button
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggle}
            className="grid size-[38px] place-items-center rounded-sm text-ink-muted transition hover:bg-surface-soft hover:text-ink"
          >
            {theme === 'dark' ? <Sun aria-hidden className="size-[18px]" /> : <Moon aria-hidden className="size-[18px]" />}
          </button>
          <button aria-label="Notifications" className="grid size-[38px] place-items-center rounded-sm text-ink-muted transition hover:bg-surface-soft hover:text-ink">
            <Bell aria-hidden className="size-[18px]" />
          </button>
          <UserMenu className="md:hidden" />
        </header>

        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1480px] animate-rise px-4 pb-24 pt-6 md:px-[26px] md:pb-16">
            <Outlet />
          </div>
        </main>

        <BottomNav />
      </div>
    </div>
  )
}
