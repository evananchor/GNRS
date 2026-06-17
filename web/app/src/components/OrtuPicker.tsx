import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

import {
  listUsers,
  createUser,
  type OrtuLink,
  type PhoneRegion,
} from '@/api/users'
import { Button } from './Button'
import { Input } from './Input'
import { Field } from './Field'

const PHONE_REGIONS: PhoneRegion[] = ['ID', 'SG', 'US', 'CA']

type Props = {
  /** "ayah" or "ibu" */
  relation: 'ayah' | 'ibu'
  /** Currently linked ortu user, if any */
  linked?: OrtuLink['user']
  /** Called when user picks an existing ortu or creates a new one */
  onLink: (ortuId: string) => void
  /** Called when user clicks unlink */
  onUnlink: () => void
  disabled?: boolean
}

export function OrtuPicker({ relation, linked, onLink, onUnlink, disabled }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newRegion, setNewRegion] = useState<PhoneRegion>('ID')

  const searchQ = useQuery({
    queryKey: ['ortu-search', query],
    queryFn: () => listUsers({ role: 'ortu', q: query, limit: 20 }),
    enabled: query.length >= 1,
  })

  const createMut = useMutation({
    mutationFn: () =>
      createUser({
        name: newName.trim(),
        email: `ortu.new.${Date.now()}@placeholder.local`,
        password: Math.random().toString(36).slice(2, 14),
        role: 'ortu',
        noHp: newPhone.trim() || undefined,
        phoneRegion: newRegion,
      }),
    onSuccess: (ortu) => {
      qc.invalidateQueries({ queryKey: ['ortu-search'] })
      setShowCreate(false)
      setQuery('')
      setNewName('')
      setNewPhone('')
      setNewRegion('ID')
      onLink(ortu.id)
    },
  })

  const label = relation === 'ayah' ? t('users.ortu.ayah') : t('users.ortu.ibu')

  if (linked) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{linked.name}</p>
          {linked.noHp && (
            <p className="text-xs text-slate-500">
              {linked.noHp} ({linked.phoneRegion ?? 'ID'})
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onUnlink}
          disabled={disabled}
          className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40"
          title={t('users.ortu.unlinkTitle', { label })}
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  const results = searchQ.data?.items ?? []

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          placeholder={t('users.ortu.searchPh', { label })}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowCreate(false)
          }}
          disabled={disabled}
        />
        {query && results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
            {results.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                  onClick={() => {
                    setQuery('')
                    onLink(u.id)
                  }}
                >
                  <span className="font-medium">{u.name}</span>
                  {u.noHp && <span className="ml-2 text-xs text-slate-500">{u.noHp}</span>}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50"
                onClick={() => {
                  setNewName(query)
                  setShowCreate(true)
                  setQuery('')
                }}
              >
                + {t('users.ortu.createNew', { name: query })}
              </button>
            </li>
          </ul>
        )}
        {query && results.length === 0 && !searchQ.isFetching && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50"
              onClick={() => {
                setNewName(query)
                setShowCreate(true)
                setQuery('')
              }}
            >
              + {t('users.ortu.createNew', { name: query })}
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-emerald-800">
            {t('users.ortu.createTitle', { label })}
          </p>
          <Field label={t('users.ortu.nameLabel')} htmlFor={`ortu-name-${relation}`}>
            <Input
              id={`ortu-name-${relation}`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('users.ortu.phoneLabel')} htmlFor={`ortu-phone-${relation}`}>
              <Input
                id={`ortu-phone-${relation}`}
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="08xx"
              />
            </Field>
            <Field label={t('users.ortu.regionLabel')} htmlFor={`ortu-region-${relation}`}>
              <select
                id={`ortu-region-${relation}`}
                value={newRegion}
                onChange={(e) => setNewRegion(e.target.value as PhoneRegion)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm"
              >
                {PHONE_REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!newName.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? t('common.saving') : t('users.ortu.saveNew')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowCreate(false)}
            >
              {t('common.cancel')}
            </Button>
          </div>
          {createMut.isError && (
            <p className="text-xs text-red-600">{String(createMut.error)}</p>
          )}
        </div>
      )}
    </div>
  )
}
