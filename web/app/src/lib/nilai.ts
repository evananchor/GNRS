// Rubrik PROMES: <60 Kurang, 60–74 Cukup, 75–89 Baik, ≥90 Amat Baik.
export function hurufFromAngka(n: number): string {
  if (n >= 90) return 'Amat Baik'
  if (n >= 75) return 'Baik'
  if (n >= 60) return 'Cukup'
  return 'Kurang'
}
