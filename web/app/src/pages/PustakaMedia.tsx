import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Pencil, Plus, Presentation, Trash2, Video, X } from 'lucide-react'

import {
  createMedia,
  deleteMedia,
  listMedia,
  updateMedia,
  type LibraryMedia,
  type LibraryMediaInput,
  type MediaType,
} from '@/api/media'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { LibraryShell } from '@/components/LibraryShell'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'

/**
 * PustakaMedia — catalog of embeddable learning media (PowerPoint decks and
 * videos). Anyone can browse and open a media item in a new tab; admin and
 * guru roles get add / edit / delete controls via an inline form modal and the
 * shared ConfirmDialog.
 */
export function PustakaMediaPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canEdit = user?.role === 'admin' || user?.role === 'guru'
  const toast = useToast()
  const qc = useQueryClient()

  const { data: list = [], isPending } = useQuery({
    queryKey: ['library-media'],
    queryFn: listMedia,
  })

  const [dialog, setDialog] = useState<
    | { kind: 'create' }
    | { kind: 'edit'; media: LibraryMedia }
    | null
  >(null)
  const [toDelete, setToDelete] = useState<LibraryMedia | null>(null)

  const delMut = useMutation({
    mutationFn: (id: string) => deleteMedia(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library-media'] })
      setToDelete(null)
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('pustaka.media.saveFailed'), 'error'),
  })

  return (
    <LibraryShell
      backTo="/pustaka"
      bgClassName="bg-slate-50"
      contentClassName="flex h-full min-h-0 flex-col"
    >
      {/* Static header — never scrolls. */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white/95 px-4 pb-3 pt-14 backdrop-blur md:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-lg font-semibold">{t('pustaka.media.title')}</h1>
              <p className="mt-1 text-sm text-slate-500">{t('pustaka.media.subtitle')}</p>
            </div>
            {canEdit ? (
              <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
                <Plus size={14} className="mr-1" /> {t('pustaka.media.addBtn')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Only this section scrolls. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8">
        <div className="mx-auto max-w-5xl">
          {isPending ? (
            <p className="text-sm text-slate-500">{t('common.loading')}</p>
          ) : list.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              {t('pustaka.media.empty')}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((m) => (
                <MediaCard
                  key={m.id}
                  media={m}
                  canEdit={canEdit}
                  onEdit={() => setDialog({ kind: 'edit', media: m })}
                  onDelete={() => setToDelete(m)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {dialog ? (
        <MediaFormModal
          media={dialog.kind === 'edit' ? dialog.media : undefined}
          onClose={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      ) : null}

      <ConfirmDialog
        open={!!toDelete}
        title={t('pustaka.media.removeConfirmTitle')}
        message={toDelete ? t('pustaka.media.removeConfirmMsg', { name: toDelete.title }) : undefined}
        confirmLabel={t('pustaka.media.deleteBtn')}
        busy={delMut.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) delMut.mutate(toDelete.id)
        }}
      />
    </LibraryShell>
  )
}

function MediaCard({
  media: m,
  canEdit,
  onEdit,
  onDelete,
}: {
  media: LibraryMedia
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const isVideo = m.type === 'video'
  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-3">
        <div
          className={
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ' +
            (isVideo ? 'bg-rose-50 text-rose-700' : 'bg-indigo-50 text-indigo-700')
          }
        >
          {isVideo ? <Video size={20} /> : <Presentation size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 font-semibold text-slate-900">{m.title}</div>
          <span
            className={
              'mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ' +
              (isVideo ? 'bg-rose-50 text-rose-700' : 'bg-indigo-50 text-indigo-700')
            }
          >
            {isVideo ? t('pustaka.media.typeVideo') : t('pustaka.media.typePpt')}
          </span>
        </div>
      </div>

      {m.description ? (
        <p className="mt-2 line-clamp-2 text-sm text-slate-500">{m.description}</p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 pt-1">
        <a
          href={m.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline"
        >
          <ExternalLink size={14} /> {t('pustaka.media.openBtn')}
        </a>
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label={t('pustaka.media.editBtn')}
              title={t('pustaka.media.editBtn')}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
              aria-label={t('pustaka.media.deleteBtn')}
              title={t('pustaka.media.deleteBtn')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Form modal

function MediaFormModal({
  media,
  onClose,
  onSaved,
}: {
  media?: LibraryMedia
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [type, setType] = useState<MediaType>(media?.type ?? 'ppt')
  const [title, setTitle] = useState(media?.title ?? '')
  const [url, setUrl] = useState(media?.url ?? '')
  const [description, setDescription] = useState(media?.description ?? '')

  const mut = useMutation({
    mutationFn: (input: LibraryMediaInput) =>
      media ? updateMedia(media.id, input) : createMedia(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library-media'] })
      onSaved()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('pustaka.media.saveFailed'), 'error'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const desc = description.trim()
    mut.mutate({
      type,
      title: title.trim(),
      url: url.trim(),
      description: desc === '' ? null : desc,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-4 text-slate-900 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            {media ? t('pustaka.media.editBtn') : t('pustaka.media.addBtn')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label={t('common.cancel')}
          >
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t('pustaka.media.typeLabel')} htmlFor="m-type">
            <select
              id="m-type"
              value={type}
              onChange={(e) => setType(e.target.value as MediaType)}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <option value="ppt">{t('pustaka.media.typePpt')}</option>
              <option value="video">{t('pustaka.media.typeVideo')}</option>
            </select>
          </Field>
          <Field label={t('pustaka.media.judulLabel')} htmlFor="m-title">
            <Input
              id="m-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label={t('pustaka.media.urlLabel')} htmlFor="m-url">
            <Input
              id="m-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('pustaka.media.urlPlaceholder')}
              required
            />
          </Field>
          <Field label={t('pustaka.media.descLabel')} htmlFor="m-desc">
            <textarea
              id="m-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            />
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
      </div>
    </div>
  )
}
