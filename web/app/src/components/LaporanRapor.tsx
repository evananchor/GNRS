import { useTranslation } from 'react-i18next'

import { type LaporanResponse } from '@/api/laporan'
import { cn } from '@/lib/cn'

const STATUS_CHIP: Record<string, string> = {
  tuntas: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  proses: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
  belum: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200',
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
      {/* Kop */}
      <header className="flex items-center gap-3 border-b-2 border-slate-900 pb-3">
        {data.instansi.logo ? <img src={data.instansi.logo} alt="" className="h-12 w-12 object-contain" /> : null}
        <div className="flex-1">
          <div className="text-lg font-bold leading-tight">GNRS{data.instansi.name ? ` ${data.instansi.name}` : ''}</div>
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
          data.kurikulum.map((tema) => (
            <div key={tema.tema} className="mb-3 break-inside-avoid">
              <div className="rounded-t-md bg-slate-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">{tema.tema}</div>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {tema.items.map((it, i) => (
                    <tr key={`${it.materi}-${it.subTema}-${i}`} className="border-b border-slate-100">
                      <td className="px-2 py-1">
                        {it.changedInPeriod ? <span className="mr-1 text-emerald-600">●</span> : null}
                        {it.materi}
                        {it.subTema ? <span className="ml-1 text-xs text-slate-400">({it.subTema})</span> : null}
                      </td>
                      <td className="w-24 px-2 py-1 text-right">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_CHIP[it.status])}>
                          {t(`achievement.laporan.status.${it.status}`)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
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
