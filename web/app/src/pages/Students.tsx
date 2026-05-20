import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Grid3x3, List, Plus, Search, User as UserIcon } from 'lucide-react'

import {
  createStudent,
  deleteStudent,
  getStudent,
  listStudents,
  updateStudent,
} from '@/api/students'
import {
  STUDENT_KELOMPOKS,
  type Student,
  type StudentInput,
  type StudentKelompok,
} from '@/api/types'
import { ApiError } from '@/api/client'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { RowActions } from '@/components/RowActions'
import { Dialog } from '@/components/Dialog'
import { PhotoUploader } from '@/components/PhotoUploader'
import { StudentForm } from '@/components/StudentForm'
import { PageShell } from '@/components/PageShell'
import { ageInYears } from '@/lib/age'

const PAGE_SIZE = 20

type DialogMode = { kind: 'create' } | { kind: 'edit'; id: string } | null

export function StudentsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const statusParam = params.get('status')
  const status = statusParam === 'active' || statusParam === 'left' ? statusParam : undefined
  const kelompokParam = params.get('kelompok') ?? ''
  const kelompok = (STUDENT_KELOMPOKS as readonly string[]).includes(kelompokParam)
    ? (kelompokParam as StudentKelompok)
    : undefined
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)

  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const toast = useToast()
  const [dialog, setDialog] = useState<DialogMode>(null)
  // View mode: 'grid' (thumbnail cards) or 'list' (table). Persisted in
  // localStorage. Default 'grid' per user request.
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      const v = window.localStorage.getItem('gnrs.students.view')
      return v === 'list' ? 'list' : 'grid'
    } catch {
      return 'grid'
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem('gnrs.students.view', viewMode)
    } catch {
      /* ignore */
    }
  }, [viewMode])

  const { data, isPending } = useQuery({
    queryKey: ['students', { q, status, kelompok, page }],
    queryFn: () =>
      listStudents({ q, status, kelompok, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  })

  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['students'] })

  const deleteMutation = useMutation({
    mutationFn: deleteStudent,
    onSuccess: invalidate,
  })

  const createMut = useMutation({
    mutationFn: (input: StudentInput) => createStudent(input),
    onSuccess: (s) => {
      toast(t('students.added'), 'success')
      invalidate()
      setDialog({ kind: 'edit', id: s.id })
    },
    onError: (e) => toast(apiMsg(e, t('students.addFailed')), 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: StudentInput }) => updateStudent(id, input),
    onSuccess: () => {
      toast(t('students.updated'), 'success')
      invalidate()
      setDialog(null)
    },
    onError: (e) => toast(apiMsg(e, t('students.updateFailed')), 'error'),
  })

  const handleDelete = (s: Student) => {
    if (confirm(t('common.deleteConfirm', { name: s.name }))) {
      deleteMutation.mutate(s.id)
    }
  }

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const updateSearch = (next: { q?: string; status?: string; kelompok?: string; page?: number }) => {
    const sp = new URLSearchParams()
    if (next.q) sp.set('q', next.q)
    if (next.status) sp.set('status', next.status)
    if (next.kelompok) sp.set('kelompok', next.kelompok)
    if (next.page && next.page > 1) sp.set('page', String(next.page))
    navigate({ pathname: '/students', search: sp.toString() ? `?${sp.toString()}` : '' })
  }

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-semibold">{t('students.title')}</h1>
      <div className="flex items-center gap-2 self-start sm:self-auto">
        <div className="inline-flex rounded-md border border-slate-300 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={
              'inline-flex h-9 items-center gap-1 rounded-l-md px-3 text-sm ' +
              (viewMode === 'grid'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-50')
            }
            aria-label={t('students.viewThumb')}
            title={t('students.viewThumb')}
          >
            <Grid3x3 size={14} /> {t('students.viewThumb')}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={
              'inline-flex h-9 items-center gap-1 rounded-r-md border-l border-slate-300 px-3 text-sm ' +
              (viewMode === 'list'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-50')
            }
            aria-label={t('students.viewList')}
            title={t('students.viewList')}
          >
            <List size={14} /> {t('students.viewList')}
          </button>
        </div>
        {isAdmin ? (
          <Button onClick={() => setDialog({ kind: 'create' })}>
            <Plus size={16} className="mr-1" />
            {t('students.add')}
          </Button>
        ) : null}
      </div>
    </div>
  )

  return (
    <PageShell header={header}>
      <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          updateSearch({
            q: String(fd.get('q') ?? '') || undefined,
            status: String(fd.get('status') ?? '') || undefined,
            kelompok: String(fd.get('kelompok') ?? '') || undefined,
            page: 1,
          })
        }}
      >
        <div className="relative max-w-md flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input name="q" defaultValue={q} placeholder={t('students.searchPh')} className="pl-9" />
        </div>
        <select
          name="status"
          defaultValue={status ?? ''}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <option value="">{t('students.allStatus')}</option>
          <option value="active">{t('students.statusActive')}</option>
          <option value="left">{t('students.statusLeft')}</option>
        </select>
        <select
          name="kelompok"
          defaultValue={kelompok ?? ''}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <option value="">{t('students.allKelompok')}</option>
          {STUDENT_KELOMPOKS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="md">
          {t('common.apply')}
        </Button>
      </form>

      {viewMode === 'grid' ? (
        <div>
          {isPending ? (
            <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
              {t('common.loading')}
            </div>
          ) : data && data.items.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {data.items.map((s) => (
                <StudentThumb
                  key={s.id}
                  s={s}
                  isAdmin={isAdmin}
                  onEdit={() => setDialog({ kind: 'edit', id: s.id })}
                  onDelete={() => handleDelete(s)}
                  deleting={deleteMutation.isPending}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
              {t('students.empty')}
            </div>
          )}
        </div>
      ) : (
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 w-12"></th>
              <th className="px-4 py-2">{t('students.cols.name')}</th>
              <th className="hidden px-4 py-2 sm:table-cell">{t('students.cols.nickname')}</th>
              <th className="hidden px-4 py-2 sm:table-cell">{t('students.cols.gender')}</th>
              <th className="hidden px-4 py-2 sm:table-cell">{t('students.cols.age')}</th>
              <th className="hidden px-4 py-2 md:table-cell">{t('students.cols.level')}</th>
              <th className="hidden px-4 py-2 md:table-cell">{t('students.cols.kelompok')}</th>
              <th className="px-4 py-2">{t('students.cols.status')}</th>
              {isAdmin ? <th className="px-4 py-2 text-right">{t('common.actions')}</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isPending ? (
              <tr>
                <td colSpan={isAdmin ? 9 : 8} className="px-4 py-6 text-center text-slate-500">
                  {t('common.loading')}
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Avatar url={s.photoUrl} />
                  </td>
                  <td className="px-4 py-2">
                    <Link to={`/students/${s.id}`} className="text-slate-900 hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-2 sm:table-cell">{s.nickname ?? '—'}</td>
                  <td className="hidden px-4 py-2 sm:table-cell">
                    {s.gender === 'male' ? t('dashboard.genderMaleShort') : t('dashboard.genderFemaleShort')}
                  </td>
                  <td className="hidden px-4 py-2 sm:table-cell">
                    {(() => {
                      const age = ageInYears(s.dateOfBirth)
                      return age === null ? '—' : age
                    })()}
                  </td>
                  <td className="hidden px-4 py-2 md:table-cell">{s.level ?? '—'}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{s.kelompok ?? '—'}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={s.status} />
                  </td>
                  {isAdmin ? (
                    <td className="px-4 py-2 text-right">
                      <RowActions
                        onEdit={() => setDialog({ kind: 'edit', id: s.id })}
                        onDelete={() => handleDelete(s)}
                        deleteDisabled={deleteMutation.isPending}
                      />
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={isAdmin ? 9 : 8} className="px-4 py-6 text-center text-slate-500">
                  {t('students.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>{t('common.pagination', { page, total: totalPages, count: total })}</span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => updateSearch({ q, status, kelompok, page: Math.max(1, page - 1) })}
          >
            {t('common.previous')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => updateSearch({ q, status, kelompok, page: Math.min(totalPages, page + 1) })}
          >
            {t('common.next')}
          </Button>
        </div>
      </div>

      {dialog?.kind === 'create' ? (
        <Dialog title={t('students.add')} onClose={() => setDialog(null)} size="lg">
          <StudentForm
            submitLabel={createMut.isPending ? t('common.saving') : t('common.save')}
            pending={createMut.isPending}
            error={createMut.error}
            onSubmit={(input) => createMut.mutate(input)}
            onCancel={() => setDialog(null)}
          />
        </Dialog>
      ) : null}

      {dialog?.kind === 'edit' ? (
        <StudentEditDialog
          id={dialog.id}
          pending={updateMut.isPending}
          error={updateMut.error}
          onSubmit={(input) => updateMut.mutate({ id: dialog.id, input })}
          onClose={() => setDialog(null)}
          onPhotoChanged={invalidate}
        />
      ) : null}
      </div>
    </PageShell>
  )
}

function StudentEditDialog({
  id,
  pending,
  error,
  onSubmit,
  onClose,
  onPhotoChanged,
}: {
  id: string
  pending: boolean
  error: unknown
  onSubmit: (input: StudentInput) => void
  onClose: () => void
  onPhotoChanged: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data, isPending } = useQuery({
    queryKey: ['students', 'detail', id],
    queryFn: () => getStudent(id),
  })

  return (
    <Dialog
      title={data ? t('students.editWithName', { name: data.name }) : t('students.edit')}
      onClose={onClose}
      size="lg"
    >
      {isPending ? (
        <div className="py-6 text-center text-slate-500">{t('common.loading')}</div>
      ) : data ? (
        <div className="space-y-4">
          <PhotoUploader
            userId={data.id}
            photoUrl={data.photoUrl ?? null}
            onChanged={() => {
              qc.invalidateQueries({ queryKey: ['students', 'detail', id] })
              onPhotoChanged()
            }}
          />
          <StudentForm
            initial={data}
            submitLabel={pending ? t('common.saving') : t('common.save')}
            pending={pending}
            error={error}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        </div>
      ) : (
        <div className="py-6 text-center text-red-600">{t('common.dataNotFound')}</div>
      )}
    </Dialog>
  )
}

function apiMsg(e: unknown, fallback: string) {
  if (e instanceof ApiError) return e.message || fallback
  return fallback
}

function Avatar({ url }: { url?: string | null }) {
  return (
    <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserIcon size={16} className="text-slate-300" />
      )}
    </div>
  )
}

function StudentThumb({
  s,
  isAdmin,
  onEdit,
  onDelete,
  deleting,
}: {
  s: Student
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const { t } = useTranslation()
  const age = ageInYears(s.dateOfBirth)
  return (
    <div className="group relative flex flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md">
      <Link to={`/students/${s.id}`} className="flex flex-col items-center text-center">
        <div className="mb-2 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
          {s.photoUrl ? (
            <img src={s.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserIcon size={32} className="text-slate-300" />
          )}
        </div>
        <div className="line-clamp-2 text-sm font-semibold text-slate-900">{s.name}</div>
        <div className="mt-0.5 text-xs text-slate-500">
          {s.nickname ? s.nickname + ' · ' : ''}
          {age !== null ? t('students.ageShort', { count: age }) : '—'}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1 text-[10px] text-slate-500">
          {s.kelompok ? (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5">{s.kelompok}</span>
          ) : null}
          {s.level ? (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5">{s.level}</span>
          ) : null}
        </div>
        <div className="mt-1.5">
          <StatusPill status={s.status} />
        </div>
      </Link>
      {isAdmin ? (
        <div className="absolute right-1 top-1 opacity-0 transition group-hover:opacity-100">
          <RowActions onEdit={onEdit} onDelete={onDelete} deleteDisabled={deleting} />
        </div>
      ) : null}
    </div>
  )
}

function StatusPill({ status }: { status: 'active' | 'left' }) {
  const { t } = useTranslation()
  if (status === 'active') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        {t('students.statusActive')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
      {t('students.statusLeft')}
    </span>
  )
}
