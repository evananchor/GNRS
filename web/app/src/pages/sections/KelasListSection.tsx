import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { ChevronDown, ChevronRight, Pencil, Play, Plus, Radio, RotateCcw, Square, Trash2, Users } from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  addAnggota,
  createKelas,
  deleteKelas,
  listKelas,
  updateKelas,
  type Kelas,
  type KelasInput,
} from '@/api/kelas'
import { listTingkat } from '@/api/kurikulum'
import { deleteSesi, listSesi, startSesi, type Sesi } from '@/api/sesi'
import { listStudents } from '@/api/students'
import { listUsers } from '@/api/users'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { KelasAnggotaDialog } from '@/components/KelasAnggotaDialog'
import { PageShell } from '@/components/PageShell'
import { RescheduleSesiDialog } from '@/components/RescheduleSesiDialog'
import { EndSesiSummaryDialog } from '@/components/EndSesiSummaryDialog'
import { SesiFormDialog } from '@/components/SesiFormDialog'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'

/**
 * KelasListSection — porting sitrac-v3's `Kelas.tsx` accordion layout. Each
 * kelas card is collapsible; expanded view shows its sesi grouped by status
 * (upcoming/ongoing/completed/missed). Admins can CRUD kelas via dialogs.
 */

type Status = 'upcoming' | 'ongoing' | 'completed' | 'missed'

const STATUS_DOT: Record<Status, string> = {
  upcoming: 'bg-sky-500',
  ongoing: 'bg-amber-500',
  completed: 'bg-emerald-500',
  missed: 'bg-rose-500',
}

function localDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}

function statusOf(s: Sesi, today: Date): Status {
  if (s.endedAt) return 'completed'
  if (s.startedAt) return 'ongoing'
  const iso = (s.tanggal || '').slice(0, 10)
  if (iso && iso < localDate(today)) return 'missed'
  return 'upcoming'
}

// -----------------------------------------------------------------------

