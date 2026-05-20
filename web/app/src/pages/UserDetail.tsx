import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import {
  deleteUser,
  getUser,
  MEMBERSHIP_STATUSES,
  setUserPassword,
  STUDENT_LEVELS,
  updateUser,
  USER_ROLES,
  type ManagedUser,
  type MembershipStatus,
  type StudentLevel,
  type UserRole,
  type UserUpdateInput,
} from '@/api/users'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Field } from '@/components/Field'
import { PageShell } from '@/components/PageShell'
import { useMembershipLabel, useRoleLabel } from './Users'

export function UserDetailPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const editFlag = params.get('edit') === '1'
  const { user: me } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(editFlag)
  const roleLabel = useRoleLabel()

  const userQuery = useQuery({
    queryKey: ['users', id],
    queryFn: () => getUser(id),
    enabled: !!id,
  })

  if (userQuery.isPending)
    return (
      <PageShell>
        <p className="text-slate-500">{t('common.loading')}</p>
      </PageShell>
    )
  if (userQuery.isError || !userQuery.data) {
    return (
      <PageShell>
        <p className="text-red-600">{t('users.loadUserFailed')}</p>
      </PageShell>
    )
  }

  const u = userQuery.data
  const isSelf = me?.id === u.id

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold break-words">
          {u.name}
          {isSelf ? <span className="ml-2 text-sm font-normal text-slate-500">{t('users.selfAccountBadge')}</span> : null}
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {roleLabel(u.role)} · {u.email}
          {u.username ? ` · @${u.username}` : ''}
        </p>
      </div>
        {!editing ? (
          <div className="flex gap-2 self-start sm:self-auto">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('users.userDetail.editBtn')}
            </Button>
            <Button
              variant="danger"
              disabled={isSelf}
              title={isSelf ? t('users.selfDeleteBlock') : undefined}
              onClick={() => {
                if (isSelf) return
                if (confirm(t('users.deleteConfirm', { name: u.name }))) {
                  deleteUser(u.id).then(
                    async () => {
                      await qc.invalidateQueries({ queryKey: ['users'] })
                      navigate('/pengaturan/pengguna')
                    },
                    (err) => alert(err instanceof ApiError ? err.message : t('users.deleteFailed')),
                  )
                }
              }}
            >
              {t('users.userDetail.deleteBtn')}
            </Button>
          </div>
        ) : null}
    </div>
  )

  return (
    <PageShell header={header}>
      <div className="space-y-4">
        <ProfileSection user={u} editing={editing} isSelf={isSelf} onClose={() => setEditing(false)} />
        <PasswordSection userId={u.id} userName={u.name} />
      </div>
    </PageShell>
  )
}

function ProfileSection({
  user,
  editing,
  isSelf,
  onClose,
}: {
  user: ManagedUser
  editing: boolean
  isSelf: boolean
  onClose: () => void
}) {
  if (!editing) {
    return <ReadOnlyView user={user} />
  }
  return <EditForm user={user} isSelf={isSelf} onClose={onClose} />
}

