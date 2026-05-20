import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BookMarked,
  BookOpenCheck,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  School,
  Settings,
  Trophy,
  User as UserIcon,
  Users,
} from 'lucide-react'

import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getSettings } from '@/api/settings'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/Button'
import { ProfileDialog } from '@/components/ProfileDialog'
import { cn } from '@/lib/cn'

const SIDEBAR_HIDDEN_KEY = 'gnrs.sidebar.hidden'

type NavItem = {
  to: string
  icon: React.ReactNode
  label: string
  adminOnly?: boolean
}

export function Layout() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [pending, setPending] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Branding from /api/settings — logo data-URL + instansi name shown
  // next to the "GNRS" word in both the desktop sidebar and mobile header.
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 60_000,
  })
  const instansiLogo = settings?.instansi_logo ?? ''
  const instansiName = settings?.instansi_name ?? 'US'
  const Brand = () => (
    <span className="flex items-center gap-2">
      {instansiLogo ? (
        <img src={instansiLogo} alt="" className="h-6 w-6 object-contain" />
      ) : null}
      <span>GNRS{instansiName ? ` ${instansiName}` : ''}</span>
    </span>
  )

  // Desktop-only: user can hide the sidebar entirely. Persisted in
  // localStorage so it survives reloads.
  const [sidebarHidden, setSidebarHidden] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1'
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_HIDDEN_KEY, sidebarHidden ? '1' : '0')
    } catch {
      /* localStorage may be unavailable (private mode) */
    }
  }, [sidebarHidden])

  // Close the user-menu dropdown when navigating or clicking outside.
  useEffect(() => {
    setUserMenuOpen(false)
  }, [location.pathname])
  useEffect(() => {
    if (!userMenuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [userMenuOpen])

  const handleLogout = async () => {
    setPending(true)
    try {
      await logout()
      navigate('/login')
    } finally {
      setPending(false)
    }
  }

  const items: NavItem[] = [
    { to: '/dashboard', icon: <LayoutDashboard size={16} />, label: t('nav.dashboard') },
    { to: '/students', icon: <Users size={16} />, label: t('nav.students') },
    { to: '/teachers', icon: <GraduationCap size={16} />, label: t('nav.teachers') },
    { to: '/kelas', icon: <School size={16} />, label: t('nav.kelas') },
    { to: '/kehadiran', icon: <CalendarCheck size={16} />, label: t('nav.kehadiran') },
    { to: '/bacaan', icon: <BookOpenCheck size={16} />, label: t('nav.bacaan') },
    { to: '/pustaka', icon: <BookMarked size={16} />, label: t('nav.pustaka') },
    { to: '/achievement', icon: <Trophy size={16} />, label: t('nav.achievement') },
    { to: '/pengaturan', icon: <Settings size={16} />, label: t('nav.settings'), adminOnly: true },
  ].filter((it) => !it.adminOnly || user?.role === 'admin')

  return (
    <div className="flex h-screen flex-col overflow-hidden md:flex-row">
      {/* Mobile: top header with brand on the left + user avatar dropdown
          on the right. Menu lives at the bottom (see <nav> below). */}
      <header className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 md:hidden">
        <Link to="/dashboard" className="text-base font-semibold">
          <Brand />
        </Link>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-slate-100"
            aria-label={t('nav.openUserMenu')}
            aria-expanded={userMenuOpen}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
              {user?.photoUrl ? (
                <img src={user.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs font-semibold text-slate-500">
                  {(user?.name ?? '?').slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <span className="max-w-[110px] truncate text-sm font-medium text-slate-800">
              {user?.nickname || user?.name}
            </span>
          </button>
          {userMenuOpen ? (
            <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false)
                  setProfileOpen(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50"
              >
                <UserIcon size={14} /> {t('nav.profile')}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={pending}
                className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
              >
                <LogOut size={14} /> {t('nav.logout')}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Desktop sidebar — unchanged. */}
      <aside
        className={cn(
          'hidden w-60 flex-col border-r border-slate-200 bg-white md:sticky md:top-0 md:flex md:h-screen',
          sidebarHidden && 'md:hidden',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <Link to="/dashboard" className="text-base font-semibold">
            <Brand />
          </Link>
          <button
            type="button"
            onClick={() => setSidebarHidden(true)}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={t('nav.hideSidebar')}
            title={t('nav.hideSidebar')}
          >
            <ChevronLeft size={16} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map((it) => (
            <SideLink key={it.to} to={it.to} icon={it.icon} label={it.label} />
          ))}
        </nav>
        <div className="space-y-2 border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            aria-label={t('nav.openMyProfile')}
            title={t('nav.openMyProfileTitle')}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
              {user?.photoUrl ? (
                <img src={user.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs font-semibold text-slate-500">
                  {(user?.name ?? '?').slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">{user?.name}</div>
              <div className="text-xs text-slate-500">{user?.role}</div>
            </div>
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={handleLogout}
            disabled={pending}
          >
            <LogOut size={16} className="mr-2" /> {t('nav.logout')}
          </Button>
        </div>
      </aside>

      {/* Reveal-sidebar button — visible only when sidebar is hidden (desktop). */}
      {sidebarHidden ? (
        <button
          type="button"
          onClick={() => setSidebarHidden(false)}
          className="fixed left-2 top-2 z-50 hidden h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-slate-700 shadow-md backdrop-blur transition hover:bg-white md:inline-flex"
          aria-label={t('nav.showSidebar')}
          title={t('nav.showSidebar')}
        >
          <ChevronRight size={16} />
        </button>
      ) : null}

      {profileOpen ? <ProfileDialog onClose={() => setProfileOpen(false)} /> : null}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>

      {/* Mobile bottom navigation. Horizontal scroll if menu items don't
          all fit on small viewports. */}
      <nav
        className="flex flex-shrink-0 items-stretch overflow-x-auto border-t border-slate-200 bg-white md:hidden"
        aria-label={t('nav.mainMenu')}
      >
        {items.map((it) => (
          <BottomNavLink key={it.to} to={it.to} icon={it.icon} label={it.label} />
        ))}
      </nav>
    </div>
  )
}

function SideLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100',
          isActive && 'bg-slate-900 text-white hover:bg-slate-900',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}

function BottomNavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex min-w-[64px] flex-1 flex-shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-[10px] text-slate-600 transition',
          isActive ? 'text-slate-900' : 'hover:text-slate-900',
        )
      }
    >
      {icon}
      <span className="truncate">{label}</span>
    </NavLink>
  )
}
