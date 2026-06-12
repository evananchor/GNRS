import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'

import { type LaporanItem, type LaporanResponse } from '@/api/laporan'
import { cn } from '@/lib/cn'

const STATUS_CHIP: Record<string, string> = {
  tuntas: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  proses: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
  belum: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200',
}

type Counts = { tuntas: number; proses: number; belum: number; changed: number; total: number }
type KelNode = { key: string; label: string; items: LaporanItem[]; counts: Counts }
type SubNode = { key: string; label: string; flat: LaporanItem[]; kelompoks: KelNode[]; counts: Counts }
type TemaNode = { key: string; label: string; flat: LaporanItem[]; subs: SubNode[]; counts: Counts }

const emptyCounts = (): Counts => ({ tuntas: 0, proses: 0, belum: 0, changed: 0, total: 0 })

function addTo(c: Counts, it: LaporanItem) {
  c.total++
  if (it.status === 'tuntas') c.tuntas++
  else if (it.status === 'proses') c.proses++
  else c.belum++
  if (it.changedInPeriod) c.changed++
}

// Build tema → sub-tema → kelompok tree from a tema's flat item list,
// preserving first-seen order at each level. Items with empty subTema sit
// directly under the tema (`flat`); items with a subTema but empty
// kelompokMateri sit directly under the sub (`sub.flat`).
function buildTema(temaLabel: string, items: LaporanItem[]): TemaNode {
  const tema: TemaNode = { key: temaLabel, label: temaLabel, flat: [], subs: [], counts: emptyCounts() }
  const subByLabel = new Map<string, SubNode>()
  const kelByKey = new Map<string, KelNode>()

  for (const it of items) {
    addTo(tema.counts, it)
    const subLabel = (it.subTema ?? '').trim()
    if (!subLabel) {
      tema.flat.push(it)
      continue
    }
    let sub = subByLabel.get(subLabel)
    if (!sub) {
      sub = { key: `${temaLabel}::${subLabel}`, label: subLabel, flat: [], kelompoks: [], counts: emptyCounts() }
      subByLabel.set(subLabel, sub)
      tema.subs.push(sub)
    }
    addTo(sub.counts, it)
    const kelLabel = (it.kelompokMateri ?? '').trim()
    if (!kelLabel) {
      sub.flat.push(it)
      continue
    }
    const kelKey = `${sub.key}::${kelLabel}`
    let kel = kelByKey.get(kelKey)
    if (!kel) {
      kel = { key: kelKey, label: kelLabel, items: [], counts: emptyCounts() }
      kelByKey.set(kelKey, kel)
      sub.kelompoks.push(kel)
    }
    addTo(kel.counts, it)
    kel.items.push(it)
  }
  return tema
}

function ItemRow({ it }: { it: LaporanItem }) {
  const { t } = useTranslation()
  return (
    <tr className="border-b border-slate-100">
      <td className="px-2 py-1">
        {it.changedInPeriod ? <span className="mr-1 text-emerald-600">●</span> : null}
        {it.materi}
      </td>
      <td className="w-24 px-2 py-1 text-right">
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_CHIP[it.status])}>
          {t(`achievement.laporan.status.${it.status}`)}
        </span>
      </td>
    </tr>
  )
}

function GroupHeader({
  label, counts, open, onToggle, level,
}: { label: string; counts: Counts; open: boolean; onToggle: () => void; level: 0 | 1 | 2 }) {
  const { t } = useTranslation()
  const pct = counts.total ? Math.round((counts.tuntas * 100) / counts.total) : 0
  const pad = level === 0 ? 'px-2' : level === 1 ? 'px-2 pl-5' : 'px-2 pl-8'
  const weight = level === 0 ? 'font-bold uppercase tracking-wide' : level === 1 ? 'font-semibold' : 'font-medium'
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn('flex w-full items-center gap-2 rounded-t-md bg-slate-100 py-1 text-left text-xs text-slate-700', pad, weight)}
    >
      <ChevronRight size={13} className={cn('shrink-0 transition-transform print:hidden', open && 'rotate-90')} />
      <span className="flex-1">{label}</span>
      {counts.changed > 0 ? (
        <span className="shrink-0 text-[10px] font-medium text-emerald-600">● {t('achievement.laporan.changedCount', { n: counts.changed })}</span>
      ) : null}
      <span className="hidden shrink-0 text-[10px] font-normal text-slate-500 sm:inline">
        {t('achievement.laporan.countLine', { tuntas: counts.tuntas, proses: counts.proses, belum: counts.belum })}
      </span>
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <span className="block h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </span>
    </button>
  )
}

