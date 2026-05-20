import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import type { Teacher, TeacherInput } from '@/api/types'
import { ApiError } from '@/api/client'
import { Button } from './Button'
import { Input } from './Input'
import { Field } from './Field'

type FormValues = {
  name: string
  nickname?: string
  gender?: 'male' | 'female' | ''
  kelompok: string
  desa: string
  daerah: string
  joinedAt?: string
  retiredAt?: string
  status: 'active' | 'retired'
  notes?: string
}

type Props = {
  initial?: Teacher
  submitLabel: string
  pending?: boolean
  error?: unknown
  onSubmit: (input: TeacherInput) => void
  onCancel?: () => void
}

export function TeacherForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: Props) {
  const { t } = useTranslation()

  const schema = useMemo(() => {
    const isoDateOrEmpty = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, t('teachers.form.errIsoDate'))
      .optional()
      .or(z.literal(''))
    return z.object({
      name: z.string().min(1, t('teachers.form.errRequired')).max(200),
      nickname: z.string().max(200).optional().or(z.literal('')),
      gender: z.enum(['male', 'female', '']).optional(),
      kelompok: z.string().min(1, t('teachers.form.errRequired')).max(200),
      desa: z.string().min(1, t('teachers.form.errRequired')).max(200),
      daerah: z.string().min(1, t('teachers.form.errRequired')).max(200),
      joinedAt: isoDateOrEmpty,
      retiredAt: isoDateOrEmpty,
      status: z.enum(['active', 'retired']),
      notes: z.string().max(2000).optional().or(z.literal('')),
    })
  }, [t])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      nickname: initial?.nickname ?? '',
      gender: initial?.gender ?? '',
      kelompok: initial?.kelompok ?? '',
      desa: initial?.desa ?? '',
      daerah: initial?.daerah ?? '',
      joinedAt: initial?.joinedAt?.slice(0, 10) ?? '',
      retiredAt: initial?.retiredAt?.slice(0, 10) ?? '',
      status: initial?.status ?? 'active',
      notes: initial?.notes ?? '',
    },
  })

  const apiError = error instanceof ApiError ? error.message : null

  return (
    <form
      onSubmit={handleSubmit((v) =>
        onSubmit({
          name: v.name,
          nickname: v.nickname || undefined,
          gender: v.gender || undefined,
          kelompok: v.kelompok,
          desa: v.desa,
          daerah: v.daerah,
          joinedAt: v.joinedAt || undefined,
          retiredAt: v.retiredAt || undefined,
          status: v.status,
          notes: v.notes || undefined,
        }),
      )}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('teachers.form.name')} htmlFor="name" error={errors.name?.message}>
          <Input id="name" {...register('name')} />
        </Field>
        <Field label={t('teachers.form.nickname')} htmlFor="nickname" error={errors.nickname?.message}>
          <Input id="nickname" {...register('nickname')} />
        </Field>
        <Field label={t('teachers.form.gender')} htmlFor="gender" error={errors.gender?.message}>
          <select
            id="gender"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            {...register('gender')}
          >
            <option value="">—</option>
            <option value="male">{t('teachers.form.male')}</option>
            <option value="female">{t('teachers.form.female')}</option>
          </select>
        </Field>
        <Field label={t('teachers.form.kelompok')} htmlFor="kelompok" error={errors.kelompok?.message}>
          <Input id="kelompok" {...register('kelompok')} />
        </Field>
        <Field label={t('teachers.form.desa')} htmlFor="desa" error={errors.desa?.message}>
          <Input id="desa" {...register('desa')} />
        </Field>
        <Field
          label={t('teachers.form.daerah')}
          htmlFor="daerah"
          error={errors.daerah?.message}
          className="sm:col-span-2"
        >
          <Input id="daerah" {...register('daerah')} />
        </Field>
        <Field label={t('teachers.form.joinedAt')} htmlFor="joinedAt" error={errors.joinedAt?.message}>
          <Input id="joinedAt" type="date" {...register('joinedAt')} />
        </Field>
        <Field label={t('teachers.form.retiredAt')} htmlFor="retiredAt" error={errors.retiredAt?.message}>
          <Input id="retiredAt" type="date" {...register('retiredAt')} />
        </Field>
        <Field label={t('teachers.form.status')} htmlFor="status" error={errors.status?.message}>
          <select
            id="status"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            {...register('status')}
          >
            <option value="active">{t('teachers.form.statusActive')}</option>
            <option value="retired">{t('teachers.form.statusRetired')}</option>
          </select>
        </Field>
        <Field
          label={t('teachers.form.notes')}
          htmlFor="notes"
          error={errors.notes?.message}
          className="sm:col-span-2"
        >
          <textarea
            id="notes"
            rows={3}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            {...register('notes')}
          />
        </Field>
      </div>
      {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t('common.saving') : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
