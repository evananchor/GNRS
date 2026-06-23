import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { getMurid, updateMurid } from '@/api/murid'
import { STUDENT_LEVELS, type StudentLevel } from '@/api/users'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { OrtuPicker } from '@/components/OrtuPicker'
import { useToast } from '@/lib/toast'

type FormValues = {
  name: string
  nickname: string
  noHp: string
  alamat: string
  level: string
  dateOfBirth: string
  tempatLahir: string
  notes: string
}

export function MuridEditDialog({
  muridId,
  kelasId,
  onClose,
}: {
  muridId: string
  kelasId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()

  const { data: murid, isPending } = useQuery({
    queryKey: ['murid', muridId],
    queryFn: () => getMurid(muridId),
  })

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, t('common.required')).max(200),
        nickname: z.string().max(100).optional().or(z.literal('')),
        noHp: z.string().max(30).optional().or(z.literal('')),
        alamat: z.string().max(500).optional().or(z.literal('')),
        level: z.string().optional().or(z.literal('')),
        dateOfBirth: z.string().optional().or(z.literal('')),
        tempatLahir: z.string().max(200).optional().or(z.literal('')),
        notes: z.string().max(2000).optional().or(z.literal('')),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: murid
      ? {
          name: murid.name ?? '',
          nickname: murid.nickname ?? '',
          noHp: murid.noHp ?? '',
          alamat: murid.alamat ?? '',
          level: murid.level ?? '',
          dateOfBirth: murid.dateOfBirth ?? '',
          tempatLahir: murid.tempatLahir ?? '',
          notes: murid.notes ?? '',
        }
      : undefined,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['murid', muridId] })
    qc.invalidateQueries({ queryKey: ['kelas-anggota', kelasId] })
  }

  const saveMut = useMutation({
    mutationFn: (values: FormValues) =>
      updateMurid(muridId, {
        name: values.name,
        nickname: values.nickname || undefined,
        noHp: values.noHp || undefined,
        alamat: values.alamat || undefined,
        level: (values.level as StudentLevel | '') || undefined,
        dateOfBirth: values.dateOfBirth || undefined,
        tempatLahir: values.tempatLahir || undefined,
        notes: values.notes || undefined,
      }),
    onSuccess: () => {
      toast(t('users.updateToast'), 'success')
      invalidate()
    },
    onError: (e) =>
      toast(e instanceof ApiError ? e.message : t('users.updateFailed'), 'error'),
  })

  const ortuMut = useMutation({
    mutationFn: (input: Parameters<typeof updateMurid>[1]) => updateMurid(muridId, input),
    onSuccess: () => {
      invalidate()
    },
    onError: (e) =>
      toast(e instanceof ApiError ? e.message : t('users.updateFailed'), 'error'),
  })

  const ayahLink = murid?.ortu?.find((o) => o.relation === 'ayah')
  const ibuLink = murid?.ortu?.find((o) => o.relation === 'ibu')

  return (
    <Dialog
      title={murid ? murid.name : t('common.loading')}
      onClose={onClose}
      size="md"
    >
      {isPending ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : (
        <form
          onSubmit={handleSubmit((v) => saveMut.mutate(v))}
          className="space-y-4"
        >
          {/* Profile fields */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t('users.userDetail.profil.fullName')}
              htmlFor="med-name"
              error={errors.name?.message}
              className="col-span-2"
            >
              <Input id="med-name" {...register('name')} />
            </Field>

            <Field
              label={t('users.userDetail.profil.nickname')}
              htmlFor="med-nickname"
              error={errors.nickname?.message}
            >
              <Input id="med-nickname" {...register('nickname')} />
            </Field>

            <Field
              label={t('users.userDetail.murid.level')}
              htmlFor="med-level"
              error={errors.level?.message}
            >
              <select
                id="med-level"
                {...register('level')}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <option value="">—</option>
                {STUDENT_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label={t('users.userDetail.profil.birthDate')}
              htmlFor="med-dob"
              error={errors.dateOfBirth?.message}
            >
              <Input id="med-dob" type="date" {...register('dateOfBirth')} />
            </Field>

            <Field
              label={t('users.form.tempatLahir')}
              htmlFor="med-tempatlahir"
              error={errors.tempatLahir?.message}
            >
              <Input id="med-tempatlahir" {...register('tempatLahir')} />
            </Field>

            <Field
              label={t('users.userDetail.profil.noHp')}
              htmlFor="med-nohp"
              error={errors.noHp?.message}
            >
              <Input id="med-nohp" {...register('noHp')} placeholder="08xx" />
            </Field>

            <Field
              label={t('users.userDetail.profil.alamat')}
              htmlFor="med-alamat"
              error={errors.alamat?.message}
              className="col-span-2"
            >
              <Input id="med-alamat" {...register('alamat')} />
            </Field>

            <Field
              label={t('users.userDetail.guru.notes')}
              htmlFor="med-notes"
              error={errors.notes?.message}
              className="col-span-2"
            >
              <textarea
                id="med-notes"
                {...register('notes')}
                rows={2}
                className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </Field>
          </div>

          {/* Ortu pickers */}
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('users.ortu.sectionTitle')}
            </h4>
            <Field label={t('users.ortu.ayah')}>
              <OrtuPicker
                relation="ayah"
                linked={ayahLink?.user}
                onLink={(ortuId) => ortuMut.mutate({ ayahId: ortuId })}
                onUnlink={() => ortuMut.mutate({ clearAyahId: true })}
                disabled={ortuMut.isPending}
              />
            </Field>
            <Field label={t('users.ortu.ibu')}>
              <OrtuPicker
                relation="ibu"
                linked={ibuLink?.user}
                onLink={(ortuId) => ortuMut.mutate({ ibuId: ortuId })}
                onUnlink={() => ortuMut.mutate({ clearIbuId: true })}
                disabled={ortuMut.isPending}
              />
            </Field>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saveMut.isPending}>
              {saveMut.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
