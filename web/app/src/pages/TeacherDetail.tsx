import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { deleteTeacher, getTeacher, updateTeacher } from '@/api/teachers'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/Button'
import { PageShell } from '@/components/PageShell'
import { TeacherForm } from '@/components/TeacherForm'

export function TeacherDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const editFlag = params.get('edit') === '1'
  const { user } = useAuth()
  const { t } = useTranslation()
  const isAdmin = user?.role === 'admin'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(isAdmin && editFlag)

  const teacherQuery = useQuery({
    queryKey: ['teachers', id],
    queryFn: () => getTeacher(id),
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (input: Parameters<typeof updateTeacher>[1]) => updateTeacher(id, input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['teachers'] })
      setEditing(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTeacher(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['teachers'] })
      navigate('/teachers')
    },
  })

  if (teacherQuery.isPending)
    return (
      <PageShell>
        <p className="text-slate-500">{t('common.loading')}</p>
      </PageShell>
    )
  if (teacherQuery.isError || !teacherQuery.data)
    return (
      <PageShell>
        <p className="text-red-600">{t('common.loadFailed')}</p>
      </PageShell>
    )

  const tch = teacherQuery.data
  const statusLabel = tch.status === 'active' ? t('teachers.statusActive') : t('teachers.statusRetired')

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-semibold break-words">{tch.name}</h1>
      {isAdmin && !editing ? (
        <div className="flex gap-2 self-start sm:self-auto">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {t('common.edit')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm(t('common.deleteConfirm', { name: tch.name }))) {
                deleteMutation.mutate()
              }
            }}
            disabled={deleteMutation.isPending}
          >
            {t('common.delete')}
          </Button>
        </div>
      ) : null}
    </div>
  )

  return (
    <PageShell header={header}>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {editing ? (
          <TeacherForm
            initial={tch}
            submitLabel={t('common.save')}
            pending={updateMutation.isPending}
            error={updateMutation.error}
            onSubmit={(input) => updateMutation.mutate(input)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2 text-sm">
            <Row label={t('teachers.row.name')} value={tch.name} />
            <Row label={t('teachers.row.nickname')} value={tch.nickname ?? '—'} />
            <Row label={t('teachers.row.kelompok')} value={tch.kelompok} />
            <Row label={t('teachers.row.desa')} value={tch.desa} />
            <Row label={t('teachers.row.daerah')} value={tch.daerah} className="sm:col-span-2" />
            <Row label={t('teachers.row.joinedAt')} value={tch.joinedAt?.slice(0, 10) ?? '—'} />
            <Row label={t('teachers.row.retiredAt')} value={tch.retiredAt?.slice(0, 10) ?? '—'} />
            <Row label={t('teachers.row.status')} value={statusLabel} />
            <Row label={t('teachers.row.notes')} value={tch.notes ?? '—'} className="sm:col-span-2" />
          </dl>
        )}
      </div>
    </PageShell>
  )
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-900 break-words">{value}</dd>
    </div>
  )
}
