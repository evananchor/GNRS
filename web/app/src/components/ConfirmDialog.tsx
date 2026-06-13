import { useTranslation } from 'react-i18next'

export function ConfirmDialog({
  open, title, message, confirmLabel, onConfirm, onCancel, busy,
}: {
  open: boolean
  title: string
  message?: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  if (!open) return null
  return (
    <div
      role="dialog" aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-sm rounded-lg bg-white text-slate-900 p-4 shadow-xl">
        <h3 className="text-base font-semibold">{title}</h3>
        {message ? <p className="mt-1.5 text-sm text-slate-600">{message}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
