import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Calendar, Clock, Radio } from 'lucide-react'

import { listSesi, type Sesi } from '@/api/sesi'
import { listKelas, type Kelas } from '@/api/kelas'
import { EndSesiSummaryDialog } from '@/components/EndSesiSummaryDialog'
import { cn } from '@/lib/cn'

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDurasi(startedAt: string | null | undefined, endedAt: string | null | undefined) {
  if (!startedAt) return null
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  const sec = Math.max(0, Math.floor((end - start) / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}j ${m}m`
  return `${m} menit`
}

// Returns the ISO week containing the given date (Monday-based).
function isoWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function SesiListPage() {
  const { t } = useTranslation()
  const [kelasFilter, setKelasFilter] = useState('')
  const [rangeFilter, setRangeFilter] = useState<'week' | 'month' | 'all'>('month')
  const [summaryFor, setSummaryFor] = useState<Sesi | null>(null)

  const now = new Date()
  const fromDate = useMemo(() => {
    if (rangeFilter === 'week') {
      return isoWeekStart(now).toISOString().slice(0, 10)
    }
    if (rangeFilter === 'month') {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    }
    return undefined
  }, [rangeFilter])

  const sesiQ = useQuery({
    queryKey: ['sesi-all', fromDate, kelasFilter],
    queryFn: () =>
      listSesi({
        from: fromDate,
        kelasId: kelasFilter || undefined,
      }),
  })

  const kelasQ = useQuery({
    queryKey: ['kelas'],
    queryFn: () => listKelas({}),
    staleTime: 5 * 60_000,
  })

  const kelasMap = useMemo(() => {
    const m = new Map<string, Kelas>()
    for (const k of kelasQ.data ?? []) m.set(k.id, k)
    return m
  }, [kelasQ.data])

  const sorted = useMemo(() => {
    const items = sesiQ.data ?? []
    return [...items].sort(
      (a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime(),
    )
  }, [sesiQ.data])

  const selectCls =
    'h-9 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-200 px-4 pb-3 pt-4 md:px-6 md:pt-5">
        <h1 className="text-lg font-semibold text-slate-900">{t('sesiList.title')}</h1>
        <p className="text-xs text-slate-500">{t('sesiList.subtitle')}</p>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            className={selectCls}
            value={rangeFilter}
            onChange={(e) => setRangeFilter(e.target.value as typeof rangeFilter)}
          >
            <option value="week">{t('sesiList.filter.week')}</option>
            <option value="month">{t('sesiList.filter.month')}</option>
            <option value="all">{t('sesiList.filter.all')}</option>
          </select>

          <select
            className={selectCls}
            value={kelasFilter}
            onChange={(e) => setKelasFilter(e.target.value)}
          >
            <option value="">{t('sesiList.filter.allKelas')}</option>
            {(kelasQ.data ?? []).map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto px-4 py-3 md:px-6">
        {sesiQ.isPending ? (
          <p className="py-8 text-center text-sm text-slate-500">{t('common.loading')}</p>
        ) : sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">{t('sesiList.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((sesi) => {
              const kelas = sesi.kelasId ? kelasMap.get(sesi.kelasId) : undefined
              const isLive = !!sesi.startedAt && !sesi.endedAt
              const durasi = fmtDurasi(sesi.startedAt, sesi.endedAt)

              return (
                <li key={sesi.id}>
                  <button
                    type="button"
                    className={cn(
                      'w-full rounded-lg border bg-white px-4 py-3 text-left shadow-sm transition',
                      isLive
                        ? 'border-emerald-300 hover:border-emerald-400'
                        : 'border-slate-200 hover:border-slate-300',
                      !sesi.kelasId && 'cursor-default',
                    )}
                    onClick={() => {
                      if (isLive && sesi.kelasId) return // handled by link below
                      if (sesi.kelasId) setSummaryFor(sesi)
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {isLive && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              <Radio size={10} className="animate-pulse" />
                              Live
                            </span>
                          )}
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {sesi.topik}
                          </p>
                        </div>
                        {kelas && (
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {kelas.nama}
                            {kelas.tingkat ? ` · ${kelas.tingkat}` : ''}
                            {kelas.guruName ? ` · ${kelas.guruName}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          {fmtDate(sesi.tanggal)}
                        </span>
                        {durasi && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {durasi}
                          </span>
                        )}
                      </div>
                    </div>

                    {isLive && sesi.kelasId && (
                      <div className="mt-2">
                        <Link
                          to={`/kelas/${sesi.kelasId}/sesi/${sesi.id}/live`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <Radio size={11} />
                          {t('sesiList.goLive')}
                        </Link>
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {summaryFor && (
        <EndSesiSummaryDialog
          sesi={summaryFor}
          onClose={() => setSummaryFor(null)}
          onEnded={() => setSummaryFor(null)}
        />
      )}
    </div>
  )
}
