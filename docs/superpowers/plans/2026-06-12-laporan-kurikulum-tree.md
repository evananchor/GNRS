# Laporan Kurikulum Tree + Custom Letterhead + Print Running Header — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Laporan Rapor curriculum section an interactive tema → sub-tema → kelompok tree, add an editable letterhead (address + report title) in Settings, and print a slim running header on continued pages.

**Architecture:** One additive backend field (`kelompokMateri`) plus two extra `instansi` settings reads in the existing laporan handler — no migration. The frontend report builds a three-level collapsible tree from the flat item list, seeds open-state from changed-in-period items, and uses a fixed-position running header (opaque-cover technique) for multi-page print. Letterhead fields ride the existing generic key/value settings store and the existing batch `updateSettings` call.

**Tech Stack:** Go (chi, SQLite, excelize), React 18 + TypeScript, TanStack Query, Tailwind v3, react-i18next.

**Branch/worktree:** `feat/laporan-tree` in `.claude/worktrees/laporan-tree`, forked from `gnrs-evan`. PR targets `gnrs-evan`.

**Testing note (read first):** This repo has **no frontend unit-test framework** (no vitest/jest) and **no handler-test harness** for laporan — backend laporan logic was verified at the API level for PR #8, and frontend via the browser pass. This plan follows that established convention: backend field plumbing is verified with live API assertions (`curl`/browser `fetch`), the grouping logic and print layout via the headless-browser pass. Do **not** scaffold vitest or a handler test harness — that is out of scope (YAGNI) and breaks the repo pattern. `make typecheck` and `make test` (existing Go tests) still run every task that touches Go/TS.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `internal/handler/laporan.go` | JSON assembly | add `KelompokMateri` to `laporanItem` + populate; read `instansi_alamat`/`instansi_title` into `instansiMap` |
| `internal/handler/laporan_xlsx.go` | xlsx export | add "Kelompok" column to Kurikulum sheet |
| `web/app/src/api/laporan.ts` | client types | add `kelompokMateri?` to `LaporanItem`; `alamat`/`title` to `instansi` |
| `web/app/src/pages/sections/InstansiSection.tsx` | Settings letterhead UI | add Alamat + Judul laporan inputs, save in existing batch |
| `web/app/src/components/LaporanRapor.tsx` | report body | kop renders alamat/title; curriculum becomes collapsible tree; running header element |
| `web/app/src/index.css` | print CSS | running-header print rules |
| `web/app/src/locales/{id,en}.json` | i18n | `achievement.laporan.bukaSemua/tutupSemua/changedCount`; `instansi.alamatLabel/alamatHint/alamatPh/reportTitleLabel/reportTitleHint/reportTitlePh` |

---

## Task 1: Backend — `kelompokMateri` on laporan items + letterhead fields in response

**Files:**
- Modify: `internal/handler/laporan.go` (struct ~67-73, instansi block ~165-176, grouping loop ~240-256)
- Modify: `internal/handler/laporan_xlsx.go` (Kurikulum sheet ~94-103)

- [ ] **Step 1: Add `KelompokMateri` to the item struct**

In `internal/handler/laporan.go`, change `laporanItem` (currently):

```go
type laporanItem struct {
	Materi          string  `json:"materi"`
	SubTema         string  `json:"subTema"`
	Status          string  `json:"status"` // belum|proses|tuntas
	ChangedInPeriod bool    `json:"changedInPeriod"`
	Tanggal         *string `json:"tanggal,omitempty"`
}
```

to add the kelompok field after `SubTema`:

```go
type laporanItem struct {
	Materi          string  `json:"materi"`
	SubTema         string  `json:"subTema"`
	KelompokMateri  string  `json:"kelompokMateri,omitempty"`
	Status          string  `json:"status"` // belum|proses|tuntas
	ChangedInPeriod bool    `json:"changedInPeriod"`
	Tanggal         *string `json:"tanggal,omitempty"`
}
```

- [ ] **Step 2: Populate it in the grouping loop**

`it.Materi.KelompokMateri` is `*string` (nil when absent). In the loop that builds each `laporanItem` (the `temaMap[tema].Items = append(...)` call), add a nil-safe deref. Replace:

```go
		temaMap[tema].Items = append(temaMap[tema].Items, laporanItem{
			Materi:          it.Materi.DetailMateri,
			SubTema:         it.Materi.SubTema,
			Status:          status,
			ChangedInPeriod: inPeriod(it.Pencapaian, from, to),
			Tanggal:         tanggal,
		})
```

