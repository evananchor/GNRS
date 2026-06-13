# Cancel/remove a material (incl. done) with double-confirm

**Date:** 2026-06-13 · **Status:** Approved · **Track:** gnrs-evan

Let a teacher remove a taught material from the sesi record — **even one already
marked done** — from two places, each guarded by a **confirmation popup**.
"Cancel" = delete the `diajarkan` record (`deleteDiajarkan`, exists). Extends PR #14
(which only let you remove *not-done* items in the end dialog, no confirm).

## Shared confirm popup
New `web/app/src/components/ConfirmDialog.tsx` — small theme-independent modal
(`bg-white text-slate-900`, since the live stage is dark) with a title/message and
Batal / confirm (danger) buttons. Props: `{ open, title, message, confirmLabel,
onConfirm, onCancel }`. Used by both call sites.

## 1. End-of-session dialog (`EndSesiSummaryDialog.tsx`)
- Show the **Hapus** button on **every** materi row (currently only `!it.completed`).
- Clicking Hapus opens the ConfirmDialog ("Hapus materi ini dari catatan sesi?");
  confirming calls the existing `removeMut.mutate(id)`.

## 2. Live-stage History panel (`LiveSesi.tsx`)
- In the History panel (rendered when `historyOpen`, lists `diajarkan`), add a
  **Hapus** button per row → ConfirmDialog → `deleteDiajarkan(sesiId, id)` +
  invalidate `['diajarkan', sesiId]`. Works for done and not-done items.

## i18n (id+en parity)
`common.cancel` (reuse if present), `sesiDialog.summary.removeConfirmTitle`/`removeConfirmMsg`,
`live.removeConfirmTitle`/`live.removeConfirmMsg`/`live.removeItem`. Reuse existing
`removeItem`/`removeFailed` where they already exist.

## Out of scope
"Uncomplete" (status revert) — operator chose delete-from-record. PPT/Video (separate).

## Testing
typecheck; rebuild :8300; browser: end dialog shows Hapus on a done item → confirm popup → removed; History panel Hapus → confirm → removed. (API delete already verified in PR #14.)
