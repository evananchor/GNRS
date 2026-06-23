import { apiFetch } from './client'
import type { ManagedUser, ManagedUserList, PhoneRegion, StudentLevel, Gender } from './users'

export type MuridUpdateInput = {
  name?: string
  nickname?: string
  dateOfBirth?: string
  gender?: Gender
  noHp?: string
  phoneRegion?: PhoneRegion
  alamat?: string
  level?: StudentLevel | ''
  tempatLahir?: string
  notes?: string
  ayahId?: string
  clearAyahId?: boolean
  ibuId?: string
  clearIbuId?: boolean
}

export function getMurid(id: string) {
  return apiFetch<ManagedUser>(`/api/murid/${encodeURIComponent(id)}`)
}

export function updateMurid(id: string, input: MuridUpdateInput) {
  return apiFetch<ManagedUser>(`/api/murid/${encodeURIComponent(id)}`, { method: 'PATCH', body: input })
}

export function searchOrtu(q: string, limit = 20) {
  const sp = new URLSearchParams()
  if (q) sp.set('q', q)
  sp.set('limit', String(limit))
  return apiFetch<ManagedUserList>(`/api/ortu?${sp.toString()}`)
}

export function createOrtu(input: { name: string; noHp?: string; phoneRegion?: PhoneRegion }) {
  return apiFetch<ManagedUser>('/api/ortu', { method: 'POST', body: input })
}
