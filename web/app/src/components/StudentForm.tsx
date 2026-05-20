import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import {
  STUDENT_KELOMPOKS,
  STUDENT_LEVELS,
  type Student,
  type StudentInput,
} from '@/api/types'
import { ApiError } from '@/api/client'
import { Button } from './Button'
import { Input } from './Input'
import { Field } from './Field'

type FormValues = {
  name: string
  nickname?: string
  dateOfBirth?: string
  gender: 'male' | 'female'
  level: string
  kelompok: string
  joinedAt?: string
  leftAt?: string
  leaveReason?: string
  status: 'active' | 'left'
  parentName?: string
  parentPhone?: string
  parentEmail?: string
}

type Props = {
  initial?: Student
  submitLabel: string
  pending?: boolean
  error?: unknown
  onSubmit: (input: StudentInput) => void
  onCancel?: () => void
}

export function StudentForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: Props) {
  const { t } = useTranslation()

  // Build the validation schema fresh per locale so error messages
  // localize when the user flips the language switch.
  const schema = useMemo(() => {
    const isoDateOrEmpty = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, t('students.form.errIsoDate'))
      .optional()
      .or(z.literal(''))
    return z.object({
      name: z.string().min(1, t('students.form.errRequired')).max(200),
      nickname: z.string().max(200).optional().or(z.literal('')),
      dateOfBirth: isoDateOrEmpty,
      gender: z.enum(['male', 'female']),
      level: z.enum([...STUDENT_LEVELS, ''] as [string, ...string[]]),
      kelompok: z.enum([...STUDENT_KELOMPOKS, ''] as [string, ...string[]]),
      joinedAt: isoDateOrEmpty,
      leftAt: isoDateOrEmpty,
      leaveReason: z.string().max(500).optional().or(z.literal('')),
      status: z.enum(['active', 'left']),
      parentName: z.string().max(200).optional().or(z.literal('')),
      parentPhone: z.string().max(64).optional().or(z.literal('')),
      parentEmail: z.string().email(t('students.form.errEmail')).optional().or(z.literal('')),
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
      dateOfBirth: initial?.dateOfBirth?.slice(0, 10) ?? '',
      gender: initial?.gender ?? 'female',
      level: (initial?.level as FormValues['level']) ?? '',
      kelompok: (initial?.kelompok as FormValues['kelompok']) ?? '',
      joinedAt: initial?.joinedAt?.slice(0, 10) ?? '',
      leftAt: initial?.leftAt?.slice(0, 10) ?? '',
      leaveReason: initial?.leaveReason ?? '',
      status: initial?.status ?? 'active',
      parentName: initial?.parentName ?? '',
      parentPhone: initial?.parentPhone ?? '',
      parentEmail: initial?.parentEmail ?? '',
    },
  })

  const apiError = error instanceof ApiError ? error.message : null

  return (
    <form
      onSubmit={handleSubmit((v) =>
        onSubmit({
          name: v.name,
          nickname: v.nickname || undefined,
          dateOfBirth: v.dateOfBirth || undefined,
          gender: v.gender,
          level: v.level === '' ? undefined : (v.level as StudentInput['level']),
          kelompok: v.kelompok === '' ? undefined : (v.kelompok as StudentInput['kelompok']),
          joinedAt: v.joinedAt || undefined,
          leftAt: v.leftAt || undefined,
          leaveReason: v.leaveReason || undefined,
          status: v.status,
          parentName: v.parentName || undefined,
          parentPhone: v.parentPhone || undefined,
          parentEmail: v.parentEmail || undefined,
        }),
      )}
      className="space-y-6"
    >
      <Section title={t('students.form.secData')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('students.form.name')} htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register('name')} />
          </Field>
          <Field label={t('students.form.nickname')} htmlFor="nickname" error={errors.nickname?.message}>
            <Input id="nickname" {...register('nickname')} />
          </Field>
          <Field label={t('students.form.birthDate')} htmlFor="dateOfBirth" error={errors.dateOfBirth?.message}>
            <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
          </Field>
          <Field label={t('students.form.gender')} htmlFor="gender" error={errors.gender?.message}>
            <Select id="gender" {...register('gender')}>
              <option value="female">{t('students.form.female')}</option>
              <option value="male">{t('students.form.male')}</option>
            </Select>
          </Field>
          <Field label={t('students.form.level')} htmlFor="level" error={errors.level?.message}>
            <Select id="level" {...register('level')}>
              <option value="">—</option>
              {STUDENT_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t('students.form.kelompok')}
            htmlFor="kelompok"
            error={errors.kelompok?.message}
            className="sm:col-span-2"
          >
            <Select id="kelompok" {...register('kelompok')}>
              <option value="">—</option>
              {STUDENT_KELOMPOKS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      <Section title={t('students.form.secMember')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('students.form.joinedAt')} htmlFor="joinedAt" error={errors.joinedAt?.message}>
            <Input id="joinedAt" type="date" {...register('joinedAt')} />
          </Field>
          <Field label={t('students.form.status')} htmlFor="status" error={errors.status?.message}>
            <Select id="status" {...register('status')}>
              <option value="active">{t('students.form.statusActive')}</option>
              <option value="left">{t('students.form.statusLeft')}</option>
            </Select>
          </Field>
          <Field label={t('students.form.leftAt')} htmlFor="leftAt" error={errors.leftAt?.message}>
            <Input id="leftAt" type="date" {...register('leftAt')} />
          </Field>
          <Field
            label={t('students.form.leaveReason')}
            htmlFor="leaveReason"
            error={errors.leaveReason?.message}
            className="sm:col-span-2"
          >
            <Input id="leaveReason" {...register('leaveReason')} />
          </Field>
        </div>
      </Section>

      <Section title={t('students.form.secParent')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('students.form.parentName')} htmlFor="parentName" error={errors.parentName?.message}>
            <Input id="parentName" {...register('parentName')} />
          </Field>
          <Field
            label={t('students.form.parentPhone')}
            htmlFor="parentPhone"
            error={errors.parentPhone?.message}
          >
            <Input id="parentPhone" {...register('parentPhone')} />
          </Field>
          <Field
            label={t('students.form.parentEmail')}
            htmlFor="parentEmail"
            error={errors.parentEmail?.message}
            className="sm:col-span-2"
          >
            <Input id="parentEmail" type="email" {...register('parentEmail')} />
          </Field>
        </div>
      </Section>

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-slate-700">{title}</legend>
      {children}
    </fieldset>
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    />
  )
}
