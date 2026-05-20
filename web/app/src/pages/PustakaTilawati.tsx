import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { LibraryShell } from '@/components/LibraryShell'

type Jilid = {
  id: number
  label: string
  jumlahHalaman: number
  deskripsi: string
}

const JILID_LIST: Jilid[] = [
  { id: 1, label: 'Jilid 1', jumlahHalaman: 46, deskripsi: 'Pengenalan huruf hijaiyah berbaris fathah' },
  { id: 2, label: 'Jilid 2', jumlahHalaman: 46, deskripsi: 'Kasrah, dhammah, harakat panjang' },
  { id: 3, label: 'Jilid 3', jumlahHalaman: 46, deskripsi: 'Sukun, tasydid, mad' },
  { id: 4, label: 'Jilid 4', jumlahHalaman: 46, deskripsi: 'Tanwin & gabungan harakat' },
  { id: 5, label: 'Jilid 5', jumlahHalaman: 46, deskripsi: 'Hukum bacaan tajwid dasar' },
  { id: 6, label: 'Jilid 6', jumlahHalaman: 42, deskripsi: 'Gharib & musykilat surah pendek' },
]

function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function pageUrl(jilid: number, page: number) {
  return `/tilawati/jilid${jilid}/page-${pad2(page)}.jpg`
}

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent) => setDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return desktop
}

/**
 * PustakaTilawati — full-screen reader with floating header (jilid + page
 * nav). Footer is intentionally empty so the page imagery has the maximum
 * possible vertical real-estate.
 *
 * Desktop: true 2-page side-by-side via CSS grid; images are bounded by
 * `min-h-0 flex-1` + `object-contain` so they fill the available width AND
 * height without overflow.
 * Mobile: single page; image fills viewport height inside flex-1.
 */
export function PustakaTilawatiPage() {
  const { t } = useTranslation()
  const { jilidId } = useParams()
  const initialJilid = (() => {
    const n = Number(jilidId)
    return Number.isFinite(n) && n >= 1 && n <= 6 ? n : 1
  })()
  const [currentJilid, setCurrentJilid] = useState(initialJilid)
  const [currentPage, setCurrentPage] = useState(1)
  const isDesktop = useIsDesktop()

  const jilid = JILID_LIST.find((j) => j.id === currentJilid)!
  const totalPages = jilid.jumlahHalaman

  // Indonesian-bound textbook: left = even (lower), right = odd (higher).
  const leftPage = useMemo(() => {
    if (!isDesktop) return currentPage
    return currentPage % 2 === 0 ? currentPage : Math.max(1, currentPage - 1)
  }, [currentPage, isDesktop])
  const rightPage = isDesktop ? Math.min(leftPage + 1, totalPages) : null

  const jumpPage = useCallback(
    (n: number) => setCurrentPage(Math.max(1, Math.min(totalPages, n))),
    [totalPages],
  )
  const nextSpread = useCallback(
    () => jumpPage(currentPage + (isDesktop ? 2 : 1)),
    [currentPage, isDesktop, jumpPage],
  )
  const prevSpread = useCallback(
    () => jumpPage(currentPage - (isDesktop ? 2 : 1)),
    [currentPage, isDesktop, jumpPage],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        nextSpread()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prevSpread()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [nextSpread, prevSpread])

  useEffect(() => {
    if (isDesktop) return
    let startX = 0
    let startY = 0
    let moved = false
    const onStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      moved = false
    }
    const onMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) moved = true
    }
    const onEnd = (e: TouchEvent) => {
      if (!moved) return
      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return
      if (dx < 0) nextSpread()
      else prevSpread()
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [isDesktop, nextSpread, prevSpread])

  return (
    <LibraryShell
      backTo="/pustaka"
      contentClassName="flex h-full min-h-0 flex-col"
    >
      {/* Floating header — jilid + page + nav. Single row, compact on
          mobile (icon-only nav, short labels). flex-nowrap with min-w-0
          children prevents overflow. */}
      <div className="flex flex-shrink-0 justify-center px-2 pt-3">
        <div className="pointer-events-auto flex w-full max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full border border-amber-300 bg-amber-50/95 px-2 py-1.5 shadow-lg backdrop-blur sm:w-auto sm:gap-2 sm:px-3">
          <select
            value={currentJilid}
            onChange={(e) => {
              setCurrentJilid(Number(e.target.value))
              setCurrentPage(1)
            }}
            className="h-8 min-w-0 max-w-[7rem] truncate rounded-full border border-amber-200 bg-white px-2 text-xs sm:max-w-[160px]"
          >
            {JILID_LIST.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={prevSpread}
            disabled={currentPage <= 1}
            aria-label={t('pustaka.tilawati.prevAria')}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
          >
            <ChevronLeft size={14} className="shrink-0" />
            <span className="hidden sm:inline">{t('pustaka.tilawati.prev')}</span>
          </button>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={(e) => jumpPage(Number(e.target.value))}
            className="h-8 w-12 shrink-0 rounded-full border border-amber-200 bg-white px-2 text-center text-xs tabular-nums sm:w-14"
          />
          <span className="shrink-0 text-xs text-slate-600">/ {totalPages}</span>
          <button
            type="button"
            onClick={nextSpread}
            disabled={currentPage >= totalPages}
            aria-label={t('pustaka.tilawati.nextAria')}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
          >
            <span className="hidden sm:inline">{t('pustaka.tilawati.next')}</span>
            <ChevronRight size={14} className="shrink-0" />
          </button>
        </div>
      </div>

      {/* Pages — fill remaining height. Desktop: 2-col grid, images fit
          full available width and height. Mobile: single page. */}
      <div className="flex flex-1 min-h-0 items-stretch justify-center gap-3 px-2 pb-3 pt-3 lg:px-6">
        {isDesktop && rightPage && rightPage !== leftPage ? (
          <>
            <PageImage jilid={currentJilid} page={leftPage} />
            <PageImage jilid={currentJilid} page={rightPage} />
          </>
        ) : (
          <PageImage jilid={currentJilid} page={currentPage} />
        )}
      </div>
    </LibraryShell>
  )
}

function PageImage({ jilid, page }: { jilid: number; page: number }) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col items-center">
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg bg-white p-2 shadow-md">
        <img
          src={pageUrl(jilid, page)}
          alt={t('pustaka.tilawati.pageAlt', { jilid, page })}
          loading="lazy"
          className="block max-h-full max-w-full rounded object-contain"
        />
      </div>
      <div className="mt-1 text-center text-[11px] text-slate-500">{t('pustaka.tilawati.pageLabel', { page })}</div>
    </div>
  )
}