function KurikulumTree({ kurikulum }: { kurikulum: LaporanResponse['kurikulum'] }) {
  const { t } = useTranslation()
  const temas = useMemo(() => kurikulum.map((tm) => buildTema(tm.tema, tm.items)), [kurikulum])

  const allKeys = useMemo(() => {
    const keys: string[] = []
    for (const tm of temas) {
      keys.push(tm.key)
      for (const sub of tm.subs) {
        keys.push(sub.key)
        for (const kel of sub.kelompoks) keys.push(kel.key)
      }
    }
    return keys
  }, [temas])

  const defaultOpen = useMemo(() => {
    const open = new Set<string>()
    for (const tm of temas) {
      if (tm.flat.some((it) => it.changedInPeriod)) open.add(tm.key)
      for (const sub of tm.subs) {
        if (sub.flat.some((it) => it.changedInPeriod)) { open.add(tm.key); open.add(sub.key) }
        for (const kel of sub.kelompoks) {
          if (kel.items.some((it) => it.changedInPeriod)) { open.add(tm.key); open.add(sub.key); open.add(kel.key) }
        }
      }
    }
    return open
  }, [temas])

  const [open, setOpen] = useState<Set<string>>(defaultOpen)
  useEffect(() => { setOpen(new Set(defaultOpen)) }, [defaultOpen])

  const toggle = (key: string) =>
    setOpen((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const isOpen = (key: string) => open.has(key)

  return (
    <>
      <div className="mb-2 flex gap-2 print:hidden">
        <button type="button" onClick={() => setOpen(new Set(allKeys))} className="text-xs font-medium text-emerald-700 hover:underline">
          {t('achievement.laporan.bukaSemua')}
        </button>
        <span className="text-slate-300">·</span>
        <button type="button" onClick={() => setOpen(new Set())} className="text-xs font-medium text-slate-600 hover:underline">
          {t('achievement.laporan.tutupSemua')}
        </button>
      </div>

      {temas.map((tm) => (
        <div key={tm.key} className="mb-3 break-inside-avoid">
          <GroupHeader label={tm.label} counts={tm.counts} open={isOpen(tm.key)} onToggle={() => toggle(tm.key)} level={0} />
          {isOpen(tm.key) ? (
            <div className="border border-t-0 border-slate-100">
              {tm.flat.length ? (
                <table className="w-full border-collapse text-sm"><tbody>
                  {tm.flat.map((it, i) => <ItemRow key={`${it.materi}-${i}`} it={it} />)}
                </tbody></table>
              ) : null}
              {tm.subs.map((sub) => (
                <div key={sub.key}>
                  <GroupHeader label={sub.label} counts={sub.counts} open={isOpen(sub.key)} onToggle={() => toggle(sub.key)} level={1} />
                  {isOpen(sub.key) ? (
                    <>
                      {sub.flat.length ? (
                        <table className="w-full border-collapse text-sm"><tbody>
                          {sub.flat.map((it, i) => <ItemRow key={`${it.materi}-${i}`} it={it} />)}
                        </tbody></table>
                      ) : null}
                      {sub.kelompoks.map((kel) => (
                        <div key={kel.key}>
                          <GroupHeader label={kel.label} counts={kel.counts} open={isOpen(kel.key)} onToggle={() => toggle(kel.key)} level={2} />
                          {isOpen(kel.key) ? (
                            <table className="w-full border-collapse text-sm"><tbody>
                              {kel.items.map((it, i) => <ItemRow key={`${it.materi}-${i}`} it={it} />)}
                            </tbody></table>
                          ) : null}
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </>
  )
}

/**
 * LaporanRapor — print-ready per-murid report body. Wrapped in
 * #laporan-print-area so the @media print rules in index.css isolate it.
 */
export function LaporanRapor({ data, periodeLabel }: { data: LaporanResponse; periodeLabel: string }) {
  const { t } = useTranslation()
  const printedOn = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div id="laporan-print-area" className="mx-auto max-w-3xl space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
      {/* Running header — hidden on screen, repeats on printed pages 2+ */}
      <div className="laporan-running-head">
        <span className="font-semibold">{data.murid.name}{data.murid.nickname ? ` (${data.murid.nickname})` : ''}</span>
        <span className="mx-2 text-slate-400">·</span>
        <span>{periodeLabel}</span>
      </div>
      {/* Kop */}
      <header className="instansi-kop flex items-center gap-3 border-b-2 border-slate-900 pb-3">
        {data.instansi.logo ? <img src={data.instansi.logo} alt="" className="h-12 w-12 object-contain" /> : null}
        <div className="flex-1">
          <div className="text-lg font-bold leading-tight">GNRS{data.instansi.name ? ` ${data.instansi.name}` : ''}</div>
          {data.instansi.alamat ? <div className="text-xs text-slate-500">{data.instansi.alamat}</div> : null}
          {data.instansi.title ? <div className="mt-0.5 text-sm font-semibold uppercase tracking-wide text-slate-800">{data.instansi.title}</div> : null}
          <div className="text-sm font-semibold text-slate-700">{periodeLabel}</div>
          <div className="text-xs text-slate-500">
            {data.periode.from} — {data.periode.to} · {t('achievement.laporan.printedOn', { date: printedOn })}
          </div>
        </div>
      </header>

      {/* Identitas */}
      <section>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-600">{t('achievement.laporan.identitas')}</h3>
        <table className="w-full text-sm">
          <tbody>
            <tr><td className="w-36 py-0.5 text-slate-500">{t('achievement.laporan.nama')}</td><td className="font-medium">{data.murid.name}{data.murid.nickname ? ` (${data.murid.nickname})` : ''}</td></tr>
            {data.murid.userCode ? <tr><td className="py-0.5 text-slate-500">{t('achievement.laporan.kode')}</td><td>{data.murid.userCode}</td></tr> : null}
            <tr><td className="py-0.5 text-slate-500">{t('achievement.laporan.kelas')}</td><td>{data.kelas ? `${data.kelas.nama} · ${data.kelas.tingkat} · ${data.kelas.tahun}${data.kelas.waliName ? ` — ${t('achievement.laporan.wali')} ${data.kelas.waliName}` : ''}` : '—'}</td></tr>
            {data.murid.kelompok ? <tr><td className="py-0.5 text-slate-500">{t('achievement.laporan.kelompok')}</td><td>{data.murid.kelompok}</td></tr> : null}
          </tbody>
        </table>
      </section>

      {/* Kehadiran */}
      <section>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-600">{t('achievement.laporan.kehadiran')}</h3>
        <table className="w-full border-collapse text-center text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-600">
              <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.hadir')}</th>
              <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.izinMurid')}</th>
              <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.izinGuru')}</th>
              <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.byVn')}</th>
              <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.alfa')}</th>
              <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.total')}</th>
              <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.pctHadir')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-200 px-2 py-1 font-semibold text-emerald-700">{data.kehadiran.hadir}</td>
              <td className="border border-slate-200 px-2 py-1">{data.kehadiran.izinMurid}</td>
              <td className="border border-slate-200 px-2 py-1">{data.kehadiran.izinGuru}</td>
              <td className="border border-slate-200 px-2 py-1">{data.kehadiran.byVn}</td>
              <td className="border border-slate-200 px-2 py-1 text-rose-600">{data.kehadiran.alfa}</td>
              <td className="border border-slate-200 px-2 py-1">{data.kehadiran.total}</td>
              <td className="border border-slate-200 px-2 py-1 font-semibold">{data.kehadiran.pctHadir.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Kurikulum */}
      <section>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-600">{t('achievement.laporan.kurikulum')}</h3>
        <p className="mb-2 text-[11px] text-slate-500">● {t('achievement.laporan.legend')}</p>
        {data.kurikulum.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-400">{t('achievement.laporan.empty')}</p>
        ) : (
          <KurikulumTree kurikulum={data.kurikulum} />
        )}
        <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
          <span className="font-semibold">{t('achievement.laporan.ringkasan')}: </span>
          {t('achievement.laporan.ringkasanLine', {
            tuntas: data.ringkasan.tuntas, proses: data.ringkasan.proses,
            belum: data.ringkasan.belum, pct: data.ringkasan.pctTuntas.toFixed(1),
          })}
        </div>
      </section>

      {/* Library */}
      <section className="break-inside-avoid">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-600">{t('achievement.laporan.library')}</h3>
        {data.library.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-400">{t('achievement.laporan.empty')}</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-600">
                <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.jenisCol')}</th>
                <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.aspek')}</th>
                <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.referensi')}</th>
                <th className="border border-slate-200 px-2 py-1">{t('achievement.laporan.statusLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {data.library.map((l, i) => (
                <tr key={`${l.kind}-${l.ref}-${i}`}>
                  <td className="border border-slate-200 px-2 py-1 capitalize">{l.changedInPeriod ? <span className="mr-1 text-emerald-600">●</span> : null}{l.kind}</td>
                  <td className="border border-slate-200 px-2 py-1">{l.aspect ?? '—'}</td>
                  <td className="border border-slate-200 px-2 py-1">{l.ref}</td>
                  <td className="border border-slate-200 px-2 py-1">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_CHIP[l.status] ?? STATUS_CHIP.belum)}>
                      {t(`achievement.laporan.status.${l.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Tanda tangan */}
      <footer className="break-inside-avoid pt-4">
        <div className="grid grid-cols-2 gap-8 text-center text-sm">
          <div>
            <div className="mb-14">{t('achievement.laporan.ttdWali')}</div>
            <div className="border-t border-dotted border-slate-400 pt-1 text-xs text-slate-500">{data.kelas?.waliName ?? '(' + t('achievement.laporan.nama') + ')'}</div>
          </div>
          <div>
            <div className="mb-14">{t('achievement.laporan.ttdOrtu')}</div>
            <div className="border-t border-dotted border-slate-400 pt-1 text-xs text-slate-500">({t('achievement.laporan.nama')})</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