function ReadOnlyView({ user: u }: { user: ManagedUser }) {
  const { t } = useTranslation()
  const roleLabel = useRoleLabel()
  const membershipLabel = useMembershipLabel()
  const showMuridFields = u.role === 'murid' || u.level || u.parentName || u.parentPhone
  const showGuruFields = u.role === 'guru' || u.desa || u.daerah || u.notes
  return (
    <div className="space-y-4">
      <Card title={t('users.userDetail.cardAkun')}>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Row label={t('users.userDetail.akun.email')} value={u.email} />
          <Row label={t('users.userDetail.akun.username')} value={u.username ?? '—'} />
          <Row label={t('users.userDetail.akun.role')} value={roleLabel(u.role)} />
          <Row
            label={t('users.userDetail.akun.statusAkun')}
            value={u.active ? t('users.userDetail.akun.statusActiveDesc') : t('users.userDetail.akun.statusInactiveDesc')}
          />
          <Row label={t('users.userDetail.akun.createdAt')} value={new Date(u.createdAt).toLocaleString('id-ID')} />
          <Row label={t('users.userDetail.akun.updatedAt')} value={new Date(u.updatedAt).toLocaleString('id-ID')} />
        </dl>
      </Card>

      <Card title={t('users.userDetail.cardProfil')}>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Row label={t('users.userDetail.profil.fullName')} value={u.name} />
          <Row label={t('users.userDetail.profil.nickname')} value={u.nickname ?? '—'} />
          <Row label={t('users.userDetail.profil.birthDate')} value={u.dateOfBirth?.slice(0, 10) ?? '—'} />
          <Row
            label={t('users.userDetail.profil.gender')}
            value={u.gender === 'male' ? t('users.userDetail.profil.genderMale') : u.gender === 'female' ? t('users.userDetail.profil.genderFemale') : '—'}
          />
          <Row label={t('users.userDetail.profil.noHp')} value={u.noHp ?? '—'} />
          <Row label={t('users.userDetail.profil.alamat')} value={u.alamat ?? '—'} className="sm:col-span-2" />
          <Row label={t('users.userDetail.profil.kelompok')} value={u.kelompok ?? '—'} />
        </dl>
      </Card>

      <Card title={t('users.userDetail.cardMembership')}>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Row label={t('users.userDetail.membership.joinedAt')} value={u.joinedAt?.slice(0, 10) ?? '—'} />
          <Row label={t('users.userDetail.membership.status')} value={membershipLabel(u.membershipStatus)} />
          <Row
            label={u.role === 'guru' ? t('users.userDetail.membership.leftAtGuru') : t('users.userDetail.membership.leftAt')}
            value={u.leftAt?.slice(0, 10) ?? '—'}
          />
          <Row label={t('users.userDetail.membership.leaveReason')} value={u.leaveReason ?? '—'} className="sm:col-span-2" />
        </dl>
      </Card>

      {showMuridFields ? (
        <Card title={t('users.userDetail.cardMurid')}>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Row label={t('users.userDetail.murid.level')} value={u.level ?? '—'} />
            <Row label={t('users.userDetail.murid.parentTitle')} value={u.parentTitle ?? '—'} />
            <Row label={t('users.userDetail.murid.parentName')} value={u.parentName ?? '—'} />
            <Row
              label={t('users.userDetail.murid.parentPhoneRO')}
              value={
                u.parentPhone
                  ? `+${({ ID: '62', SG: '65', US: '1', CA: '1' } as any)[u.parentPhoneRegion ?? 'ID'] ?? '62'}${u.parentPhone.replace(/^0+/, '')}`
                  : '—'
              }
            />
            <Row label={t('users.userDetail.murid.parentEmail')} value={u.parentEmail ?? '—'} className="sm:col-span-2" />
          </dl>
        </Card>
      ) : null}

      {showGuruFields ? (
        <Card title={t('users.userDetail.cardPengajar')}>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Row label={t('users.userDetail.guru.desa')} value={u.desa ?? '—'} />
            <Row label={t('users.userDetail.guru.daerah')} value={u.daerah ?? '—'} />
            <Row label={t('users.userDetail.guru.notesRO')} value={u.notes ?? '—'} className="sm:col-span-2" />
          </dl>
        </Card>
      ) : null}
    </div>
  )
}

type FormState = {
  email: string
  username: string
  name: string
  role: UserRole
  active: boolean
  nickname: string
  dateOfBirth: string
  gender: '' | 'male' | 'female'
  noHp: string
  alamat: string
  kelompok: string
  level: '' | StudentLevel
  parentName: string
  parentTitle: string
  parentPhone: string
  parentPhoneRegion: 'ID' | 'SG' | 'US' | 'CA'
  parentEmail: string
  desa: string
  daerah: string
  notes: string
  joinedAt: string
  leftAt: string
  leaveReason: string
  membershipStatus: MembershipStatus
}