with:

```go
		kelompok := ""
		if it.Materi.KelompokMateri != nil {
			kelompok = strings.TrimSpace(*it.Materi.KelompokMateri)
		}
		temaMap[tema].Items = append(temaMap[tema].Items, laporanItem{
			Materi:          it.Materi.DetailMateri,
			SubTema:         it.Materi.SubTema,
			KelompokMateri:  kelompok,
			Status:          status,
			ChangedInPeriod: inPeriod(it.Pencapaian, from, to),
			Tanggal:         tanggal,
		})
```

Confirm `strings` is imported at the top of the file; if not, add it to the import block.

- [ ] **Step 3: Read letterhead settings into the instansi map**

Find the instansi block (best-effort settings read). Replace:

```go
	// Instansi settings (best-effort — empty string on error).
	instansiName := ""
	instansiLogo := ""
	if cfg, err := h.settings.GetAll(r.Context()); err == nil {
		instansiName = cfg["instansi_name"]
		instansiLogo = cfg["instansi_logo"]
	}
	instansiMap := map[string]any{
		"name": instansiName,
		"logo": instansiLogo,
	}
```

with:

```go
	// Instansi settings (best-effort — empty string on error).
	instansiName := ""
	instansiLogo := ""
	instansiAlamat := ""
	instansiTitle := ""
	if cfg, err := h.settings.GetAll(r.Context()); err == nil {
		instansiName = cfg["instansi_name"]
		instansiLogo = cfg["instansi_logo"]
		instansiAlamat = cfg["instansi_alamat"]
		instansiTitle = cfg["instansi_title"]
	}
	instansiMap := map[string]any{
		"name":   instansiName,
		"logo":   instansiLogo,
		"alamat": instansiAlamat,
		"title":  instansiTitle,
	}
```

- [ ] **Step 4: Add the Kelompok column to the xlsx Kurikulum sheet**

In `internal/handler/laporan_xlsx.go`, the Kurikulum sheet writes a header row then one row per item. Replace:

```go
	kset("Tema", "Sub Tema", "Materi", "Status", "Berubah Dlm Periode", "Tanggal")
	for _, tema := range rep.Kurikulum {
		for _, it := range tema.Items {
			tgl := ""
			if it.Tanggal != nil {
				tgl = *it.Tanggal
			}
			kset(tema.Tema, it.SubTema, it.Materi, it.Status, it.ChangedInPeriod, tgl)
		}
	}
```

with (insert "Kelompok" between "Sub Tema" and "Materi" in both the header and the row):

```go
	kset("Tema", "Sub Tema", "Kelompok", "Materi", "Status", "Berubah Dlm Periode", "Tanggal")
	for _, tema := range rep.Kurikulum {
		for _, it := range tema.Items {
			tgl := ""
			if it.Tanggal != nil {
				tgl = *it.Tanggal
			}
			kset(tema.Tema, it.SubTema, it.KelompokMateri, it.Materi, it.Status, it.ChangedInPeriod, tgl)
		}
	}
```

- [ ] **Step 5: Build + existing tests pass**