export function KelasListSection() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const toast = useToast()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const [dialog, setDialog] = useState<
    | { kind: 'create' }
    | { kind: 'edit'; kelas: Kelas }
    | { kind: 'anggota'; kelas: Kelas }
    | null
  >(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const { data: list = [], isPending } = useQuery({
    queryKey: ['kelas'],
    queryFn: () => listKelas({}),
  })

  // Split into "kelas saya" (where current user is one of the guru) and the
  // rest. Uses the kelas_guru join (k.guruUserIds), so a kelas with multiple
  // guru shows up for each of them. Empty for non-guru users.
  const isMine = (k: Kelas) => Boolean(user?.id) && (k.guruUserIds ?? []).includes(user!.id)
  const myKelas = useMemo(() => list.filter(isMine), [list, user?.id])
  const otherKelas = useMemo(() => list.filter((k) => !isMine(k)), [list, user?.id])
  const [showAll, setShowAll] = useState(false)

  const deleteMut = useMutation({
    mutationFn: deleteKelas,
    onSuccess: () => {
      toast(t('kelasSection.list.kelasDeleted'), 'success')
      qc.invalidateQueries({ queryKey: ['kelas'] })
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.list.kelasDeleteFailed'), 'error'),
  })

  const handleDelete = (k: Kelas) => {
    if (confirm(t('kelasSection.list.confirmDelete', { nama: k.nama }))) {
      deleteMut.mutate(k.id)
    }
  }

  return (
    <PageShell>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {isPending ? t('common.loading') : t('kelasSection.list.countRegistered', { count: list.length })}
        </p>
        {isAdmin ? (
          <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
            <Plus size={16} className="mr-1" /> {t('kelasSection.list.addKelas')}
          </Button>
        ) : null}
      </div>

      {!isPending && list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <p className="text-base font-semibold text-slate-700">{t('kelasSection.list.emptyTitle')}</p>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin
              ? t('kelasSection.list.emptyHintAdmin')
              : t('kelasSection.list.emptyHintUser')}
          </p>
        </div>
      ) : null}

      <div className="space-y-5">
        {myKelas.length > 0 ? (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('kelasSection.list.myKelas')}
            </h3>
            <div className="space-y-3">
              {myKelas.map((k) => (
                <KelasCard
                  key={k.id}
                  kelas={k}
                  open={openId === k.id}
                  onToggle={() => setOpenId(openId === k.id ? null : k.id)}
                  isAdmin={isAdmin}
                  onEdit={() => setDialog({ kind: 'edit', kelas: k })}
                  onDelete={() => handleDelete(k)}
                  onAnggota={() => setDialog({ kind: 'anggota', kelas: k })}
                />
              ))}
            </div>
          </section>
        ) : null}

        {otherKelas.length > 0 ? (
          <section>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mb-2 flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-50"
              aria-expanded={showAll}
            >
              <span>
                {t('kelasSection.list.allKelas')}{' '}
                <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">
                  {otherKelas.length}
                </span>
              </span>
              {showAll ? (
                <ChevronDown size={14} className="text-slate-500" />
              ) : (
                <ChevronRight size={14} className="text-slate-500" />
              )}
            </button>
            {showAll ? (
              <div className="space-y-3">
                {otherKelas.map((k) => (
                  <KelasCard
                    key={k.id}
                    kelas={k}
                    open={openId === k.id}
                    onToggle={() => setOpenId(openId === k.id ? null : k.id)}
                    isAdmin={isAdmin}
                    onEdit={() => setDialog({ kind: 'edit', kelas: k })}
                    onDelete={() => handleDelete(k)}
                    onAnggota={() => setDialog({ kind: 'anggota', kelas: k })}
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      {dialog?.kind === 'create' ? (
        <KelasFormDialog onClose={() => setDialog(null)} onSaved={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <KelasFormDialog
          kelas={dialog.kelas}
          onClose={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'anggota' ? (
        <KelasAnggotaDialog
          kelasId={dialog.kelas.id}
          kelasNama={dialog.kelas.nama}
          tingkat={dialog.kelas.tingkat}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </PageShell>
  )
}

// -----------------------------------------------------------------------

function KelasCard({
  kelas: k,
  open,
  onToggle,
  isAdmin,
  onEdit,
  onDelete,
  onAnggota,
}: {
  kelas: Kelas
  open: boolean
  onToggle: () => void
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
  onAnggota: () => void
}) {
  const today = useMemo(() => new Date(), [open])
  const [rescheduling, setRescheduling] = useState<Sesi | null>(null)
  const [editingSesi, setEditingSesi] = useState<Sesi | null>(null)
  const [endingSesi, setEndingSesi] = useState<Sesi | null>(null)
  const [reviewingSesi, setReviewingSesi] = useState<Sesi | null>(null)
  const [addingSesi, setAddingSesi] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()
  const { t } = useTranslation()
  const STATUS_LABEL: Record<Status, string> = {
    upcoming: t('kelasSection.status.upcoming'),
    ongoing: t('kelasSection.status.ongoing'),
    completed: t('kelasSection.status.completed'),
    missed: t('kelasSection.status.missed'),
  }
  const invalidateSesi = () => {
    qc.invalidateQueries({ queryKey: ['kelas-sesi', k.id] })
    qc.invalidateQueries({ queryKey: ['sesi'] })
  }
  const startMut = useMutation({
    mutationFn: startSesi,
    onSuccess: () => {
      toast(t('kelasSection.list.sesiStarted'), 'success')
      invalidateSesi()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.list.sesiStartFailed'), 'error'),
  })
  const delMut = useMutation({
    mutationFn: deleteSesi,
    onSuccess: () => {
      toast(t('kelasSection.list.sesiDeleted'), 'success')
      invalidateSesi()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.list.sesiDeleteFailed'), 'error'),
  })
  const { data: sesiList = [], isLoading } = useQuery({
    queryKey: ['kelas-sesi', k.id],
    queryFn: () => listSesi({ kelasId: k.id } as any),
    enabled: open,
  })

  const buckets = useMemo(() => {
    const out: Record<Status, Sesi[]> = { ongoing: [], upcoming: [], completed: [], missed: [] }
    for (const s of sesiList) out[statusOf(s, today)].push(s)
    out.upcoming.sort((a, b) => a.tanggal.localeCompare(b.tanggal))
    out.completed.sort((a, b) => b.tanggal.localeCompare(a.tanggal))
    out.missed.sort((a, b) => b.tanggal.localeCompare(a.tanggal))
    return out
  }, [sesiList, today])

  const counts = {
    upcoming: buckets.upcoming.length,
    ongoing: buckets.ongoing.length,
    completed: buckets.completed.length,
    missed: buckets.missed.length,
    total: sesiList.length,
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 transition',
          open ? 'bg-slate-50' : 'hover:bg-slate-50',
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-3 text-left"
          aria-expanded={open}
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-sky-50 text-lg">
            🏫
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold text-slate-900">{k.nama}</div>
            <div className="truncate text-xs text-slate-500">
              {k.guruName
                ? t('kelasSection.list.cardSubtitleWithWali', {
                    tingkat: k.tingkat,
                    tahun: k.tahun,
                    wali: k.guruName,
                  })
                : t('kelasSection.list.cardSubtitle', {
                    tingkat: k.tingkat,
                    tahun: k.tahun,
                  })}
            </div>
          </div>
          {open ? (
            <ChevronDown size={18} className="text-slate-400" />
          ) : (
            <ChevronRight size={18} className="text-slate-400" />
          )}
        </button>
        {isAdmin ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onAnggota}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label={t('kelasSection.list.manageAnggota')}
              title={t('kelasSection.list.manageAnggota')}
            >
              <Users size={16} />
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label={t('kelasSection.list.editKelas')}
              title={t('kelasSection.list.editKelas')}
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
              aria-label={t('kelasSection.list.deleteKelas')}
              title={t('kelasSection.list.deleteKelas')}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="border-t border-slate-200 px-4 py-3">
          {isAdmin ? (
            <div className="mb-3 flex justify-end">
              <Button size="sm" onClick={() => setAddingSesi(true)}>
                <Plus size={14} className="mr-1" /> {t('kelasSection.list.addSesi')}
              </Button>
            </div>
          ) : null}
          {isLoading ? (
            <p className="text-sm text-slate-500">{t('kelasSection.list.loadingSesi')}</p>
          ) : counts.total === 0 ? (
            <p className="text-sm text-slate-500">{t('kelasSection.list.noSesi')}</p>
          ) : (
            <div className="space-y-3">
              {(['ongoing', 'upcoming', 'missed', 'completed'] as Status[]).map((st) =>
                buckets[st].length > 0 ? (
                  <div key={st}>
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span className={cn('inline-block h-2 w-2 rounded-full', STATUS_DOT[st])} />
                      {STATUS_LABEL[st]}
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700">
                        {buckets[st].length}
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                      {buckets[st].map((s) => {
                        const canResched = isAdmin && !s.endedAt && (st === 'upcoming' || st === 'missed' || st === 'ongoing')
                        return (
                          <li key={s.id} className="flex items-center gap-1.5 px-3 py-2">
                            {s.endedAt ? (
                              <button
                                type="button"
                                onClick={() => setReviewingSesi(s)}
                                className="min-w-0 flex-1 cursor-pointer text-left transition hover:opacity-75"
                                title={t('kelasSection.list.reviewSummary')}
                              >
                                <div className="text-sm font-medium text-slate-900 underline decoration-dotted underline-offset-2">
                                  {s.topik}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {s.tanggal}
                                  {s.mulai ? ` · ${s.mulai}${s.selesai ? `–${s.selesai}` : ''}` : ''}
                                </div>
                              </button>
                            ) : (
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-slate-900">{s.topik}</div>
                                <div className="text-xs text-slate-500">
                                  {s.tanggal}
                                  {s.mulai ? ` · ${s.mulai}${s.selesai ? `–${s.selesai}` : ''}` : ''}
                                </div>
                              </div>
                            )}
                            {isAdmin ? (
                              <>
                                {!s.startedAt ? (
                                  <button
                                    type="button"
                                    onClick={() => startMut.mutate(s.id)}
                                    disabled={startMut.isPending}
                                    className="rounded-md p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                                    aria-label={t('kelasSection.list.startSesi')}
                                    title={t('kelasSection.list.startSesi')}
                                  >
                                    <Play size={14} />
                                  </button>
                                ) : !s.endedAt ? (
                                  <>
                                    <Link
                                      to={`/kelas/${s.kelasId ?? k.id}/sesi/${s.id}/live`}
                                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                                      aria-label={t('kelasSection.list.liveStage')}
                                      title={t('kelasSection.list.openLive')}
                                    >
                                      <span className="relative flex h-2 w-2">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                                      </span>
                                      <Radio size={13} />
                                      Live
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={() => setEndingSesi(s)}
                                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-700"
                                      aria-label={t('kelasSection.list.endSesi')}
                                      title={t('kelasSection.list.endSesi')}
                                    >
                                      <Square size={14} />
                                    </button>
                                  </>
                                ) : null}
                                {canResched ? (
                                  <button
                                    type="button"
                                    onClick={() => setRescheduling(s)}
                                    className="rounded-md p-1.5 text-slate-400 transition hover:bg-sky-50 hover:text-sky-700"
                                    aria-label={t('kelasSection.list.reschedule')}
                                    title={t('kelasSection.list.reschedule')}
                                  >
                                    <RotateCcw size={14} />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => setEditingSesi(s)}
                                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                                  aria-label={t('common.edit')}
                                  title={t('common.edit')}
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(t('kelasSection.list.confirmDeleteSesi', { topik: s.topik }))) delMut.mutate(s.id)
                                  }}
                                  disabled={delMut.isPending}
                                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                                  aria-label={t('common.delete')}
                                  title={t('common.delete')}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </div>
      ) : null}

      {rescheduling ? (
        <RescheduleSesiDialog
          sesi={rescheduling}
          tingkat={k.tingkat}
          onClose={() => setRescheduling(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['kelas-sesi', k.id] })
            qc.invalidateQueries({ queryKey: ['sesi'] })
            setRescheduling(null)
          }}
        />
      ) : null}

      {addingSesi ? (
        <SesiFormDialog
          mode="create"
          defaults={{ kelasId: k.id, defaultTingkat: k.tingkat }}
          onClose={() => setAddingSesi(false)}
          onSaved={() => {
            invalidateSesi()
            setAddingSesi(false)
          }}
        />
      ) : null}

      {editingSesi ? (
        <SesiFormDialog
          mode="edit"
          sesi={editingSesi}
          onClose={() => setEditingSesi(null)}
          onSaved={() => {
            invalidateSesi()
            setEditingSesi(null)
          }}
        />
      ) : null}

      {endingSesi ? (
        <EndSesiSummaryDialog
          sesi={endingSesi}
          onClose={() => setEndingSesi(null)}
          onEnded={() => {
            invalidateSesi()
            setEndingSesi(null)
          }}
        />
      ) : null}

      {reviewingSesi ? (
        <EndSesiSummaryDialog
          sesi={reviewingSesi}
          onClose={() => setReviewingSesi(null)}
          onEnded={() => {
            invalidateSesi()
            setReviewingSesi(null)
          }}
        />
      ) : null}
    </div>
  )
}

// -----------------------------------------------------------------------

type FormValues = {
  nama: string
  tingkat: string
  tahun: number
  deskripsi?: string
}

// Compute integer age (years) from an ISO YYYY-MM-DD date string.
function ageFromDob(dob?: string): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

// Pick the most appropriate tingkat for a murid: first try umur-based match
// (smallest tingkat.umur >= age), then fall back to a fuzzy level-name match.
function matchTingkatForMurid(
  m: { dateOfBirth?: string; level?: string } | undefined,
  tingkatList: { id: string; nama: string; urutan: number; umur?: number | null }[],
): { id: string; nama: string } | undefined {
  if (!m || tingkatList.length === 0) return undefined
  const age = ageFromDob(m.dateOfBirth)
  if (age != null) {
    const withUmur = tingkatList.filter((t) => t.umur != null) as {
      id: string
      nama: string
      umur: number
    }[]
    if (withUmur.length > 0) {
      const eligible = withUmur
        .filter((t) => t.umur >= age)
        .sort((a, b) => a.umur - b.umur)
      if (eligible[0]) return eligible[0]
      // age above all tingkat — pick the largest umur bucket.
      const sortedDesc = [...withUmur].sort((a, b) => b.umur - a.umur)
      return sortedDesc[0]
    }
  }
  if (m.level) {
    const lvl = m.level.toLowerCase()
    return tingkatList.find(
      (t) =>
        t.nama.toLowerCase() === lvl ||
        t.nama.toLowerCase().includes(lvl) ||
        lvl.includes(t.nama.toLowerCase()),
    )
  }
  return undefined
}

function KelasFormDialog({
  kelas,
  onClose,
  onSaved,
}: {
  kelas?: Kelas
  onClose: () => void
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const { t } = useTranslation()
  const isCreate = !kelas
  // Build the validation schema fresh per locale so error messages
  // localize when the user flips the language switch.
  const schema = useMemo(
    () =>
      z.object({
        nama: z.string().min(1, t('kelasSection.list.form.errRequired')).max(200),
        tingkat: z.string().min(1, t('kelasSection.list.form.errRequired')).max(100),
        tahun: z.coerce.number().int().gte(2000).lte(2200),
        deskripsi: z.string().optional().or(z.literal('')),
      }),
    [t],
  )
  const { data: tingkatList = [] } = useQuery({
    queryKey: ['tingkat'],
    queryFn: listTingkat,
    staleTime: 5 * 60_000,
  })
  const { data: gurus } = useQuery({
    queryKey: ['users', 'role-guru'],
    queryFn: () => listUsers({ role: 'guru', active: true, limit: 200 }),
    staleTime: 60_000,
  })
  const guruOptions = gurus?.items ?? []

  const [muridSearch, setMuridSearch] = useState('')
  const { data: studentsRes } = useQuery({
    queryKey: ['students-pick', { q: muridSearch }],
    queryFn: () => listStudents({ q: muridSearch, status: 'active', limit: 200, offset: 0 }),
    enabled: isCreate,
    staleTime: 30_000,
  })
  const muridOptions = studentsRes?.items ?? []

  const [pickedGuru, setPickedGuru] = useState<string[]>(
    () => kelas?.guruUserIds ?? (kelas?.guruUserId ? [kelas.guruUserId] : []),
  )
  const toggleGuru = (id: string) =>
    setPickedGuru((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const [pickedMurid, setPickedMurid] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nama: kelas?.nama ?? '',
      tingkat: kelas?.tingkat ?? '',
      tahun: kelas?.tahun ?? new Date().getFullYear(),
      deskripsi: kelas?.deskripsi ?? '',
    },
  })

  const muridById = useMemo(() => {
    const m: Record<string, (typeof muridOptions)[number]> = {}
    for (const s of muridOptions) m[s.id] = s
    return m
  }, [muridOptions])

  const toggleMurid = (id: string) => {
    setPickedMurid((cur) => {
      const adding = !cur.includes(id)
      const next = adding ? [...cur, id] : cur.filter((x) => x !== id)
      if (adding) {
        const m = muridById[id]
        const t = matchTingkatForMurid(m, tingkatList)
        if (t) setValue('tingkat', t.nama, { shouldValidate: true, shouldDirty: true })
      }
      return next
    })
  }

  const mut = useMutation({
    mutationFn: async (input: KelasInput) => {
      const saved = kelas ? await updateKelas(kelas.id, input) : await createKelas(input)
      if (isCreate && pickedMurid.length > 0) {
        try {
          await addAnggota(saved.id, pickedMurid)
        } catch (e) {
          toast(
            e instanceof ApiError
              ? t('kelasSection.list.form.addMuridPartialFail', { message: e.message })
              : t('kelasSection.list.form.addMuridFailed'),
            'error',
          )
        }
      }
      return saved
    },
    onSuccess: () => {
      toast(kelas ? t('kelasSection.list.form.kelasUpdated') : t('kelasSection.list.form.kelasAdded'), 'success')
      qc.invalidateQueries({ queryKey: ['kelas'] })
      onSaved()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.list.form.saveFailed'), 'error'),
  })

  return (
    <Dialog title={kelas ? t('kelasSection.list.form.titleEdit') : t('kelasSection.list.form.titleAdd')} onClose={onClose} size="lg">
      <form
        onSubmit={handleSubmit((v) =>
          mut.mutate({
            nama: v.nama.trim(),
            tingkat: v.tingkat,
            tahun: v.tahun,
            deskripsi: v.deskripsi?.trim() || null,
            guruUserId: pickedGuru[0] ?? null,
            guruUserIds: pickedGuru,
          }),
        )}
        className="space-y-4"
      >
        <Field label={t('kelasSection.list.form.nama')} htmlFor="kelas-nama" error={errors.nama?.message}>
          <Input id="kelas-nama" autoFocus {...register('nama')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('kelasSection.list.form.tingkat')} htmlFor="kelas-tingkat" error={errors.tingkat?.message}>
            <select
              id="kelas-tingkat"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              {...register('tingkat')}
            >
              <option value="">{t('common.selectPrompt')}</option>
              {tingkatList.map((tk) => (
                <option key={tk.id} value={tk.nama}>
                  {tk.nama}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('kelasSection.list.form.tahun')} htmlFor="kelas-tahun" error={errors.tahun?.message}>
            <Input
              id="kelas-tahun"
              type="number"
              min={2000}
              max={2200}
              {...register('tahun', { valueAsNumber: true })}
            />
          </Field>
        </div>
        <Field
          label={t('kelasSection.list.form.guru')}
          htmlFor="kelas-guru"
          hint={t('kelasSection.list.form.guruHint')}
        >
          <div className="max-h-44 overflow-y-auto rounded-md border border-slate-300 bg-white">
            {guruOptions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-500">
                {t('kelasSection.list.form.guruEmpty')}
              </p>
            ) : (
              guruOptions.map((g) => {
                const checked = pickedGuru.includes(g.id)
                const isPrimary = pickedGuru[0] === g.id
                return (
                  <label
                    key={g.id}
                    className={
                      'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition ' +
                      (checked ? 'bg-sky-50' : 'hover:bg-slate-50')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleGuru(g.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="flex-1 truncate">{g.name}</span>
                    {isPrimary ? (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        {t('kelasSection.list.form.guruWali')}
                      </span>
                    ) : null}
                  </label>
                )
              })
            )}
          </div>
        </Field>
        {isCreate ? (
          <Field
            label={t('kelasSection.list.form.muridLabel', { count: pickedMurid.length })}
            htmlFor="kelas-murid"
            hint={t('kelasSection.list.form.muridHint')}
          >
            <Input
              id="kelas-murid"
              placeholder={t('kelasSection.list.form.muridSearchPh')}
              value={muridSearch}
              onChange={(e) => setMuridSearch(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-56 overflow-y-auto rounded-md border border-slate-300 bg-white">
              {muridOptions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-500">
                  {muridSearch ? t('kelasSection.list.form.muridNoMatch') : t('kelasSection.list.form.muridEmpty')}
                </p>
              ) : (
                muridOptions.map((s) => {
                  const checked = pickedMurid.includes(s.id)
                  return (
                    <label
                      key={s.id}
                      className={
                        'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition ' +
                        (checked ? 'bg-sky-50' : 'hover:bg-slate-50')
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMurid(s.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <span className="flex-1 truncate">
                        {s.name}
                        {s.nickname ? (
                          <span className="ml-1 text-xs text-slate-500">({s.nickname})</span>
                        ) : null}
                      </span>
                      {s.level ? (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          {s.level}
                        </span>
                      ) : null}
                    </label>
                  )
                })
              )}
            </div>
          </Field>
        ) : null}
        <Field label={t('kelasSection.list.form.deskripsi')} htmlFor="kelas-deskripsi">
          <Input id="kelas-deskripsi" {...register('deskripsi')} />
        </Field>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mut.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