function userToFormState(u: ManagedUser): FormState {
  return {
    email: u.email,
    username: u.username ?? '',
    name: u.name,
    role: u.role,
    active: u.active,
    nickname: u.nickname ?? '',
    dateOfBirth: u.dateOfBirth?.slice(0, 10) ?? '',
    gender: u.gender ?? '',
    noHp: u.noHp ?? '',
    alamat: u.alamat ?? '',
    kelompok: u.kelompok ?? '',
    level: u.level ?? '',
    parentName: u.parentName ?? '',
    parentTitle: u.parentTitle ?? '',
    parentPhone: u.parentPhone ?? '',
    parentPhoneRegion: u.parentPhoneRegion ?? 'ID',
    parentEmail: u.parentEmail ?? '',
    desa: u.desa ?? '',
    daerah: u.daerah ?? '',
    notes: u.notes ?? '',
    joinedAt: u.joinedAt?.slice(0, 10) ?? '',
    leftAt: u.leftAt?.slice(0, 10) ?? '',
    leaveReason: u.leaveReason ?? '',
    membershipStatus: u.membershipStatus,
  }
}

function EditForm({
  user,
  isSelf,
  onClose,
}: {
  user: ManagedUser
  isSelf: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const roleLabel = useRoleLabel()
  const membershipLabel = useMembershipLabel()
  const qc = useQueryClient()
  const [f, setF] = useState<FormState>(() => userToFormState(user))

  useEffect(() => {
    setF(userToFormState(user))
  }, [user])

  const mutation = useMutation({
    mutationFn: (input: UserUpdateInput) => updateUser(user.id, input),
    onSuccess: async (updated) => {
      qc.setQueryData(['users', user.id], updated)
      await qc.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
  })

  const apiError = mutation.error instanceof ApiError ? mutation.error.message : null
  const isMurid = f.role === 'murid'
  const isGuru = f.role === 'guru'

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const input: UserUpdateInput = {
          email: f.email.trim(),
          username: f.username.trim(),
          name: f.name.trim(),
          role: f.role,
          active: f.active,
          nickname: f.nickname.trim(),
          dateOfBirth: f.dateOfBirth, // '' clears
          gender: f.gender || undefined,
          noHp: f.noHp.trim(),
          alamat: f.alamat.trim(),
          kelompok: f.kelompok.trim(),
          level: f.level || ('' as StudentLevel),
          parentName: f.parentName.trim(),
          parentTitle: f.parentTitle.trim(),
          parentPhone: f.parentPhone.trim(),
          parentPhoneRegion: f.parentPhoneRegion,
          parentEmail: f.parentEmail.trim(),
          desa: f.desa.trim(),
          daerah: f.daerah.trim(),
          notes: f.notes.trim(),
          joinedAt: f.joinedAt,
          leftAt: f.leftAt,
          leaveReason: f.leaveReason.trim(),
          membershipStatus: f.membershipStatus,
        }
        mutation.mutate(input)
      }}
    >
      <Card title={t('users.userDetail.cardAkun')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('users.userDetail.akun.email')} htmlFor="email">
            <Input id="email" type="email" value={f.email} onChange={(e) => update('email', e.target.value)} required />
          </Field>
          <Field label={t('users.userDetail.akun.username')} htmlFor="username" hint={t('users.userDetail.akun.usernameHint')}>
            <Input id="username" value={f.username} onChange={(e) => update('username', e.target.value)} />
          </Field>
          <Field label={t('users.userDetail.akun.role')} htmlFor="role">
            <select
              id="role"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              value={f.role}
              onChange={(e) => update('role', e.target.value as UserRole)}
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('users.userDetail.akun.statusAkun')} htmlFor="active">
            <label className="inline-flex h-10 items-center gap-2">
              <input
                id="active"
                type="checkbox"
                checked={f.active}
                onChange={(e) => update('active', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-sm">{t('users.userDetail.akun.activeToggle')}</span>
            </label>
          </Field>
        </div>
      </Card>

      <Card title={t('users.userDetail.cardProfil')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('users.userDetail.profil.fullName')} htmlFor="name">
            <Input id="name" value={f.name} onChange={(e) => update('name', e.target.value)} required />
          </Field>
          <Field label={t('users.userDetail.profil.nickname')} htmlFor="nickname">
            <Input id="nickname" value={f.nickname} onChange={(e) => update('nickname', e.target.value)} />
          </Field>
          <Field label={t('users.userDetail.profil.birthDate')} htmlFor="dob" hint={t('users.userDetail.profil.birthDateHint')}>
            <Input id="dob" type="date" value={f.dateOfBirth} onChange={(e) => update('dateOfBirth', e.target.value)} />
          </Field>
          <Field label={t('users.userDetail.profil.gender')} htmlFor="gender">
            <select
              id="gender"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              value={f.gender}
              onChange={(e) => update('gender', e.target.value as FormState['gender'])}
            >
              <option value="">—</option>
              <option value="female">{t('users.userDetail.profil.genderFemale')}</option>
              <option value="male">{t('users.userDetail.profil.genderMale')}</option>
            </select>
          </Field>
          <Field label={t('users.userDetail.profil.noHp')} htmlFor="noHp">
            <Input id="noHp" value={f.noHp} onChange={(e) => update('noHp', e.target.value)} />
          </Field>
          <Field label={t('users.userDetail.profil.kelompok')} htmlFor="kelompok" hint={isMurid ? t('users.userDetail.profil.kelompokMuridHint') : t('users.userDetail.profil.kelompokFreeHint')}>
            <Input id="kelompok" value={f.kelompok} onChange={(e) => update('kelompok', e.target.value)} />
          </Field>
          <Field label={t('users.userDetail.profil.alamat')} htmlFor="alamat" className="sm:col-span-2">
            <Input id="alamat" value={f.alamat} onChange={(e) => update('alamat', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title={t('users.userDetail.cardMembership')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('users.userDetail.membership.joinedAt')} htmlFor="joined">
            <Input id="joined" type="date" value={f.joinedAt} onChange={(e) => update('joinedAt', e.target.value)} />
          </Field>
          <Field label={t('users.userDetail.membership.status')} htmlFor="ms">
            <select
              id="ms"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              value={f.membershipStatus}
              onChange={(e) => update('membershipStatus', e.target.value as MembershipStatus)}
            >
              {MEMBERSHIP_STATUSES.map((ms) => (
                <option key={ms} value={ms}>
                  {membershipLabel(ms)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={isGuru ? t('users.userDetail.membership.leftAtGuru') : t('users.userDetail.membership.leftAt')} htmlFor="leftAt">
            <Input id="leftAt" type="date" value={f.leftAt} onChange={(e) => update('leftAt', e.target.value)} />
          </Field>
          <Field label={t('users.userDetail.membership.leaveReason')} htmlFor="leaveReason">
            <Input id="leaveReason" value={f.leaveReason} onChange={(e) => update('leaveReason', e.target.value)} />
          </Field>
        </div>
      </Card>

      {(isMurid || f.level || f.parentName || f.parentPhone || f.parentEmail) && (
        <Card title={t('users.userDetail.cardMurid')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('users.userDetail.murid.level')} htmlFor="level">
              <select
                id="level"
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                value={f.level}
                onChange={(e) => update('level', e.target.value as FormState['level'])}
              >
                <option value="">—</option>
                {STUDENT_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('users.userDetail.murid.parentTitle')} htmlFor="parentTitle" hint={t('users.userDetail.murid.parentTitleHint')}>
              <Input id="parentTitle" value={f.parentTitle} onChange={(e) => update('parentTitle', e.target.value)} placeholder={t('users.userDetail.murid.parentTitlePh')} />
            </Field>
            <Field label={t('users.userDetail.murid.parentName')} htmlFor="parentName">
              <Input id="parentName" value={f.parentName} onChange={(e) => update('parentName', e.target.value)} />
            </Field>
            <Field label={t('users.userDetail.murid.parentPhone')} htmlFor="parentPhone">
              <div className="flex gap-2">
                <select
                  value={f.parentPhoneRegion}
                  onChange={(e) => update('parentPhoneRegion', e.target.value as FormState['parentPhoneRegion'])}
                  className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  <option value="ID">🇮🇩 +62</option>
                  <option value="SG">🇸🇬 +65</option>
                  <option value="US">🇺🇸 +1</option>
                  <option value="CA">🇨🇦 +1</option>
                </select>
                <Input id="parentPhone" value={f.parentPhone} onChange={(e) => update('parentPhone', e.target.value)} placeholder={t('users.userDetail.murid.parentPhonePh')} />
              </div>
            </Field>
            <Field label={t('users.userDetail.murid.parentEmail')} htmlFor="parentEmail">
              <Input id="parentEmail" type="email" value={f.parentEmail} onChange={(e) => update('parentEmail', e.target.value)} />
            </Field>
          </div>
        </Card>
      )}

      {(isGuru || f.desa || f.daerah || f.notes) && (
        <Card title={t('users.userDetail.cardPengajar')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('users.userDetail.guru.desa')} htmlFor="desa">
              <Input id="desa" value={f.desa} onChange={(e) => update('desa', e.target.value)} />
            </Field>
            <Field label={t('users.userDetail.guru.daerah')} htmlFor="daerah">
              <Input id="daerah" value={f.daerah} onChange={(e) => update('daerah', e.target.value)} />
            </Field>
            <Field label={t('users.userDetail.guru.notes')} htmlFor="notes" className="sm:col-span-2">
              <Input id="notes" value={f.notes} onChange={(e) => update('notes', e.target.value)} />
            </Field>
          </div>
        </Card>
      )}

      {isSelf && (f.role !== 'admin' || !f.active) ? (
        <p className="text-xs text-amber-700">
          {t('users.userDetail.selfAdminWarn')}
        </p>
      ) : null}
      {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  )
}

function PasswordSection({ userId, userName }: { userId: string; userName: string }) {
  const { t } = useTranslation()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [done, setDone] = useState(false)

  const mutation = useMutation({
    mutationFn: () => setUserPassword(userId, pw),
    onSuccess: () => {
      setDone(true)
      setPw('')
      setPw2('')
      setTimeout(() => setDone(false), 3000)
    },
  })

  const apiError = mutation.error instanceof ApiError ? mutation.error.message : null
  const mismatch = pw && pw2 && pw !== pw2

  return (
    <Card title={t('users.userDetail.cardPassword')}>
      <p className="text-xs text-slate-500">
        {t('users.userDetail.password.intro', { name: userName })}
      </p>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (mismatch || pw.length < 6) return
          mutation.mutate()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('users.userDetail.password.newPassword')} htmlFor="pw">
            <Input
              id="pw"
              type="text"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
              placeholder={t('users.userDetail.password.newPasswordPh')}
            />
          </Field>
          <Field label={t('users.userDetail.password.repeat')} htmlFor="pw2" error={mismatch ? t('users.userDetail.password.mismatch') : undefined}>
            <Input
              id="pw2"
              type="text"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
        </div>
        {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}
        {done ? <p className="text-sm text-emerald-700">{t('users.userDetail.password.saved')}</p> : null}
        <Button type="submit" disabled={mutation.isPending || !pw || pw.length < 6 || !!mismatch}>
          {mutation.isPending ? t('common.saving') : t('users.userDetail.password.submit')}
        </Button>
      </form>
    </Card>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </div>
  )
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-900">{value}</dd>
    </div>
  )
}