No local Go toolchain — build via container (same as PR #8). Run from the worktree root:

```bash
podman run --rm -v "$PWD":/src -w /src golang:1.25-alpine \
  sh -c 'apk add --no-cache gcc musl-dev >/dev/null && go vet ./internal/handler/ && go test ./internal/...'
```

Expected: `go vet` clean; `go test` PASS (existing store tests unaffected — this change is handler-only).

- [ ] **Step 6: Commit**

```bash
git add internal/handler/laporan.go internal/handler/laporan_xlsx.go
git commit -m "feat(laporan): add kelompok materi + letterhead fields to report"
```

---

## Task 2: Frontend API types

**Files:**
- Modify: `web/app/src/api/laporan.ts` (`LaporanItem` ~13-18, `LaporanResponse.instansi` ~33)

- [ ] **Step 1: Add `kelompokMateri` to `LaporanItem`**

Replace:

```ts
export type LaporanItem = {
  materi: string
  subTema: string
  status: 'belum' | 'proses' | 'tuntas'
  changedInPeriod: boolean
  tanggal?: string | null
}
```

with:

```ts
export type LaporanItem = {
  materi: string
  subTema: string
  kelompokMateri?: string
  status: 'belum' | 'proses' | 'tuntas'
  changedInPeriod: boolean
  tanggal?: string | null
}
```

- [ ] **Step 2: Add `alamat`/`title` to the instansi shape**

Replace `instansi: { name: string; logo: string }` in `LaporanResponse` with:

```ts
  instansi: { name: string; logo: string; alamat?: string; title?: string }
```

- [ ] **Step 3: Typecheck**

```bash
cd web/app && npm run typecheck
```

Expected: PASS (no usages broken; fields are additive/optional).

- [ ] **Step 4: Commit**

```bash
git add web/app/src/api/laporan.ts
git commit -m "feat(laporan): client types for kelompok + letterhead"
```

---

## Task 3: Settings letterhead UI (Alamat + Judul laporan)

**Files:**
- Modify: `web/app/src/pages/sections/InstansiSection.tsx`
- Modify: `web/app/src/locales/id.json`, `web/app/src/locales/en.json`

- [ ] **Step 1: Add i18n keys (id)**

In `web/app/src/locales/id.json`, inside the `instansi` object, add after `"namaPh"`:

```json
    "alamatLabel": "Alamat",
    "alamatHint": "Dicetak di kop laporan, di bawah nama instansi.",
    "alamatPh": "Jl. Contoh No. 1, Kota, Provinsi",
    "reportTitleLabel": "Judul laporan",
    "reportTitleHint": "Baris judul pada kop laporan — contoh: LAPORAN HASIL BELAJAR.",
    "reportTitlePh": "LAPORAN HASIL BELAJAR",
```

- [ ] **Step 2: Add i18n keys (en, parity)**

In `web/app/src/locales/en.json`, inside the `instansi` object, add the same keys:

```json
    "alamatLabel": "Address",
    "alamatHint": "Printed on the report letterhead, below the institution name.",
    "alamatPh": "123 Example St, City, Province",
    "reportTitleLabel": "Report title",
    "reportTitleHint": "Title line on the report letterhead — e.g. LAPORAN HASIL BELAJAR.",
    "reportTitlePh": "LAPORAN HASIL BELAJAR",
```

- [ ] **Step 3: Add local state + load from settings**

In `InstansiSection.tsx`, after the existing `logoData` state:

```tsx
  const [logoData, setLogoData] = useState<string>('')
```

add:

```tsx
  const [alamat, setAlamat] = useState('')
  const [reportTitle, setReportTitle] = useState('')
```

Then extend the `useEffect` that seeds from settings. Replace:

```tsx
  useEffect(() => {
    setNama(settings.instansi_name ?? '')
    setLogoData(settings.instansi_logo ?? '')
  }, [settings.instansi_name, settings.instansi_logo])
```

with:

```tsx
  useEffect(() => {
    setNama(settings.instansi_name ?? '')
    setLogoData(settings.instansi_logo ?? '')
    setAlamat(settings.instansi_alamat ?? '')
    setReportTitle(settings.instansi_title ?? '')
  }, [settings.instansi_name, settings.instansi_logo, settings.instansi_alamat, settings.instansi_title])
```

- [ ] **Step 4: Save the new keys in the existing batch**

Replace the `handleSubmit` mutate payload:

```tsx
    mut.mutate({
      instansi_name: nama.trim(),
      instansi_logo: logoData,
    })
```

with:

```tsx
    mut.mutate({
      instansi_name: nama.trim(),
      instansi_logo: logoData,
      instansi_alamat: alamat.trim(),
      instansi_title: reportTitle.trim(),
    })
```

- [ ] **Step 5: Render the two fields**

Immediately after the existing Nama `<Field>` block (the one wrapping `id="instansi-nama"`) and before the preview `<div className="rounded-md border border-dashed ...">`, insert:

```tsx
          <Field
            label={t('instansi.alamatLabel')}
            htmlFor="instansi-alamat"
            hint={t('instansi.alamatHint')}
          >
            <textarea
              id="instansi-alamat"
              value={alamat}
              onChange={(e) => setAlamat(e.target.value)}
              placeholder={t('instansi.alamatPh')}
              maxLength={200}
              rows={2}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field
            label={t('instansi.reportTitleLabel')}
            htmlFor="instansi-title"
            hint={t('instansi.reportTitleHint')}
          >
            <Input
              id="instansi-title"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder={t('instansi.reportTitlePh')}
              maxLength={120}
            />
          </Field>
```

(`Input` and `Field` are already imported in this file.)

- [ ] **Step 6: Typecheck**

```bash
cd web/app && npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/app/src/pages/sections/InstansiSection.tsx web/app/src/locales/id.json web/app/src/locales/en.json
git commit -m "feat(instansi): editable letterhead address + report title"
```

---

## Task 4: Report kop renders alamat + title

**Files:**
- Modify: `web/app/src/components/LaporanRapor.tsx` (kop header ~22-32)

- [ ] **Step 1: Render alamat + title in the kop**

Replace the kop header block:

```tsx
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
```

with (adds an `instansi-kop` class for the print z-index cover, the address line, and the title line):

```tsx
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
```

- [ ] **Step 2: Typecheck**

```bash
cd web/app && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/app/src/components/LaporanRapor.tsx
git commit -m "feat(laporan): kop shows letterhead address + title"
```

---

## Task 5: Curriculum collapsible tree (tema → sub-tema → kelompok)

**Files:**
- Modify: `web/app/src/components/LaporanRapor.tsx` (Kurikulum section ~76-114; add imports + helper + sub-component)
- Modify: `web/app/src/locales/id.json`, `web/app/src/locales/en.json`

This task replaces the flat per-tema table with a three-level tree. The grouping helper is a pure function; open-state lives in a dedicated `KurikulumTree` sub-component so the rest of the report stays a pure render.

- [ ] **Step 1: Add i18n keys (id)**

In `web/app/src/locales/id.json`, inside `achievement.laporan`, add after `"legend"`:

```json
    "bukaSemua": "Buka semua",
    "tutupSemua": "Tutup semua",
    "changedCount": "{{n}} berubah",
    "countLine": "{{tuntas}} tuntas · {{proses}} proses · {{belum}} belum",
```

- [ ] **Step 2: Add i18n keys (en, parity)**

In `web/app/src/locales/en.json`, inside `achievement.laporan`, add:

```json
    "bukaSemua": "Expand all",
    "tutupSemua": "Collapse all",
    "changedCount": "{{n}} changed",
    "countLine": "{{tuntas}} done · {{proses}} in progress · {{belum}} not started",
```

- [ ] **Step 3: Add imports + status icon**

At the top of `web/app/src/components/LaporanRapor.tsx`, replace the import block:

```tsx
import { useTranslation } from 'react-i18next'

import { type LaporanResponse } from '@/api/laporan'
import { cn } from '@/lib/cn'
```

with:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'

import { type LaporanItem, type LaporanResponse } from '@/api/laporan'
import { cn } from '@/lib/cn'
```

- [ ] **Step 4: Add the pure grouping helper + types (above the `LaporanRapor` component)**

Insert after the `STATUS_CHIP` constant:

```tsx
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
```

- [ ] **Step 5: Add shared presentational bits (count badge + progress bar + chevron header)**

Insert after `buildTema`:

```tsx
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
```

- [ ] **Step 6: Add the `KurikulumTree` sub-component (open-state + default-open-changed + Buka/Tutup)**

Insert after `GroupHeader`:

```tsx
function KurikulumTree({ kurikulum }: { kurikulum: LaporanResponse['kurikulum'] }) {
  const { t } = useTranslation()
  const temas = useMemo(() => kurikulum.map((tm) => buildTema(tm.tema, tm.items)), [kurikulum])

  // All collapsible keys (tema, tema::sub, tema::sub::kel).
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

  // Default open = every key on the path to a changed-in-period item.
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
  // Reset open-state whenever the report data (murid/period) changes.
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
```

- [ ] **Step 7: Use `KurikulumTree` in the Kurikulum section**

Replace the flat render (the `data.kurikulum.length === 0 ? ... : data.kurikulum.map(...)` block) — i.e. replace:

```tsx
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
```

with:

```tsx
        {data.kurikulum.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-400">{t('achievement.laporan.empty')}</p>
        ) : (
          <KurikulumTree kurikulum={data.kurikulum} />
        )}
```

- [ ] **Step 8: Typecheck**

```bash
cd web/app && npm run typecheck
```

Expected: PASS. (Verify no unused-import lint: `cn` is still used by `ItemRow`/`GroupHeader`; `useMemo`/`useEffect`/`useState` all used in `KurikulumTree`.)

- [ ] **Step 9: Commit**

```bash
git add web/app/src/components/LaporanRapor.tsx web/app/src/locales/id.json web/app/src/locales/en.json
git commit -m "feat(laporan): interactive tema/sub/kelompok curriculum tree"
```

---

## Task 6: Print running header (slim header on page 2+)

**Files:**
- Modify: `web/app/src/components/LaporanRapor.tsx` (add running-head element as first child of `#laporan-print-area`)
- Modify: `web/app/src/index.css` (print rules)

The running header is hidden on screen, fixed-position in print. Page 1's full kop covers it via a higher z-index opaque background; pages 2+ show only the slim line.

- [ ] **Step 1: Add the running-head element**

In `LaporanRapor.tsx`, make it the first child inside `#laporan-print-area` — right after the opening `<div id="laporan-print-area" ...>` and before `{/* Kop */}`:

```tsx
      {/* Running header — hidden on screen, repeats on printed pages 2+ */}
      <div className="laporan-running-head">
        <span className="font-semibold">{data.murid.name}{data.murid.nickname ? ` (${data.murid.nickname})` : ''}</span>
        <span className="mx-2 text-slate-400">·</span>
        <span>{periodeLabel}</span>
      </div>
```

- [ ] **Step 2: Add the print CSS**

In `web/app/src/index.css`, inside the existing `@media print { ... }` block (after the `#laporan-print-area { ... }` rule), add:

```css
  /* Slim running header: hidden on page 1 (covered by the opaque kop),
     visible on continued pages. */
  .laporan-running-head {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1;
    padding: 2mm 0;
    border-bottom: 1px solid #cbd5e1;
    background: #ffffff;
    font-size: 10px;
    color: #475569;
  }
  /* The full kop paints above the running head on page 1. */
  .instansi-kop {
    position: relative;
    z-index: 2;
    background: #ffffff;
  }
  /* Reserve top space so continued-page content clears the fixed header. */
  @page {
    margin-top: 20mm;
  }
```

And add the screen-hide rule **outside** the `@media print` block (so it is hidden by default on screen). At the end of `index.css`:

```css
/* Running header only exists for print. */
.laporan-running-head {
  display: none;
}
@media print {
  .laporan-running-head {
    display: block;
  }
}
```

Note: the existing `@media print` block already sets `@page { margin: 14mm }`. Keep that rule; the added `@page { margin-top: 20mm }` overrides only the top. To avoid a conflicting duplicate `@page`, instead of adding a second `@page`, **edit the existing one** from `margin: 14mm;` to:

```css
  @page {
    size: A4;
    margin: 14mm;
    margin-top: 20mm;
  }
```

(Do this edit rather than adding a second `@page` block.)

- [ ] **Step 3: Typecheck**

```bash
cd web/app && npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/app/src/components/LaporanRapor.tsx web/app/src/index.css
git commit -m "feat(laporan): slim running header on printed pages 2+"
```

---

## Task 7: Rebuild, browser pass, PR, merge, cleanup

**Files:** none (verification + delivery)

- [ ] **Step 1: Rebuild the dogfood `:8300` container** (operator preference — main container, not a dev container)

From the worktree root:

```bash
docker-compose up -d --build
curl -s http://127.0.0.1:8300/healthz
```

Expected: image rebuilt, container recreated, `healthz` 200.

- [ ] **Step 2: API assertions (backend fields land)**

Drive via the authenticated headless browser session (cookie auth). Using the gstack browse binary already logged in as admin:

```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
# kelompokMateri present on at least one item:
$B js "fetch('/api/laporan/murid/01KRA3BCX6NATDBRSC01KXFYQ7?from=2026-01-01&to=2026-12-31').then(r=>r.json()).then(d=>({hasKel: d.kurikulum.some(t=>t.items.some(i=>'kelompokMateri' in i)), instansiKeys: Object.keys(d.instansi)}))"
```

Expected: `instansiKeys` includes `alamat` and `title`; `hasKel` reflects whether seed data has any kelompok (may be false if dogfood data has none — that is fine, the field is `omitempty`).

- [ ] **Step 3: Browser pass — letterhead**

- Go to Pengaturan → Instansi, fill Alamat + Judul laporan, Save (expect success toast).
- Open Achievement → Reports, pick a murid, render → kop shows the address line and the uppercase title line. Screenshot.

- [ ] **Step 4: Browser pass — curriculum tree**

- Default state: only groups containing changed-in-period items are expanded; others collapsed showing header + counts + `●` changed badge + progress bar.
- Expand/collapse a tema, a sub-tema, a kelompok individually.
- Buka semua → all levels open; Tutup semua → all collapse to tema headers.
- Switch murid/period → open-state resets to the changed-in-period default.
- `console --errors` clean. Screenshot of a collapsed + an expanded state.

- [ ] **Step 5: Browser pass — print + xlsx**

- Print preview (emulate print media): page 1 shows full kop; collapsed groups appear as single summary header lines; expanded groups print in full; chevrons + Buka/Tutup hidden. If a report spans 2+ pages, pages 2+ show only the slim running header (murid · periode) with no full-kop repeat and no double header on page 1. Tune `@page margin-top` / running-head padding if the first content line collides with the header. Screenshot the print emulation.
- Download xlsx → valid `Microsoft Excel 2007+`; open the Kurikulum sheet header row → has `Tema, Sub Tema, Kelompok, Materi, Status, Berubah Dlm Periode, Tanggal`.

- [ ] **Step 6: Final typecheck + Go build**

```bash
cd web/app && npm run typecheck && cd ../..
podman run --rm -v "$PWD":/src -w /src golang:1.25-alpine \
  sh -c 'apk add --no-cache gcc musl-dev >/dev/null && go vet ./internal/handler/ && go test ./internal/...'
```

Expected: both clean/PASS.

- [ ] **Step 7: Push + open PR against `gnrs-evan`**

```bash
git push -u origin feat/laporan-tree
gh pr create --base gnrs-evan --head feat/laporan-tree \
  --title "feat(laporan): interactive curriculum tree + custom letterhead + print running header" \
  --body "$(cat <<'EOF'
## What
- Curriculum section of Laporan Rapor is now an interactive tema → sub-tema → kelompok tree (collapsible; default-open only groups with changed-in-period items; Buka/Tutup semua).
- Editable letterhead in Pengaturan → Instansi: Alamat + Judul laporan, rendered on the report kop.
- Slim running header on printed pages 2+ (page 1 keeps the full kop).
- Backend: additive `kelompokMateri` on laporan items + `alamat`/`title` in the `instansi` block; xlsx Kurikulum sheet gains a Kelompok column. No migration.

Spec: docs/superpowers/specs/2026-06-12-laporan-kurikulum-tree-design.md
Plan: docs/superpowers/plans/2026-06-12-laporan-kurikulum-tree.md

## Known limitation
Printed page numbers are left to the browser's print footer — `window.print()` cannot drive CSS `counter(page)` outside page-margin boxes. The running header carries name · periode, not a page count.

## Tested via Chrome DevTools
(filled in from the Task 7 browser pass — letterhead, tree expand/collapse, default-open, print preview pages 1 vs 2+, xlsx Kelompok column; rebuilt on :8300; screenshots attached)
EOF
)"
```

- [ ] **Step 8: Merge once green**

```bash
gh pr merge <num> --merge --delete-branch
```

(Match `gnrs-evan` history — merge commits, like PR #8.)

- [ ] **Step 9: Cleanup**

From the main checkout (`/home/anchor/Podman/GNRS`):

```bash
git -C /home/anchor/Podman/GNRS worktree remove .claude/worktrees/laporan-tree
git -C /home/anchor/Podman/GNRS branch -D feat/laporan-tree
git -C /home/anchor/Podman/GNRS fetch --prune origin
git -C /home/anchor/Podman/GNRS worktree list   # confirm gone
```

(No `gnrs-dev-<slug>` container was created — the operator-preference rebuild uses the main `gnrs` container, which stays.)

- [ ] **Step 10: Update vault**

Update `OBTA/GNRS/GNRS.md` head + add a PR highlight line for the tree/letterhead/print-header feature, same as the PR #8 sync.

---

## Self-Review

- **Spec coverage:** tree grouping (T5) ✓; default-open-changed (T5) ✓; WYSIWYG print via conditional children (T5/T6) ✓; missing-level fall-through (T4 helper `buildTema`) ✓; Excel stays complete + Kelompok column (T1) ✓; custom letterhead in Settings (T3) + kop render (T4) ✓; slim running header page 2+ (T6) ✓; additive backend fields only (T1/T2) ✓; i18n id/en parity (T3/T5) ✓.
- **Placeholders:** none — every code step shows full code; the PR-body "Tested" section is intentionally filled at delivery time from the real browser pass (T7), not a code placeholder.
- **Type consistency:** `LaporanItem.kelompokMateri?` (T2) is read by `buildTema` (T5); `instansi.alamat/title` (T2) read in kop (T4) and settings (T3); helper node types (`Counts`/`KelNode`/`SubNode`/`TemaNode`) defined once in T5 and used by `KurikulumTree`/`GroupHeader`; `instansi_alamat`/`instansi_title` setting keys match between handler read (T1), settings save (T3), and load (T3).
- **Testing realism:** no vitest/handler harness introduced (repo has none); backend verified via live API (T7 S2), frontend via browser pass (T7 S3-5) — consistent with PR #8 and the spec's Testing section.
