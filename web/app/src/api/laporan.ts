import { apiFetch } from './client'

export type LaporanKehadiran = {
  hadir: number
  izinMurid: number
  izinGuru: number
  byVn: number
  alfa: number
  total: number
  pctHadir: number
}

export type LaporanItem = {
  materi: string
  subTema: string
  kelompokMateri?: string
  status: 'belum' | 'proses' | 'tuntas'
  changedInPeriod: boolean
  tanggal?: string | null
  nilaiAngka?: number | null
  nilaiHuruf?: string | null
}

export type LaporanTema = { tema: string; items: LaporanItem[] }

export type LaporanLibrary = {
  kind: string
  aspect?: string | null
  ref: string
  status: string
  changedInPeriod: boolean
}

export type LaporanResponse = {
  murid: { id: string; name: string; nickname: string | null; userCode: string | null; level?: string | null; kelompok: string | null }
  kelas: { id: string; nama: string; tingkat: string; tahun: number; waliName: string | null } | null
  instansi: { name: string; logo: string; alamat?: string; title?: string }
  periode: { from: string; to: string }
  kehadiran: LaporanKehadiran
  kurikulum: LaporanTema[]
  library: LaporanLibrary[]
  ringkasan: { tuntas: number; proses: number; belum: number; pctTuntas: number; rataNilai?: number | null }
}

export type LaporanParams = {
  from: string
  to: string
  fromUmur?: number
  fromSem?: number
  toUmur?: number
  toSem?: number
}

function laporanQs(p: LaporanParams) {
  const sp = new URLSearchParams({ from: p.from, to: p.to })
  if (p.fromUmur != null) sp.set('fromUmur', String(p.fromUmur))
  if (p.fromSem != null) sp.set('fromSem', String(p.fromSem))
  if (p.toUmur != null) sp.set('toUmur', String(p.toUmur))
  if (p.toSem != null) sp.set('toSem', String(p.toSem))
  return sp
}

export function getLaporanMurid(muridId: string, p: LaporanParams) {
  return apiFetch<LaporanResponse>(`/api/laporan/murid/${encodeURIComponent(muridId)}?${laporanQs(p)}`)
}

/** Plain same-origin URL for the xlsx download button (cookie auth rides along). */
export function laporanXlsxUrl(muridId: string, p: LaporanParams) {
  const sp = laporanQs(p)
  sp.set('format', 'xlsx')
  return `/api/laporan/murid/${encodeURIComponent(muridId)}?${sp}`
}
