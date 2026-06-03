import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'

import {
  createDaerah,
  createDesa,
  createKelompok,
  deleteDaerah,
  deleteDesa,
  deleteKelompok,
  getWilayah,
  renameDaerah,
  renameDesa,
  renameKelompok,
  type WilayahDaerah,
  type WilayahDesa,
  type WilayahTree,
} from '@/api/wilayah'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { PageShell } from '@/components/PageShell'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

const TREE_KEY = ['wilayah']

/**
 * WilayahSection — admin manages the master Daerah -> Desa -> Kelompok tree
 * that feeds the cascading location dropdowns in the user/profile editors.
 * Names only (no code). Deleting a node cascades to its children.
 */
export function WilayahSection() {
  const { t } = useTranslation()
  const { data, isPending } = useQuery({ queryKey: TREE_KEY, queryFn: getWilayah })

  const header = (
    <div>
      <h2 className="text-xl font-semibold">{t('wilayah.title')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('wilayah.subtitle')}</p>
    </div>
  )

  return (
    <PageShell header={header}>
      <div className="mx-auto max-w-3xl space-y-4">
        <AddForm level="daerah" parentId={null} placeholder={t('wilayah.daerahPh')} />
        {isPending ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : !data || data.daerah.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            {t('wilayah.empty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {data.daerah.map((d) => (
              <DaerahItem key={d.id} daerah={d} />
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  )
}

// --- mutations hook -------------------------------------------------------

function useTreeMutation<TArgs extends unknown[]>(fn: (...a: TArgs) => Promise<WilayahTree>) {
  const qc = useQueryClient()
  const toast = useToast()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: (args: TArgs) => fn(...args),
    onSuccess: (tree) => qc.setQueryData(TREE_KEY, tree),
    onError: (e) => toast(e instanceof ApiError ? e.message : t('wilayah.saveFailed'), 'error'),
  })
}

// --- add form -------------------------------------------------------------

function AddForm({
  level,
  parentId,
  placeholder,
}: {
  level: 'daerah' | 'desa' | 'kelompok'
  parentId: string | null
  placeholder: string
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const mut = useTreeMutation((n: string) =>
    level === 'daerah'
      ? createDaerah(n)
      : level === 'desa'
        ? createDesa(parentId as string, n)
        : createKelompok(parentId as string, n),
  )
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const v = name.trim()
        if (!v) return
        mut.mutate([v], { onSuccess: () => setName('') })
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} />
      <Button type="submit" size="sm" variant="secondary" disabled={mut.isPending || !name.trim()}>
        <Plus size={15} className="mr-1" />
        {t('wilayah.add')}
      </Button>
    </form>
  )
}

// --- editable name row ----------------------------------------------------

function NameRow({
  name,
  badge,
  expand,
  onRename,
  onDelete,
  renaming,
  deleting,
}: {
  name: string
  badge?: React.ReactNode
  expand?: { open: boolean; toggle: () => void }
  onRename: (next: string) => void
  onDelete: () => void
  renaming: boolean
  deleting: boolean
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  if (editing) {
    return (
      <form
        className="flex flex-1 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const v = draft.trim()
          if (v && v !== name) onRename(v)
          setEditing(false)
        }}
      >
        <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="h-9" />
        <Button type="submit" size="sm" disabled={renaming}>
          <Check size={15} />
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>
          <X size={15} />
        </Button>
      </form>
    )
  }

  return (
    <div className="flex flex-1 items-center gap-2">
      {expand ? (
        <button type="button" onClick={expand.toggle} className="text-slate-400 hover:text-slate-700" aria-label="toggle">
          {expand.open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      ) : (
        <span className="w-4" />
      )}
      <span className="font-medium text-slate-800">{name}</span>
      {badge}
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => {
          setDraft(name)
          setEditing(true)
        }}
        className="text-slate-400 hover:text-slate-700"
        title={t('wilayah.rename')}
      >
        <Pencil size={15} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="text-rose-400 hover:text-rose-600 disabled:opacity-50"
        title={t('common.delete')}
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{children}</span>
}

// --- daerah / desa / kelompok items --------------------------------------

function DaerahItem({ daerah: d }: { daerah: WilayahDaerah }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const rename = useTreeMutation((id: string, name: string) => renameDaerah(id, name))
  const del = useTreeMutation((id: string) => deleteDaerah(id))

  return (
    <li className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-2">
        <NameRow
          name={d.name}
          badge={<Badge>{t('wilayah.desaCount', { n: d.desa.length })}</Badge>}
          expand={{ open, toggle: () => setOpen((v) => !v) }}
          renaming={rename.isPending}
          deleting={del.isPending}
          onRename={(next) => rename.mutate([d.id, next])}
          onDelete={async () => {
            if (await confirm({ message: t('wilayah.deleteConfirm', { name: d.name }), danger: true })) del.mutate([d.id])
          }}
        />
      </div>
      {open ? (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-3 py-3 pl-8">
          <AddForm level="desa" parentId={d.id} placeholder={t('wilayah.desaPh')} />
          {d.desa.length === 0 ? (
            <p className="text-xs text-slate-400">{t('wilayah.emptyDesa')}</p>
          ) : (
            <ul className="space-y-2">
              {d.desa.map((v) => (
                <DesaItem key={v.id} desa={v} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  )
}

function DesaItem({ desa: v }: { desa: WilayahDesa }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const rename = useTreeMutation((id: string, name: string) => renameDesa(id, name))
  const del = useTreeMutation((id: string) => deleteDesa(id))

  return (
    <li className="rounded-md border border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-2">
        <NameRow
          name={v.name}
          badge={<Badge>{t('wilayah.kelompokCount', { n: v.kelompok.length })}</Badge>}
          expand={{ open, toggle: () => setOpen((b) => !b) }}
          renaming={rename.isPending}
          deleting={del.isPending}
          onRename={(next) => rename.mutate([v.id, next])}
          onDelete={async () => {
            if (await confirm({ message: t('wilayah.deleteConfirm', { name: v.name }), danger: true })) del.mutate([v.id])
          }}
        />
      </div>
      {open ? (
        <div className="space-y-2 border-t border-slate-100 px-3 py-3 pl-8">
          <AddForm level="kelompok" parentId={v.id} placeholder={t('wilayah.kelompokPh')} />
          {v.kelompok.length === 0 ? (
            <p className="text-xs text-slate-400">{t('wilayah.emptyKelompok')}</p>
          ) : (
            <ul className="space-y-1">
              {v.kelompok.map((k) => (
                <KelompokItem key={k.id} id={k.id} name={k.name} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  )
}

function KelompokItem({ id, name }: { id: string; name: string }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const rename = useTreeMutation((kid: string, n: string) => renameKelompok(kid, n))
  const del = useTreeMutation((kid: string) => deleteKelompok(kid))
  return (
    <li className="flex items-center gap-2 rounded border border-slate-100 px-3 py-1.5">
      <NameRow
        name={name}
        renaming={rename.isPending}
        deleting={del.isPending}
        onRename={(next) => rename.mutate([id, next])}
        onDelete={async () => {
          if (await confirm({ message: t('wilayah.deleteConfirm', { name }), danger: true })) del.mutate([id])
        }}
      />
    </li>
  )
}
